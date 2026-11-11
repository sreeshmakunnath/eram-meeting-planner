"use client";

import { useState, useTransition } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Field } from "@/components/ui";
import {
  addVendorDocument,
  createVendorRegistration,
  deleteVendorRegistration,
  removeVendorDocument,
  revealVendorPassword,
  updateVendorRegistration,
} from "@/lib/actions/vendor-registrations";
import { VENDOR_REG_LABEL, VENDOR_REG_STATUSES, VENDOR_REG_TONE, type VendorRegStatus } from "@/lib/vendor-reg";

export type VendorReg = {
  id: number;
  title: string;
  status: VendorRegStatus;
  assigneeId: number | null;
  assignee: string | null;
  dueDate: string | null;
  portalUrl: string | null;
  portalUsername: string | null;
  hasPassword: boolean;
  vendorCode: string | null;
  notes: string | null;
  completedAt: string | null;
  updatedAt: string;
  canWork: boolean;
  documents: { id: number; name: string; url: string | null; addedBy: string | null; createdAt: string }[];
};

type Person = { id: number; fullName: string };

const day = (s: string) => new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Riyadh" });

/** The steps as a progress line; Hold sits outside the line and just flags the registration. */
function Steps({ status }: { status: VendorRegStatus }) {
  const line = VENDOR_REG_STATUSES.filter((s) => s !== "ON_HOLD");
  const at = line.indexOf(status as (typeof line)[number]);
  return (
    <ol className="flex flex-wrap gap-1 text-[11px]">
      {line.map((s, i) => (
        <li
          key={s}
          className={`rounded px-1.5 py-0.5 ${i < at || status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : i === at ? "bg-brand text-white" : "bg-slate-100 text-slate-500"}`}
        >
          {VENDOR_REG_LABEL[s]}
        </li>
      ))}
      {status === "ON_HOLD" && <li className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">On hold</li>}
    </ol>
  );
}

function PasswordField({ clientId, reg }: { clientId: number; reg: VendorReg }) {
  return (
    <div className="space-y-1">
      {reg.hasPassword && <RevealOnly clientId={clientId} regId={reg.id} />}
      <input name="portalPassword" type="password" autoComplete="new-password" className="input" placeholder={reg.hasPassword ? "New password (leave blank to keep)" : "Password"} maxLength={200} />
      {reg.hasPassword && (
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" name="clearPassword" className="accent-brand" /> Remove the saved password
        </label>
      )}
    </div>
  );
}

function AssigneeSelect({ people, value }: { people: Person[]; value?: number | null }) {
  return (
    <select name="assigneeId" className="input" defaultValue={value ?? ""}>
      <option value="">Unassigned</option>
      {people.map((p) => (
        <option key={p.id} value={p.id}>
          {p.fullName}
        </option>
      ))}
    </select>
  );
}

function RegistrationCard({ clientId, reg, manage, people }: { clientId: number; reg: VendorReg; manage: boolean; people: Person[] }) {
  const [editing, setEditing] = useState(false);
  const overdue = reg.dueDate && reg.status !== "COMPLETED" && reg.dueDate < new Date().toISOString().slice(0, 10);
  return (
    <section className="card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-navy">{reg.title}</h3>
            <Badge tone={VENDOR_REG_TONE[reg.status]}>{VENDOR_REG_LABEL[reg.status]}</Badge>
          </div>
          <div className="text-xs text-slate-500">
            {reg.assignee ? `Assigned to ${reg.assignee}` : "Unassigned"}
            {reg.dueDate && <span className={overdue ? "font-medium text-red-600" : ""}> · due {day(reg.dueDate)}</span>}
            {reg.completedAt && <> · completed {day(reg.completedAt)}</>}
            {" · updated "}
            {day(reg.updatedAt)}
          </div>
          <Steps status={reg.status} />
        </div>
        {reg.canWork && (
          <button type="button" onClick={() => setEditing((e) => !e)} className="btn-secondary py-1 text-sm">
            {editing ? "Close" : "Update"}
          </button>
        )}
      </header>

      <div className="grid gap-4 p-4 md:grid-cols-2">
        {/* Portal */}
        <div className="space-y-2 text-sm">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Portal</h4>
          {editing ? (
            <ActionForm action={updateVendorRegistration.bind(null, clientId, reg.id)} className="space-y-3">
              <Field label="Status *">
                <select name="status" className="input" defaultValue={reg.status} required>
                  {VENDOR_REG_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {VENDOR_REG_LABEL[s]}
                    </option>
                  ))}
                </select>
              </Field>
              {manage && (
                <>
                  <Field label="Title">
                    <input name="title" className="input" defaultValue={reg.title} maxLength={150} />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Assigned to">
                      <AssigneeSelect people={people} value={reg.assigneeId} />
                    </Field>
                    <Field label="Due date">
                      <input name="dueDate" type="date" className="input" defaultValue={reg.dueDate ?? ""} />
                    </Field>
                  </div>
                </>
              )}
              <Field label="Portal URL">
                <input name="portalUrl" type="url" className="input" defaultValue={reg.portalUrl ?? ""} placeholder="https://" maxLength={500} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Username">
                  <input name="portalUsername" className="input" defaultValue={reg.portalUsername ?? ""} autoComplete="off" maxLength={200} />
                </Field>
                <div>
                  <span className="label">Password</span>
                  <PasswordField clientId={clientId} reg={reg} />
                </div>
              </div>
              <Field label="Vendor code" hint="The supplier number the client gives once registered">
                <input name="vendorCode" className="input" defaultValue={reg.vendorCode ?? ""} maxLength={100} />
              </Field>
              <Field label="Notes">
                <textarea name="notes" className="input min-h-[4rem]" defaultValue={reg.notes ?? ""} maxLength={4000} />
              </Field>
              <div className="flex justify-end">
                <SubmitButton>Save</SubmitButton>
              </div>
            </ActionForm>
          ) : (
            <dl className="space-y-2">
              <div>
                <dt className="text-xs text-slate-500">URL</dt>
                <dd>
                  {reg.portalUrl ? (
                    <a href={reg.portalUrl} target="_blank" rel="noreferrer" className="link break-all">
                      {reg.portalUrl.replace(/^https?:\/\//, "")}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Username</dt>
                <dd>{reg.portalUsername ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Password</dt>
                <dd>
                  {!reg.hasPassword ? "—" : reg.canWork ? <RevealOnly clientId={clientId} regId={reg.id} /> : <span className="text-slate-500">Saved (only the assignee and managers can see it)</span>}
                </dd>
              </div>
              {reg.vendorCode && (
                <div>
                  <dt className="text-xs text-slate-500">Vendor code</dt>
                  <dd>{reg.vendorCode}</dd>
                </div>
              )}
              {reg.notes && (
                <div>
                  <dt className="text-xs text-slate-500">Notes</dt>
                  <dd className="whitespace-pre-wrap">{reg.notes}</dd>
                </div>
              )}
            </dl>
          )}
        </div>

        {/* Documents */}
        <div className="space-y-2 text-sm">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Documents ({reg.documents.length})</h4>
          {reg.documents.length === 0 ? (
            <p className="text-slate-500">No documents yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
              {reg.documents.map((d) => (
                <li key={d.id} className="flex items-start justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noreferrer" className="link">
                        {d.name}
                      </a>
                    ) : (
                      d.name
                    )}
                    <div className="text-xs text-slate-500">
                      {d.addedBy ?? "—"} · {day(d.createdAt)}
                    </div>
                  </div>
                  {reg.canWork && (
                    <form action={removeVendorDocument.bind(null, clientId, reg.id, d.id)}>
                      <button className="text-xs text-red-600 hover:underline">Remove</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
          {reg.canWork && (
            <ActionForm action={addVendorDocument.bind(null, clientId, reg.id)} className="space-y-2 rounded-md bg-slate-50 p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <input name="name" className="input" placeholder="Document name, e.g. CR copy" maxLength={200} required />
                <input name="url" type="url" className="input" placeholder="SharePoint link" maxLength={1000} required />
              </div>
              <div className="flex justify-end">
                <SubmitButton variant="secondary">Add document</SubmitButton>
              </div>
            </ActionForm>
          )}
        </div>
      </div>

      {manage && editing && (
        <footer className="flex justify-end border-t border-slate-100 px-4 py-2">
          <form
            action={deleteVendorRegistration.bind(null, clientId, reg.id)}
            onSubmit={(e) => {
              if (!confirm(`Delete "${reg.title}" and its document links?`)) e.preventDefault();
            }}
          >
            <button className="text-xs text-red-600 hover:underline">Delete registration</button>
          </form>
        </footer>
      )}
    </section>
  );
}

/** Read-only view of the password: masked, with Show / Copy / Hide. */
function RevealOnly({ clientId, regId }: { clientId: number; regId: number }) {
  const [shown, setShown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <code className="rounded bg-slate-100 px-2 py-0.5">{shown ?? "••••••••"}</code>
      {shown == null ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await revealVendorPassword(clientId, regId);
              setError(r.error ?? null);
              setShown(r.password ?? null);
            })
          }
          className="text-xs text-brand hover:underline"
        >
          {pending ? "…" : "Show"}
        </button>
      ) : (
        <>
          <button type="button" onClick={() => navigator.clipboard?.writeText(shown).then(() => setCopied(true), () => {})} className="text-xs text-brand hover:underline">
            {copied ? "Copied" : "Copy"}
          </button>
          <button type="button" onClick={() => (setShown(null), setCopied(false))} className="text-xs text-slate-500 hover:underline">
            Hide
          </button>
        </>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

export function VendorRegistrations({ clientId, regs, manage, people }: { clientId: number; regs: VendorReg[]; manage: boolean; people: Person[] }) {
  return (
    <div className="space-y-4">
      {regs.length === 0 && (
        <div className="card px-4 py-8 text-center text-sm text-slate-500">
          No vendor registration with this client yet.{!manage && " The account owner, an Admin or a manager can start one."}
        </div>
      )}
      {regs.map((r) => (
        <RegistrationCard key={r.id} clientId={clientId} reg={r} manage={manage} people={people} />
      ))}
      {manage && (
        <details className="card" open={regs.length === 0}>
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-navy">Start a vendor registration</summary>
          <ActionForm action={createVendorRegistration.bind(null, clientId)} className="border-t border-slate-100 p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Title" hint="e.g. the portal or entity, if there's more than one">
                <input name="title" className="input" defaultValue="Vendor registration" maxLength={150} />
              </Field>
              <Field label="Assign to">
                <AssigneeSelect people={people} />
              </Field>
              <Field label="Due date">
                <input name="dueDate" type="date" className="input" />
              </Field>
            </div>
            <Field label="Notes">
              <textarea name="notes" className="input min-h-[3rem]" maxLength={4000} />
            </Field>
            <div className="mt-3 flex justify-end">
              <SubmitButton>Start</SubmitButton>
            </div>
          </ActionForm>
        </details>
      )}
    </div>
  );
}
