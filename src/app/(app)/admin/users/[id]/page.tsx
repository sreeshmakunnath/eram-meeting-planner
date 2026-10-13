import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Badge, fmtDateTime, Notice, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { sendPasswordLink, setUserStatus, unlockUser, updateUser } from "@/lib/actions/users";
import { requireAdmin } from "@/lib/auth";
import { UserForm } from "../user-form";

const messages: Record<string, { tone: "ok" | "error"; text: string }> = {
  created: { tone: "ok", text: "User created. A welcome email with a set-password link has been sent." },
  activated: { tone: "ok", text: "User activated." },
  deactivated: { tone: "ok", text: "User deactivated. They can no longer sign in; their history is kept." },
  unlocked: { tone: "ok", text: "Account unlocked." },
  linksent: { tone: "ok", text: "Password link emailed." },
  self: { tone: "error", text: "You can't deactivate your own account." },
  lastadmin: { tone: "error", text: "This is the last active Admin. Make someone else Admin first." },
};

export default async function EditUserPage({ params, searchParams }: { params: { id: string }; searchParams: { msg?: string } }) {
  await requireAdmin();
  const id = Number(params.id);
  const [user] = Number.isInteger(id) ? await db.select().from(schema.users).where(eq(schema.users.id, id)) : [];
  if (!user) notFound();
  const memberships = await db.select().from(schema.groupMembers).where(eq(schema.groupMembers.userId, id));
  const locked = user.lockedUntil && user.lockedUntil > new Date();
  const msg = searchParams.msg ? messages[searchParams.msg] : undefined;

  return (
    <>
      <PageHeader
        title={user.fullName}
        subtitle={`Last sign-in: ${fmtDateTime(user.lastLoginAt)} · Created ${fmtDateTime(user.createdAt)}`}
        actions={
          <>
            <Badge tone={user.status === "ACTIVE" ? "green" : "gray"}>{user.status === "ACTIVE" ? "Active" : "Inactive"}</Badge>
            {locked && <Badge tone="red">Locked</Badge>}
            {!user.passwordHash && <Badge tone="amber">Password not set</Badge>}
          </>
        }
      />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="mb-4 flex flex-wrap gap-2">
        <form action={sendPasswordLink.bind(null, id)}>
          <button className="btn-secondary">{user.passwordHash ? "Email password reset link" : "Resend welcome email"}</button>
        </form>
        {locked && (
          <form action={unlockUser.bind(null, id)}>
            <button className="btn-secondary">Unlock account</button>
          </form>
        )}
        <form action={setUserStatus.bind(null, id, user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE")}>
          <button className={user.status === "ACTIVE" ? "btn-danger" : "btn-secondary"}>
            {user.status === "ACTIVE" ? "Deactivate user" : "Activate user"}
          </button>
        </form>
      </div>
      <UserForm action={updateUser} user={user} groupIds={memberships.map((m) => m.groupId)} />
    </>
  );
}
