"use client";
import { useEffect, useRef } from "react";
import { useFormState } from "react-dom";
import { SubmitButton, type ActionState } from "@/components/action-form";
import { saveLog } from "@/lib/actions/daily-log";
import { ACTIVITY_LABEL, ACTIVITY_TYPES, DURATIONS } from "@/lib/daily-log-labels";

type Option = { id: number; name: string };
export type LogFormOptions = { clients: Option[]; tasks: Option[]; meetings: Option[]; today: string; minDate: string };
type Entry = { id: number; logDate: string; type: string; description: string; minutes: number | null; clientId: number | null; taskId: number | null; meetingId: number | null };

/**
 * Add or edit a daily log entry. `compact` is the one-row dashboard version (today, no task / meeting links).
 * After adding, the form clears so the next entry can be typed straight away.
 */
export function LogForm({ options, entry, compact = false, defaults = {} }: { options: LogFormOptions; entry?: Entry; compact?: boolean; defaults?: { clientId?: number; taskId?: number } }) {
  const [state, action] = useFormState<ActionState, FormData>(saveLog, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && !entry) ref.current?.reset();
  }, [state, entry]);
  const select = (name: string, label: string, list: Option[], value: number | null | undefined) => (
    <select name={name} className="input" defaultValue={value ?? ""} aria-label={label}>
      <option value="">{label}</option>
      {list.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
  const duration = (
    <select name="minutes" className="input" defaultValue={entry?.minutes ?? ""} aria-label="Time spent">
      <option value="">Time (optional)</option>
      {DURATIONS.map(([m, l]) => (
        <option key={m} value={m}>
          {l}
        </option>
      ))}
      {entry?.minutes && !DURATIONS.some(([m]) => m === entry.minutes) && <option value={entry.minutes}>{entry.minutes} min</option>}
    </select>
  );
  const type = (
    <select name="type" className="input" defaultValue={entry?.type ?? ""} required aria-label="Activity type">
      <option value="" disabled>
        Activity type…
      </option>
      {ACTIVITY_TYPES.map((t) => (
        <option key={t} value={t}>
          {ACTIVITY_LABEL[t]}
        </option>
      ))}
    </select>
  );
  const message = (state?.error || state?.ok) && (
    <p className={`text-sm ${state.error ? "text-red-700" : "text-emerald-700"}`}>{state.error ?? state.ok}</p>
  );

  if (compact)
    return (
      <form ref={ref} action={action} className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-[11rem_1fr_12rem_9rem_auto]">
          {type}
          <input name="description" className="input" placeholder="What did you do? e.g. Called SABIC procurement about the RFQ" maxLength={2000} required />
          {select("clientId", "Client (optional)", options.clients, defaults.clientId)}
          {duration}
          <SubmitButton>Log</SubmitButton>
        </div>
        {message}
      </form>
    );

  return (
    <form ref={ref} action={action} className="space-y-3">
      {entry && <input type="hidden" name="id" value={entry.id} />}
      <div className="grid gap-3 sm:grid-cols-[10rem_12rem_1fr_10rem]">
        <input type="date" name="logDate" className="input" defaultValue={entry?.logDate ?? options.today} min={entry ? undefined : options.minDate} max={options.today} required aria-label="Date" />
        {type}
        {select("clientId", "Client (optional)", options.clients, entry?.clientId ?? defaults.clientId)}
        {duration}
      </div>
      <textarea name="description" className="input" rows={2} defaultValue={entry?.description} placeholder="What did you do? Who did you speak to, what came out of it?" maxLength={2000} required />
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          {select("taskId", "Related task (optional)", options.tasks, entry?.taskId ?? defaults.taskId)}
          {select("meetingId", "Related meeting (optional)", options.meetings, entry?.meetingId)}
        </div>
        <SubmitButton>{entry ? "Save" : "Add to log"}</SubmitButton>
      </div>
      {message}
    </form>
  );
}
