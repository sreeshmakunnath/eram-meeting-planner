import Link from "next/link";
import { ActionForm, SubmitButton, type ActionState } from "@/components/action-form";
import { CheckboxList } from "@/components/checkbox-list";
import { Field } from "@/components/ui";
import type { User } from "@/db/schema";
import { activeBranches, activeBusinessUnits, activeGroups, activeUsers } from "@/lib/queries";

export async function UserForm({
  action,
  user,
  groupIds = [],
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  user?: User;
  groupIds?: number[];
}) {
  const [branches, bus, users, groups] = await Promise.all([activeBranches(), activeBusinessUnits(), activeUsers(), activeGroups()]);
  return (
    <ActionForm action={action} className="card p-6">
      {user && <input type="hidden" name="id" value={user.id} />}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Full name *">
          <input name="fullName" className="input" defaultValue={user?.fullName} maxLength={100} required />
        </Field>
        <Field label="Username *" hint="Lowercase, no spaces. Can be used to sign in.">
          <input name="username" className="input" defaultValue={user?.username} maxLength={50} required />
        </Field>
        <Field label="Email ID *" hint="Used for sign-in and notifications.">
          <input name="email" type="email" className="input" defaultValue={user?.email} maxLength={150} required />
        </Field>
        <Field label="Employee ID">
          <input name="employeeId" className="input" defaultValue={user?.employeeId ?? ""} maxLength={20} />
        </Field>
        <Field label="Role *">
          <select name="role" className="input" defaultValue={user?.role ?? "USER"}>
            <option value="USER">User</option>
            <option value="ADMIN">Admin</option>
          </select>
        </Field>
        <Field label="Branch *">
          <select name="branchId" className="input" defaultValue={user?.branchId ?? ""} required>
            <option value="">Select branch</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Business unit / Department">
          <select name="businessUnitId" className="input" defaultValue={user?.businessUnitId ?? ""}>
            <option value="">—</option>
            {bus.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Designation">
          <input name="designation" className="input" defaultValue={user?.designation ?? ""} maxLength={100} />
        </Field>
        <Field label="Mobile number" hint="e.g. +966 5X XXX XXXX">
          <input name="mobile" className="input" defaultValue={user?.mobile ?? ""} maxLength={20} />
        </Field>
        <Field label="Reporting manager">
          <select name="managerId" className="input" defaultValue={user?.managerId ?? ""}>
            <option value="">—</option>
            {users
              .filter((u) => u.id !== user?.id)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
          </select>
        </Field>
        <div className="md:col-span-2">
          <span className="label">Groups</span>
          <CheckboxList
            name="groupIds"
            options={groups.map((g) => ({ id: g.id, label: g.name }))}
            selected={groupIds}
            empty="No groups yet. Create groups under Groups."
          />
        </div>
      </div>
      <div className="mt-6 flex items-center justify-end gap-2">
        <Link href="/admin/users" className="btn-secondary">
          Cancel
        </Link>
        <SubmitButton>{user ? "Save changes" : "Create user and send welcome email"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
