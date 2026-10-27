import { eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { ActionForm, SubmitButton, type ActionState } from "@/components/action-form";
import { CheckboxList } from "@/components/checkbox-list";
import { Field } from "@/components/ui";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";
import { allowedBuIds } from "@/lib/access";
import { isSuperAdmin, type SessionUser } from "@/lib/auth";
import { activeBranches, activeBusinessUnits, activeGroups, activeUsers } from "@/lib/queries";

export async function UserForm({
  me,
  action,
  user,
  groupIds = [],
  buIds = [],
}: {
  me: SessionUser;
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  user?: User;
  groupIds?: number[];
  buIds?: number[];
}) {
  const [branches, allBus, allUsers, groups] = await Promise.all([activeBranches(), activeBusinessUnits(), activeUsers(), activeGroups()]);
  // BU Admins grant only their own units; the user's other units are listed and kept on save.
  const allowed = allowedBuIds(me, allBus.map((b) => b.id));
  const bus = allBus.filter((b) => allowed.includes(b.id));
  const outside = buIds.filter((id) => !allowed.includes(id));
  const otherBus = outside.length ? await db.select().from(schema.businessUnits).where(inArray(schema.businessUnits.id, outside)) : [];
  // Keep the user's current primary unit selectable even if it's inactive or outside the Admin's units, so the form can still be saved.
  const current = user?.businessUnitId && !bus.some((b) => b.id === user.businessUnitId)
    ? await db.select().from(schema.businessUnits).where(eq(schema.businessUnits.id, user.businessUnitId))
    : [];
  const buOptions = [...bus, ...current.map((b) => ({ ...b, name: b.active ? b.name : `${b.name} (inactive)` }))];
  // Reporting manager: people in the Admin's units (plus the current manager)
  const users = isSuperAdmin(me)
    ? allUsers
    : allUsers.filter((u) => u.buIds.some((b) => me.buIds.includes(b)) || u.id === user?.managerId);
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
            <option value="ADMIN">Admin (manages their business units)</option>
            {isSuperAdmin(me) && <option value="SUPER_ADMIN">Super Admin (parent company, sees everything)</option>}
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
        <Field label="Primary business unit *" hint="Home unit; new clients they add default to it.">
          <select name="businessUnitId" className="input" defaultValue={user?.businessUnitId ?? (bus.length === 1 ? bus[0].id : "")} required>
            <option value="">Select business unit</option>
            {buOptions.map((b) => (
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
        <Field
          label={user ? "New password" : "Password"}
          hint={
            user
              ? "Leave blank to keep the current password."
              : "Optional. Leave blank to email the user a link to set their own. 8+ characters with an upper-case letter, a number and a symbol."
          }
        >
          <input name="password" type="password" className="input" autoComplete="new-password" maxLength={100} />
        </Field>
        <Field label={user ? "Confirm new password" : "Confirm password"}>
          <input name="confirmPassword" type="password" className="input" autoComplete="new-password" maxLength={100} />
        </Field>
        <div>
          <span className="label">Business unit access</span>
          <CheckboxList name="businessUnitIds" options={bus.map((b) => ({ id: b.id, label: b.name }))} selected={buIds} empty="No business units yet." />
          <p className="mt-1 text-xs text-slate-500">
            They see the clients and meetings of these units. The primary unit is always included.
            {otherBus.length > 0 && <> Also has {otherBus.map((b) => b.name).join(", ")} (kept as is).</>}
          </p>
        </div>
        <div>
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
        <SubmitButton>{user ? "Save changes" : "Create user"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
