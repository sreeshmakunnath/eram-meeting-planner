"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { checkClientName } from "@/lib/actions/clients";
import type { ClientNameMatches } from "@/lib/client-names";

/**
 * Client name input with a live duplicate check within the client's business unit: the same name (any case)
 * is flagged as already existing; similar names are listed with a "This is a different company" tick box,
 * which the server also requires before saving. The unit is `unitId`, or else the form's businessUnitId
 * select (followed as it changes). Other units may have a client of the same name.
 */
export function ClientNameField({
  name,
  defaultValue = "",
  excludeId,
  required = true,
  unitId,
  defaultUnitId,
}: {
  name: string;
  defaultValue?: string;
  excludeId?: number;
  required?: boolean;
  /** Fixed unit; when omitted the form's businessUnitId field is read. */
  unitId?: number | null;
  /** The record's current unit, so keeping its own name there isn't flagged. */
  defaultUnitId?: number | null;
}) {
  const [value, setValue] = useState(defaultValue);
  const [matches, setMatches] = useState<ClientNameMatches | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [formUnit, setFormUnit] = useState<number | null>(null);

  // Follow the form's business unit select
  useEffect(() => {
    if (unitId !== undefined) return;
    const form = input.current?.form;
    if (!form) return;
    const read = () => {
      const el = form.elements.namedItem("businessUnitId") as HTMLSelectElement | HTMLInputElement | null;
      setFormUnit(el?.value ? Number(el.value) : null);
    };
    read();
    form.addEventListener("change", read);
    return () => form.removeEventListener("change", read);
  }, [unitId]);
  const buId = unitId !== undefined ? unitId : (formUnit ?? defaultUnitId ?? null);

  useEffect(() => {
    const v = value.trim();
    // Nothing to check for a short name, no unit yet, or an existing client keeping its own name in its unit.
    if (v.length < 2 || !buId || (v.toLowerCase() === defaultValue.trim().toLowerCase() && buId === (defaultUnitId ?? buId))) {
      setMatches(null);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      checkClientName(v, buId, excludeId)
        .then((m) => live && setMatches(m))
        .catch(() => live && setMatches(null)); // the server check still runs on save
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [value, excludeId, defaultValue, buId, defaultUnitId]);

  return (
    <div>
      <input ref={input} name={name} className="input" value={value} onChange={(e) => setValue(e.target.value)} maxLength={150} required={required} autoComplete="off" />
      {matches?.exact && (
        <p className="mt-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          <b>{matches.exact.name}</b> already exists in this business unit.{" "}
          <Link href={`/clients/${matches.exact.id}`} className="font-semibold underline" target="_blank">
            Open it
          </Link>{" "}
          instead of adding it again.
        </p>
      )}
      {!matches?.exact && !!matches?.similar.length && (
        <div className="mt-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p>
            Similar client{matches.similar.length === 1 ? "" : "s"} already in this business unit:{" "}
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
