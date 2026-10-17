"use client";
import Link from "next/link";
import { useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { ClientImportResult } from "@/lib/actions/client-import";

function Buttons({ setIntent }: { setIntent: (v: "check" | "import") => void }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex gap-2">
      <button className="btn-secondary" disabled={pending} onClick={() => setIntent("check")}>
        {pending ? "Working…" : "Check file"}
      </button>
      <button className="btn-primary" disabled={pending} onClick={() => setIntent("import")}>
        Import
      </button>
    </div>
  );
}

function IssueTable({ title, tone, rows }: { title: string; tone: "red" | "amber"; rows: { row: number; client: string; message: string }[] }) {
  if (!rows.length) return null;
  const cls = tone === "red" ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900";
  return (
    <div className={`rounded-md border ${cls}`}>
      <p className="px-4 py-2 font-semibold">{title}</p>
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-black/5 align-top">
                <td className="w-20 whitespace-nowrap px-4 py-1.5 tabular-nums">Row {r.row}</td>
                <td className="w-56 px-2 py-1.5 font-medium">{r.client}</td>
                <td className="px-2 py-1.5">{r.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ClientImportForm({ action }: { action: (s: ClientImportResult | undefined, fd: FormData) => Promise<ClientImportResult> }) {
  const [state, formAction] = useFormState(action, undefined);
  const intent = useRef<HTMLInputElement>(null);
  const n = (list?: unknown[]) => list?.length ?? 0;

  return (
    <div className="space-y-4">
      <form action={formAction} className="card space-y-3 p-5">
        <input ref={intent} type="hidden" name="intent" defaultValue="check" />
        <div className="flex flex-wrap items-center gap-3">
          <input type="file" name="file" accept=".xlsx" required className="text-sm" />
          <Buttons setIntent={(v) => intent.current && (intent.current.value = v)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" name="allowSimilar" /> Import near-matches as new clients (only if you&apos;re sure they&apos;re different companies)
        </label>
      </form>

      {state?.error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{state.error}</div>}

      {state && !state.error && (
        <div className="card space-y-3 p-5 text-sm">
          <p className="text-base font-semibold text-navy">
            {state.checkOnly ? "Check result: nothing has been saved yet." : "Import finished."}
          </p>
          <ul className="grid gap-2 sm:grid-cols-3">
            <li className="rounded-md border border-slate-200 px-3 py-2">
              <div className="text-2xl font-bold text-navy">{n(state.created)}</div>
              <div className="text-slate-500">{state.checkOnly ? "new clients to add" : "new clients added"}</div>
            </li>
            <li className="rounded-md border border-slate-200 px-3 py-2">
              <div className="text-2xl font-bold text-navy">{n(state.updated)}</div>
              <div className="text-slate-500">{state.checkOnly ? "existing clients to update" : "existing clients updated"}</div>
            </li>
            <li className="rounded-md border border-slate-200 px-3 py-2">
              <div className="text-2xl font-bold text-navy">{state.contactsAdded ?? 0}</div>
              <div className="text-slate-500">{state.checkOnly ? "contacts to add" : "contacts added"}</div>
            </li>
          </ul>
          {!!n(state.created) && (
            <p>
              <span className="font-medium">New:</span> {state.created!.join(", ")}
            </p>
          )}
          {!!n(state.updated) && (
            <p>
              <span className="font-medium">Updated:</span> {state.updated!.join(", ")}
            </p>
          )}

          <IssueTable title={`Not imported (${n(state.skipped)}): fix these rows and run again`} tone="red" rows={state.skipped ?? []} />
          <IssueTable
            title={`Possible duplicates held back (${n(state.similar)})`}
            tone="amber"
            rows={(state.similar ?? []).map((s) => ({ row: s.row, client: s.client, message: `Looks like existing "${s.existing}". Use that exact name to update it, or tick "Import near-matches" if it's a different company.` }))}
          />
          <IssueTable title={`${state.checkOnly ? "Notes" : "Imported with notes"} (${n(state.warnings)}): these rows go in, minus the item mentioned`} tone="amber" rows={state.warnings ?? []} />

          {state.checkOnly ? (
            n(state.created) + n(state.updated) > 0 && <p className="text-slate-600">If this looks right, click <b>Import</b> to save it.</p>
          ) : (
            <Link href="/clients?status=ALL" className="link">
              Open the client list →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
