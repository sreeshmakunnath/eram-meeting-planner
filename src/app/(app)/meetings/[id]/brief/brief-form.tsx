"use client";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { ActionState } from "@/components/action-form";

type Owner = { value: string; label: string };
type ActionRow = { key: number; action: string; owner: string; deadline: string };

export type BriefDefaults = {
  meetingId: number;
  clientAttendees: string;
  discussionPoints: string;
  outcomes: string;
  documentsUsed: string;
  nextFollowUpDate: string;
  actions: Omit<ActionRow, "key">[];
};

function Buttons() {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <button type="submit" name="intent" value="draft" disabled={pending} className="btn-secondary">
        Save draft
      </button>
      <button type="submit" name="intent" value="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving…" : "Submit brief & email attendees"}
      </button>
    </div>
  );
}

const Section = ({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) => (
  <div className="grid gap-2 border-t border-slate-100 py-4 md:grid-cols-4 md:gap-6">
    <div>
      <div className="text-sm font-semibold text-navy">{title}</div>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
    </div>
    <div className="md:col-span-3">{children}</div>
  </div>
);

export function BriefForm({
  action,
  defaults,
  attendees,
  owners,
  header,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  defaults: BriefDefaults;
  attendees: { userId: number; name: string; attended: boolean | null }[];
  owners: Owner[];
  header: { k: string; v: string }[];
}) {
  const [state, formAction] = useFormState(action, undefined);
  const [rows, setRows] = useState<ActionRow[]>(
    (defaults.actions.length ? defaults.actions : [{ action: "", owner: "", deadline: "" }]).map((a, i) => ({ ...a, key: i })),
  );
  const update = (key: number, patch: Partial<ActionRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <form action={formAction} className="card p-6">
      <input type="hidden" name="meetingId" value={defaults.meetingId} />
      {state?.error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{state.error}</div>}
      {state?.ok && <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{state.ok}</div>}

      <div className="mb-2 grid gap-x-6 gap-y-1 text-sm md:grid-cols-2">
        {header.map((h) => (
          <div key={h.k} className="flex gap-2">
            <span className="w-40 shrink-0 text-slate-500">{h.k}</span>
            <span>{h.v || "—"}</span>
          </div>
        ))}
      </div>

      <Section title="Client attendees" hint="Pre-filled from the meeting; edit to match who came.">
        <textarea name="clientAttendees" className="input" rows={2} defaultValue={defaults.clientAttendees} />
      </Section>
      <Section title="ERAM attendees" hint="Tick who attended.">
        {attendees.length ? (
          <div className="grid gap-1 sm:grid-cols-2">
            {attendees.map((a) => (
              <label key={a.userId} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="attended" value={a.userId} defaultChecked={a.attended !== false} className="accent-brand" />
                {a.name}
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No ERAM attendees on this meeting.</p>
        )}
      </Section>
      <Section title="Key discussion points *">
        <textarea name="discussionPoints" className="input" rows={5} defaultValue={defaults.discussionPoints} />
      </Section>
      <Section title="Documents / presentation used">
        <textarea name="documentsUsed" className="input" rows={2} defaultValue={defaults.documentsUsed} />
      </Section>
      <Section title="Key outcomes / opportunities">
        <textarea name="outcomes" className="input" rows={4} defaultValue={defaults.outcomes} />
      </Section>
      <Section title="Agreed actions" hint="Action, owner and deadline. These become tasks when the task planner arrives.">
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={r.key} className="grid gap-2 md:grid-cols-12">
              <input name="actionText" value={r.action} onChange={(e) => update(r.key, { action: e.target.value })} placeholder={`Action ${i + 1}`} className="input md:col-span-6" />
              <select name="actionOwner" value={r.owner} onChange={(e) => update(r.key, { owner: e.target.value })} className="input md:col-span-3">
                <option value="">Owner…</option>
                {owners.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <input type="date" name="actionDeadline" value={r.deadline} onChange={(e) => update(r.key, { deadline: e.target.value })} className="input md:col-span-2" />
              <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="text-sm text-red-600 hover:underline md:col-span-1" aria-label="Remove action">
                Remove
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setRows((rs) => [...rs, { key: Date.now(), action: "", owner: "", deadline: "" }])} className="text-sm font-medium text-brand hover:underline">
            + Add action
          </button>
        </div>
      </Section>
      <Section title="Next follow-up date" hint="On submit, a follow-up meeting is created as To Be Scheduled.">
        <input type="date" name="nextFollowUpDate" className="input max-w-xs" defaultValue={defaults.nextFollowUpDate} />
      </Section>
      <div className="border-t border-slate-100 pt-4">
        <Buttons />
      </div>
    </form>
  );
}
