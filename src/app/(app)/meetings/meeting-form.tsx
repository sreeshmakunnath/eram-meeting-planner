"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ActionForm, SubmitButton, type ActionState } from "@/components/action-form";
import { ClientNameField } from "@/components/client-name-field";
import type { MeetingFormOptions } from "./form-options";

const STATUSES: [string, string][] = [
  ["TO_BE_SCHEDULED", "To Be Scheduled"],
  ["SCHEDULED", "Scheduled"],
  ["CONFIRMED", "Confirmed"],
  ["COMPLETED", "Completed"],
  ["POSTPONED", "Postponed"],
  ["CANCELLED", "Cancelled"],
];
const TYPES: [string, string][] = [
  ["CLIENT_MEETING", "Client Meeting"],
  ["FOLLOW_UP", "Follow-up"],
  ["PRESENTATION", "Presentation"],
  ["SITE_VISIT", "Site visit"],
  ["INTERNAL", "Internal"],
];
const MODES: [string, string][] = [
  ["IN_PERSON", "In person"],
  ["TEAMS", "Microsoft Teams"],
  ["ZOOM", "Zoom"],
  ["PHONE", "Phone"],
];
const DOC_SUGGESTIONS = ["Company profile", "Relevant service portfolio", "Relevant project references", "Client-specific presentation"];

export type MeetingDefaults = {
  id?: number;
  title?: string;
  priority?: string;
  clientId?: number | null;
  location?: string | null;
  mode?: string;
  venue?: string | null;
  clientContactsText?: string | null;
  type?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  status?: string;
  objective?: string;
  documents?: string | null;
  nextAction?: string | null;
  followUpDate?: string | null;
  notes?: string | null;
  userIds?: number[];
  groupIds?: number[];
  contactIds?: number[];
  businessUnitIds?: number[];
  ownerIds?: number[];
};

function Box({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <fieldset className="card p-5">
      <legend className="-ml-1 px-1 text-sm font-semibold text-navy">{title}</legend>
      {hint && <p className="-mt-1 mb-3 text-xs text-slate-500">{hint}</p>}
      {children}
    </fieldset>
  );
}

