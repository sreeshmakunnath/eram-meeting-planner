import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CheckboxList } from "@/components/checkbox-list";
import { Field, labelize } from "@/components/ui";
import type { Client } from "@/db/schema";
import { saveClient } from "@/lib/actions/clients";
import type { SessionUser } from "@/lib/auth";
import { activeBusinessUnits, activeGroups, activeUsers, BD_STAGE_LABELS, BD_STAGES, CLIENT_TYPES, INDUSTRIES } from "@/lib/queries";

export async function ClientForm({ me, client, buIds = [] }: { me: SessionUser; client?: Client; buIds?: number[] }) {
  const [users, groups, bus] = await Promise.all([activeUsers(), activeGroups(), activeBusinessUnits()]);
  return (
    <ActionForm action={saveClient} className="card p-6">
      {client && <input type="hidden" name="id" value={client.id} />}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Client name *">
          <input name="name" className="input" defaultValue={client?.name} maxLength={150} required />
        </Field>
        <Field label="Short code" hint="e.g. L&T, NMDC">
          <input name="shortCode" className="input" defaultValue={client?.shortCode ?? ""} maxLength={10} />
        </Field>
        <Field label="Client type *" hint="BD targets start as Prospect.">
          <select name="type" className="input" defaultValue={client?.type ?? "PROSPECT"}>
            {CLIENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {labelize(t)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Industry">
          <select name="industry" className="input" defaultValue={client?.industry ?? ""}>
            <option value="">—</option>
            {INDUSTRIES.map((i) => (
              <option key={i}>{i}</option>
            ))}
          </select>
        </Field>
        <Field label="Country *">
          <input name="country" className="input" defaultValue={client?.country ?? "Saudi Arabia"} maxLength={100} required list="countries" />
          <datalist id="countries">
            {["Saudi Arabia", "UAE", "Qatar", "Kuwait", "Bahrain", "Oman", "India", "Spain", "Italy"].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="City">
          <input name="city" className="input" defaultValue={client?.city ?? ""} maxLength={100} />
        </Field>
        <Field label="Website">
          <input name="website" className="input" defaultValue={client?.website ?? ""} placeholder="https://" maxLength={200} />
        </Field>
        <Field label="BD stage" hint="Feeds the target schedule report.">
          <select name="bdStage" className="input" defaultValue={client?.bdStage ?? ""}>
            <option value="">—</option>
            {BD_STAGES.map((s) => (
              <option key={s} value={s}>
                {BD_STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Account owner" hint="Main ERAM contact for this client.">
          <select name="accountOwnerId" className="input" defaultValue={client?.accountOwnerId ?? ""}>
            <option value="">—</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Account group" hint="Suggested attendees for this client's meetings.">
          <select name="accountGroupId" className="input" defaultValue={client?.accountGroupId ?? ""}>
            <option value="">—</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
        {me.role === "ADMIN" && (
          <Field label="Status">
            <select name="status" className="input" defaultValue={client?.status ?? "ACTIVE"}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive (hidden from dropdowns)</option>
              <option value="PENDING_REVIEW">Pending review</option>
            </select>
          </Field>
        )}
        <div className="md:col-span-2">
          <span className="label">Relevant business units</span>
          <CheckboxList name="businessUnitIds" options={bus.map((b) => ({ id: b.id, label: b.name }))} selected={buIds} />
        </div>
        <div className="md:col-span-2">
          <Field label="Notes">
            <textarea name="notes" className="input" rows={3} defaultValue={client?.notes ?? ""} />
          </Field>
        </div>
      </div>
      {me.role !== "ADMIN" && !client && (
        <p className="mt-4 text-sm text-slate-500">New clients you add are saved as Pending review until an Admin approves them.</p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Link href={client ? `/clients/${client.id}` : "/clients"} className="btn-secondary">
          Cancel
        </Link>
        <SubmitButton>{client ? "Save client" : "Add client"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
