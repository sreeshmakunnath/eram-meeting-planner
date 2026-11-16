import { and, asc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, fmtDateTime, Notice, PageHeader } from "@/components/ui";
import { fmtPlainDate } from "@/lib/meetings";
import { db, schema } from "@/db";
import { transferOpenBids } from "@/lib/actions/bids";
import { sendPasswordLink, setUserStatus, unlockUser, updateUser } from "@/lib/actions/users";
import { canControlBid, canManageUser, userBuIds } from "@/lib/access";
import { requireAdmin, type SessionUser } from "@/lib/auth";
import { BID_STAGE_LABEL, OPEN_BID_STAGES } from "@/lib/bids";
import { activeUsers } from "@/lib/queries";
import { UserForm } from "../user-form";

const messages: Record<string, { tone: "ok" | "error"; text: string }> = {
  created: { tone: "ok", text: "User created. A welcome email with a set-password link has been sent." },
  created_pw: { tone: "ok", text: "User created with the password you set. They can sign in now; a welcome email with their username has been sent." },
  activated: { tone: "ok", text: "User activated." },
  deactivated: { tone: "ok", text: "User deactivated. They can no longer sign in; their history is kept." },
  unlocked: { tone: "ok", text: "Account unlocked." },
  linksent: { tone: "ok", text: "Password link emailed." },
  self: { tone: "error", text: "You can't deactivate your own account." },
  lastadmin: { tone: "error", text: "This is the last active Super Admin. Make someone else Super Admin first." },
  hasbids: { tone: "error", text: "This user still owns open bids. Transfer them to someone else first (below), then deactivate." },
};

/**
 * The person's open bids, for handing over (e.g. when they leave). Only bids this Admin may edit are listed by
 * name; the rest are only counted, so nothing about another unit's bids is shown.
 */
async function OpenBids({ me, userId, name }: { me: SessionUser; userId: number; name: string }) {
  const b = schema.bids;
  const open = await db
    .select({ id: b.id, title: b.title, stage: b.stage, closingDate: b.closingDate, businessUnitId: b.businessUnitId, ownerId: b.ownerId, client: schema.clients.name })
    .from(b)
    .innerJoin(schema.clients, eq(b.clientId, schema.clients.id))
    .where(and(eq(b.ownerId, userId), inArray(b.stage, OPEN_BID_STAGES)))
    .orderBy(asc(b.closingDate));
  const mine: typeof open = [];
  for (const bid of open) if (await canControlBid(me, bid)) mine.push(bid);
  // Only bids this Admin may edit: nothing shows that others exist
  if (!mine.length) return null;
  // New owner: active members of every unit these bids are in
  const units = [...new Set(mine.map((x) => x.businessUnitId))];
  const candidates = (await activeUsers()).filter((u) => u.id !== userId && units.every((bu) => u.buIds.map(Number).includes(bu)));
  return (
    <section className="card mb-4 p-4">
      <h2 className="font-semibold text-navy">Open bids owned by {name}</h2>
      <p className="mt-1 text-sm text-slate-600">
        Hand these to someone else before deactivating this user. The new owner gets access; {name} loses it.
        {" "}Bids in units you don&apos;t administer, if there are any, aren&apos;t shown here: their unit&apos;s Admins are notified when the user is deactivated.
      </p>
      {mine.length > 0 && (
        <div className="mt-3 grid gap-4 lg:grid-cols-12">
          <ul className="divide-y divide-slate-100 text-sm lg:col-span-8">
            {mine.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <Link href={`/bids/${x.id}`} className="link truncate">
                  {x.title}
                </Link>
                <span className="text-xs text-slate-500">
                  {x.client} · {BID_STAGE_LABEL[x.stage]} · closes {fmtPlainDate(x.closingDate)}
                </span>
              </li>
            ))}
          </ul>
          <div className="lg:col-span-4">
            <ActionForm action={transferOpenBids.bind(null, userId)} className="space-y-2">
              <label className="block">
                <span className="label">New owner *</span>
                <select name="toUserId" className="input" required defaultValue="">
                  <option value="">Select…</option>
                  {candidates.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-slate-500">
                  {candidates.length ? "Active members of the bids' business units." : "Nobody else is an active member of all these bids' units. Transfer them one by one from each bid."}
                </span>
              </label>
              <SubmitButton>Transfer {mine.length} bid{mine.length === 1 ? "" : "s"}</SubmitButton>
            </ActionForm>
          </div>
        </div>
      )}
    </section>
  );
}

export default async function EditUserPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const me = await requireAdmin();
  const id = Number(params.id);
  const [user] = Number.isInteger(id) ? await db.select().from(schema.users).where(eq(schema.users.id, id)) : [];
  if (!user) notFound();
  if (!(await canManageUser(me, id))) redirect("/admin/users?msg=denied");
  const [memberships, buIds, managers] = await Promise.all([
    db.select().from(schema.groupMembers).where(eq(schema.groupMembers.userId, id)),
    userBuIds(id),
    db.select({ id: schema.userManagers.managerId }).from(schema.userManagers).where(eq(schema.userManagers.userId, id)),
  ]);
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
      <OpenBids me={me} userId={id} name={user.fullName} />
      <UserForm me={me} action={updateUser} user={user} groupIds={memberships.map((m) => m.groupId)} buIds={buIds} managerIds={managers.map((m) => m.id)} />
    </>
  );
}
