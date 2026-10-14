"use client";
import { useFormState, useFormStatus } from "react-dom";
import type { TargetImportResult } from "@/lib/actions/target";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-secondary" disabled={pending}>
      {pending ? "Importing…" : "Import sheet"}
    </button>
  );
}

export function TargetImportForm({ action }: { action: (s: TargetImportResult | undefined, fd: FormData) => Promise<TargetImportResult> }) {
  const [state, formAction] = useFormState(action, undefined);
  return (
    <details className="card mb-4 p-4" open={!!state}>
      <summary className="cursor-pointer text-sm font-semibold text-navy">Import a BD Target Schedule sheet (.xlsx)</summary>
      <form action={formAction} className="mt-3 flex flex-wrap items-center gap-3">
        <input type="file" name="file" accept=".xlsx" required className="text-sm" />
        <input name="batch" placeholder="Batch (read from the title if empty)" className="input max-w-xs" />
        <Submit />
      </form>
      <p className="mt-2 text-xs text-slate-500">
        Each company gets four tasks — Market research, MIR report, Approach, Follow-up — with the sheet&apos;s deadlines, owners and statuses. Running it again updates those tasks.
      </p>
      {state?.error && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{state.error}</div>}
      {state && !state.error && (
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
          {state.batch}: {state.clients} companies, {state.created} tasks created, {state.updated} updated.
          {!!state.clientsCreated?.length && <> New clients: {state.clientsCreated.join(", ")}.</>}
          {!!state.unmatched?.length && <span className="block text-amber-800">Owners not matched to users: {state.unmatched.join(", ")} (noted on the tasks).</span>}
        </div>
      )}
    </details>
  );
}
