import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ClientNameField } from "@/components/client-name-field";
import { Field, labelize } from "@/components/ui";
import type { Client } from "@/db/schema";
import { saveClient } from "@/lib/actions/clients";
import { UnitOwnerFields } from "./unit-owner-fields";
import { allowedBuIds } from "@/lib/access";
import { isAdmin, type SessionUser } from "@/lib/auth";
import { activeBusinessUnits, activeGroups, activeUsers, BD_STAGE_LABELS, BD_STAGES, CLIENT_TYPES, INDUSTRIES } from "@/lib/queries";

/** `limited`: the editor can fill in details but not change the account owner or business unit. */
export async function ClientForm({ me, client, limited = false }: { me: SessionUser; client?: Client; limited?: boolean }) {
  const [users, groups, allBus] = await Promise.all([activeUsers(), activeGroups(), activeBusinessUnits()]);
  // A client can be put only in one of the person's own units, and moved only out of one of them.
  const allowed = allowedBuIds(me, allBus.map((b) => b.id));
  const bus = allBus.filter((b) => allowed.includes(b.id));
  const current = client ? allBus.find((b) => b.id === client.businessUnitId) : undefined;
  const fixed = limited || (!!client && !allowed.includes(client.businessUnitId));
  return (
    <ActionForm action={saveClient} className="card p-6">
      {client && <input type="hidden" name="id" value={client.id} />}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Client name *">
          <ClientNameField name="name" defaultValue={client?.name ?? ""} excludeId={client?.id} unitId={fixed ? (client?.businessUnitId ?? null) : undefined} defaultUnitId={client?.businessUnitId ?? null} />
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
        <Field label="BD stage" hint="Shown on the BD tracker.">
          <select name="bdStage" className="input" defaultValue={client?.bdStage ?? ""}>
            <option value="">—</option>
            {BD_STAGES.map((s) => (
              <option key={s} value={s}>
                {BD_STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Target batch" hint='BD Target Schedule batch, e.g. "Batch 1".'>
          <input name="targetBatch" className="input" defaultValue={client?.targetBatch ?? ""} maxLength={50} list="batches" />
          <datalist id="batches">
            <option value="Batch 1" />
            <option value="Batch 2" />
            <option value="Batch 3" />
          </datalist>
        </Field>
        <UnitOwnerFields
          units={bus.map((b) => ({ id: b.id, name: b.name }))}
          defaultUnitId={client?.businessUnitId ?? (bus.length === 1 ? bus[0].id : null)}
          fixedUnit={fixed ? { id: client?.businessUnitId ?? 0, name: current?.name ?? "—" } : null}
          fixedHint={limited ? "Only an Admin, the account owner or their manager can change it." : "Only someone in this unit can move the client to another unit."}
          unitHint={client ? "Only people in this unit see the client. Moving it also moves its bids." : "Only people in this unit see the client. Its code is made from this unit."}
          owners={users.map((u) => ({ id: u.id, name: u.fullName, buIds: u.buIds }))}
          defaultOwnerId={client?.accountOwnerId ?? null}
          ownerLocked={limited}
        />
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
        {isAdmin(me) && (
          <Field label="Status">
            <select name="status" className="input" defaultValue={client?.status ?? "ACTIVE"}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive (hidden from dropdowns)</option>
              <option value="PENDING_REVIEW">Pending review</option>
            </select>
          </Field>
        )}
        <div className="md:col-span-2">
          <Field label="Notes">
            <textarea name="notes" className="input" rows={3} defaultValue={client?.notes ?? ""} />
          </Field>
        </div>
      </div>
      {!isAdmin(me) && !client && (
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
