"use client";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import type { ImportResult } from "@/lib/actions/import";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" disabled={pending}>
      {pending ? "Importing…" : "Import"}
    </button>
  );
}

export function ImportForm({ action }: { action: (s: ImportResult | undefined, fd: FormData) => Promise<ImportResult> }) {
  const [state, formAction] = useFormState(action, undefined);
  return (
    <div className="space-y-4">
      <form action={formAction} className="card flex flex-wrap items-center gap-3 p-5">
        <input type="file" name="file" accept=".xlsx" required className="text-sm" />
        <Submit />
      </form>
      {state?.error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{state.error}</div>}
      {state && !state.error && (
        <div className="card space-y-2 p-5 text-sm">
          <p className="font-semibold text-navy">
            Imported {state.created} meeting{state.created === 1 ? "" : "s"}
            {state.skipped ? `, skipped ${state.skipped} already in the planner` : ""}.
          </p>
          {!!state.clientsCreated?.length && <p>New clients added to the client master: {state.clientsCreated.join(", ")}.</p>}
          {!!state.clientsLinked?.length && (
            <p className="text-amber-800">
              Names linked to an existing client because they look alike: {state.clientsLinked.join("; ")}. If any link is wrong, edit that meeting and pick the right client.
            </p>
          )}
          {!!state.unmatchedPeople?.length && (
            <p className="text-amber-800">
              Names not matched to users (kept in each meeting&apos;s notes): {state.unmatchedPeople.join(", ")}. Add them as users, then edit the meetings to pick them as attendees.
            </p>
          )}
          <Link href="/meetings?status=ALL" className="link">
            Open the planner →
          </Link>
        </div>
      )}
    </div>
  );
}