function L({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function Checks({ name, items, selected, onChange }: { name: string; items: { id: number; label: string; hint?: string }[]; selected: number[]; onChange?: (ids: number[]) => void }) {
  if (!items.length) return <div className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500">None available.</div>;
  return (
    <div className="max-h-52 space-y-0.5 overflow-y-auto rounded-md border border-slate-300 bg-white p-2">
      {items.map((o) => (
        <label key={o.id} className="flex cursor-pointer items-start gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
          <input
            type="checkbox"
            name={name}
            value={o.id}
            checked={selected.includes(o.id)}
            onChange={(e) => onChange?.(e.target.checked ? [...selected, o.id] : selected.filter((x) => x !== o.id))}
            className="mt-0.5 accent-brand"
          />
          <span>
            {o.label}
            {o.hint && <span className="block text-xs text-slate-500">{o.hint}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

export function MeetingForm({
  action,
  options,
  defaults = {},
  cancelHref,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  options: MeetingFormOptions;
  defaults?: MeetingDefaults;
  cancelHref: string;
}) {
  const isNew = !defaults.id;
  const [clientId, setClientId] = useState<string>(defaults.clientId ? String(defaults.clientId) : "");
  const [location, setLocation] = useState(defaults.location ?? "");
  const [contactIds, setContactIds] = useState<number[]>(defaults.contactIds ?? []);
  const [buIds, setBuIds] = useState<number[]>(defaults.businessUnitIds ?? []);
  const [groupIds, setGroupIds] = useState<number[]>(defaults.groupIds ?? []);
  const [userIds, setUserIds] = useState<number[]>(defaults.userIds ?? []);
  const [ownerIds, setOwnerIds] = useState<number[]>(defaults.ownerIds ?? []);
  const [date, setDate] = useState(defaults.date ?? "");
  const [status, setStatus] = useState(defaults.status ?? "TO_BE_SCHEDULED");
  const [documents, setDocuments] = useState(defaults.documents ?? "");
  const [mode, setMode] = useState(defaults.mode ?? "IN_PERSON");

  const client = useMemo(() => options.clients.find((c) => String(c.id) === clientId), [clientId, options.clients]);

  function pickClient(v: string) {
    setClientId(v);
    setContactIds([]);
    const c = options.clients.find((x) => String(x.id) === v);
    if (!c) return;
    // Pre-fill from the client master; on a new meeting also suggest the account team.
    if (!location || isNew) setLocation(c.location);
    if (isNew || !buIds.length) setBuIds(c.buIds);
    if (isNew && c.accountGroupId && !groupIds.includes(c.accountGroupId)) setGroupIds([...groupIds, c.accountGroupId]);
  }

  const addDoc = (d: string) => setDocuments((cur) => (cur.split(";").map((x) => x.trim()).includes(d) ? cur : cur ? `${cur}; ${d}` : d));
  const effectiveStatus = date && status === "TO_BE_SCHEDULED" ? "SCHEDULED" : status;

  return (
    <ActionForm action={action} className="space-y-5">
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}

      <Box title="Client & meeting">
        <div className="grid gap-4 md:grid-cols-3">
          <L label="Client / Company" className="md:col-span-2">
            <select name="clientId" className="input" value={clientId} onChange={(e) => pickClient(e.target.value)}>
              <option value="">— Internal / no client —</option>
              {options.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="new">+ Add new client…</option>
            </select>
          </L>
          <L label="Priority">
            <select name="priority" className="input" defaultValue={defaults.priority ?? "HIGH"}>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </L>
          {clientId === "new" && (
            <div className="grid gap-4 rounded-md border border-brand/20 bg-brand-50/50 p-3 md:col-span-3 md:grid-cols-2">
              <L label="New client name *">
                <ClientNameField name="newClientName" />
              </L>
              <L label="Country *">
                <input name="newClientCountry" className="input" defaultValue="Saudi Arabia" maxLength={100} />
              </L>
              <p className="text-xs text-slate-600 md:col-span-2">Saved to the client master. Clients added by Users wait for Admin review.</p>
            </div>
          )}
          <L label="Meeting type">
            <select name="type" className="input" defaultValue={defaults.type ?? "CLIENT_MEETING"}>
              {TYPES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </L>
          <L label="Title" className="md:col-span-2">
            <input name="title" className="input" defaultValue={defaults.title} maxLength={200} placeholder={`Leave blank for "${client?.name ?? "Client"} – Client Meeting"`} />
          </L>
          <L label="Country / Location">
            <input name="location" className="input" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={150} placeholder="e.g. Dammam, Saudi Arabia" />
          </L>
          <L label="Platform">
            <select name="mode" className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
              {MODES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </L>
          <L label={mode === "IN_PERSON" ? "Venue / address" : "Meeting link or number"}>
            <input name="venue" className="input" defaultValue={defaults.venue ?? ""} maxLength={300} />
          </L>
        </div>
      </Box>

      <Box title="Date & status" hint="Leave the date empty while the meeting is To Be Scheduled. Times are Saudi time (AST).">
        <div className="grid gap-4 md:grid-cols-4">
          <L label="Proposed date">
            <input type="date" name="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </L>
          <L label="Start time">
            <input type="time" name="startTime" className="input" defaultValue={defaults.startTime ?? "10:00"} disabled={!date} />
          </L>
          <L label="End time">
            <input type="time" name="endTime" className="input" defaultValue={defaults.endTime ?? "11:00"} disabled={!date} />
          </L>
          <L label="Status">
            <select name="status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </L>
        </div>
        {effectiveStatus !== status && <p className="mt-2 text-xs text-brand-600">A date is set, so this will be saved as Scheduled.</p>}
        {["SCHEDULED", "CONFIRMED"].includes(effectiveStatus) && date && (
          <p className="mt-2 text-xs text-slate-500">ERAM and client attendees get an email with a calendar invite (.ics) when you save, and an update when the details change.</p>
        )}
      </Box>

      <div className="grid gap-5 lg:grid-cols-2">
        <Box title="Client attendees">
          {client ? (
            <Checks
              name="contactIds"
              items={client.contacts.map((c) => ({ id: c.id, label: c.name, hint: [c.designation, c.hasEmail ? null : "no email, won't get the invite"].filter(Boolean).join(" · ") || undefined }))}
              selected={contactIds}
              onChange={setContactIds}
            />
          ) : (
            <p className="text-sm text-slate-500">{clientId === "new" ? "Add contacts on the client page after saving." : "Pick a client to choose its contacts."}</p>
          )}
          <L label="Other client attendees" className="mt-3">
            <input name="clientContactsText" className="input" defaultValue={defaults.clientContactsText ?? ""} maxLength={500} placeholder="Names not in the client's contact list" />
            <span className="mt-1 block text-xs text-slate-500">Include email addresses (e.g. Ahmed &lt;ahmed@client.com&gt;) to send them the invite.</span>
          </L>
        </Box>
        <Box title="ERAM attendees" hint="Pick groups, people, or both. Group members are added as attendees.">
          <span className="label">Groups</span>
          <Checks name="groupIds" items={options.groups.map((g) => ({ id: g.id, label: g.name }))} selected={groupIds} onChange={setGroupIds} />
          <span className="label mt-3">People</span>
          <Checks name="userIds" items={options.users.map((u) => ({ id: u.id, label: u.fullName, hint: u.email }))} selected={userIds} onChange={setUserIds} />
        </Box>
      </div>

      <Box title="Agenda & preparation">
        <div className="grid gap-4">
          <L label="Meeting objective / agenda *">
            <textarea name="objective" className="input" rows={3} defaultValue={defaults.objective} required placeholder="e.g. Discuss current business, requirements, and cross-BU opportunities" />
          </L>
          <div>
            <span className="label">Relevant business units</span>
            <Checks name="businessUnitIds" items={options.bus.map((b) => ({ id: b.id, label: b.name }))} selected={buIds} onChange={setBuIds} />
          </div>
          <L label="Presentation / documents">
            <textarea name="documents" className="input" rows={2} value={documents} onChange={(e) => setDocuments(e.target.value)} placeholder="Separate items with ;" />
          </L>
          <div className="-mt-2 flex flex-wrap gap-2">
            {DOC_SUGGESTIONS.map((d) => (
              <button type="button" key={d} onClick={() => addDoc(d)} className="rounded-full border border-slate-300 px-2.5 py-0.5 text-xs text-slate-600 hover:border-brand hover:text-brand">
                + {d}
              </button>
            ))}
          </div>
        </div>
      </Box>

      <Box title="Next action & follow-up">
        <div className="grid gap-4 md:grid-cols-3">
          <L label="Next action" className="md:col-span-2">
            <input name="nextAction" className="input" defaultValue={defaults.nextAction ?? ""} placeholder="e.g. Confirm date/time and attendees; prepare presentation" />
          </L>
          <L label="Follow-up date">
            <input type="date" name="followUpDate" className="input" defaultValue={defaults.followUpDate ?? ""} />
          </L>
          <div className="md:col-span-3">
            <span className="label">Action owner(s)</span>
            <Checks name="ownerIds" items={options.users.map((u) => ({ id: u.id, label: u.fullName }))} selected={ownerIds} onChange={setOwnerIds} />
          </div>
          <L label="Notes" className="md:col-span-3">
            <textarea name="notes" className="input" rows={2} defaultValue={defaults.notes ?? ""} />
          </L>
        </div>
      </Box>

      <div className="flex justify-end gap-2">
        <Link href={cancelHref} className="btn-secondary">
          Cancel
        </Link>
        <SubmitButton>{isNew ? "Save meeting" : "Save changes"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
