import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CheckboxList } from "@/components/checkbox-list";
import { Field, labelize } from "@/components/ui";
import type { Group } from "@/db/schema";
import { saveGroup } from "@/lib/actions/groups";
import { activeUsers, GROUP_TYPES } from "@/lib/queries";

export async function GroupForm({ group, memberIds = [] }: { group?: Group; memberIds?: number[] }) {
  const users = await activeUsers();
  return (
    <ActionForm action={saveGroup} className="card p-6">
      {group && <input type="hidden" name="id" value={group.id} />}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Group name *" hint='e.g. "BD Team", "Dammam Branch", "Lamprell Account Team"'>
          <input name="name" className="input" defaultValue={group?.name} maxLength={100} required />
        </Field>
        <Field label="Group type *">
          <select name="type" className="input" defaultValue={group?.type ?? ""} required>
            <option value="">Select type</option>
            {GROUP_TYPES.map((t) => (
              <option key={t} value={t}>
                {labelize(t)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Group lead" hint="Gets group summary emails (later phase). Added as a member automatically.">
          <select name="leadUserId" className="input" defaultValue={group?.leadUserId ?? ""}>
            <option value="">—</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status" hint="Archived groups can't receive new assignments.">
          <select name="status" className="input" defaultValue={group?.status ?? "ACTIVE"}>
            <option value="ACTIVE">Active</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </Field>
        <div className="md:col-span-2">
          <Field label="Description">
            <textarea name="description" className="input" rows={2} defaultValue={group?.description ?? ""} maxLength={500} />
          </Field>
        </div>
        <div className="md:col-span-2">
          <span className="label">Members * (new members get an email)</span>
          <CheckboxList name="memberIds" options={users.map((u) => ({ id: u.id, label: u.fullName, hint: u.email }))} selected={memberIds} />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Link href={group ? `/groups/${group.id}` : "/groups"} className="btn-secondary">
          Cancel
        </Link>
        <SubmitButton>{group ? "Save group" : "Create group"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
