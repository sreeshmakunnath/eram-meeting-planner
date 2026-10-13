import { eq } from "drizzle-orm";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { changePassword, updateProfile } from "@/lib/actions/auth";
import { requireUser } from "@/lib/auth";

export default async function ProfilePage() {
  const me = await requireUser();
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, me.id),
    with: { branch: true, businessUnit: true },
  });
  if (!user) return null;
  return (
    <>
      <PageHeader title="My profile" subtitle={`${user.email} · ${user.branch.name}${user.businessUnit ? ` · ${user.businessUnit.name}` : ""}`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <ActionForm action={updateProfile} className="card space-y-4 p-6">
          <h2 className="font-semibold text-navy">Details</h2>
          <Field label="Full name">
            <input name="fullName" className="input" defaultValue={user.fullName} maxLength={100} required />
          </Field>
          <Field label="Mobile number">
            <input name="mobile" className="input" defaultValue={user.mobile ?? ""} maxLength={20} />
          </Field>
          <p className="text-xs text-slate-500">Role, branch and email are managed by an Admin.</p>
          <SubmitButton>Save</SubmitButton>
        </ActionForm>
        <ActionForm action={changePassword} className="card space-y-4 p-6">
          <h2 className="font-semibold text-navy">Change password</h2>
          <Field label="Current password">
            <input name="current" type="password" className="input" autoComplete="current-password" required />
          </Field>
          <Field label="New password" hint="At least 8 characters, with an upper-case letter, a number and a symbol.">
            <input name="password" type="password" className="input" autoComplete="new-password" required />
          </Field>
          <Field label="Confirm new password">
            <input name="confirm" type="password" className="input" autoComplete="new-password" required />
          </Field>
          <SubmitButton>Change password</SubmitButton>
        </ActionForm>
      </div>
    </>
  );
}
