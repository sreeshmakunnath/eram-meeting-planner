"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { checkClientName } from "@/lib/actions/clients";
import type { ClientNameMatches } from "@/lib/client-names";

/**
 * Client name input with a live duplicate check: the same name (any case) is flagged as already
 * existing; similar names are listed with a "This is a different company" tick box, which the
 * server also requires before saving.
 */
export function ClientNameField({ name, defaultValue = "", excludeId, required = true }: { name: string; defaultValue?: string; excludeId?: number; required?: boolean }) {
  const [value, setValue] = useState(defaultValue);
  const [matches, setMatches] = useState<ClientNameMatches | null>(null);

  useEffect(() => {
    const v = value.trim();
    // Nothing to check for a short name, or an existing client keeping its own name.
    if (v.length < 2 || v.toLowerCase() === defaultValue.trim().toLowerCase()) {
      setMatches(null);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      checkClientName(v, excludeId)
        .then((m) => live && setMatches(m))
        .catch(() => live && setMatches(null)); // the server check still runs on save
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [value, excludeId, defaultValue]);

  return (
    <div>
      <input name={name} className="input" value={value} onChange={(e) => setValue(e.target.value)} maxLength={150} required={required} autoComplete="off" />
      {matches?.exact && (
        <p className="mt-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          <b>{matches.exact.name}</b> already exists.{" "}
          <Link href={`/clients/${matches.exact.id}`} className="font-semibold underline" target="_blank">
            Open it
          </Link>{" "}
          instead of adding it again.
        </p>
      )}
      {!matches?.exact && !!matches?.similar.length && (
        <div className="mt-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p>
            Similar client{matches.similar.length === 1 ? "" : "s"} already in the master:{" "}
            {matches.similar.map((s, i) => (
              <span key={s.id}>
                {i > 0 && ", "}
                <Link href={`/clients/${s.id}`} className="font-semibold underline" target="_blank">
                  {s.name}
                </Link>
              </span>
            ))}
            .
          </p>
          <label className="mt-1.5 flex items-center gap-2 font-medium">
            <input type="checkbox" name="confirmDifferent" required /> This is a different company
          </label>
        </div>
      )}
    </div>
  );
}
