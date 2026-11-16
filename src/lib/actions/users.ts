"use server";
import { and, eq, inArray, ne, notInArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { canControlBid, canManageUser, mergeBuIds, teamIds, userBuIds } from "@/lib/access";
import { isSuperAdmin, requireAdmin, type SessionUser } from "@/lib/auth";
import { FormError, int, ints, isEmail, req, str, toFormError } from "@/lib/form";
import { appUrl, button, esc, sendMail } from "@/lib/mail";
import { notify } from "@/lib/notifications";
import { OPEN_BID_STAGES } from "@/lib/bids";
import { hashPassword, passwordProblem } from "@/lib/password";
import { sendResetEmail, sendWelcomeEmail } from "@/lib/auth-emails";

function readUser(fd: FormData, actor: SessionUser) {
  const username = req(fd, "username", "Username").toLowerCase();
  if (!/^[a-z0-9._-]{3,50}$/.test(username))
    throw new FormError("Username: 3–50 characters, lowercase letters, numbers, dot, dash or underscore, no spaces.");
  const email = req(fd, "email", "Email ID").toLowerCase();
  if (!isEmail(email)) throw new FormError("Enter a valid email ID.");
  const picked = str(fd, "role");
  // Only a Super Admin can create another Super Admin.
  const role = picked === "SUPER_ADMIN" && isSuperAdmin(actor) ? ("SUPER_ADMIN" as const) : picked === "ADMIN" ? ("ADMIN" as const) : ("USER" as const);
  const branchId = int(fd, "branchId");
  if (!branchId) throw new FormError("Branch is required.");
  const businessUnitId = int(fd, "businessUnitId");
  if (!businessUnitId) throw new FormError("Primary business unit is required.");
  const mobile = str(fd, "mobile");
  if (mobile && !/^\+?[0-9 ]{7,20}$/.test(mobile)) throw new FormError("Mobile number should be digits, e.g. +966 5X XXX XXXX.");
  return {
    fullName: req(fd, "fullName", "Full name"),
    username,
    email,
    employeeId: str(fd, "employeeId"),
    role,
    branchId,
    businessUnitId,
    designation: str(fd, "designation"),
    mobile,
  };
}

/**
 * The business units the user can access: the ticked ones plus the primary unit. BU Admins can only grant or
 * remove their own units; the user's other units are kept.
 */
async function readBusinessUnits(fd: FormData, actor: SessionUser, primary: number, userId: number | null) {
  const existing = userId ? await userBuIds(userId) : [];
  const keepsPrimary = !isSuperAdmin(actor) && !actor.buIds.includes(primary) && existing.includes(primary);
  if (!isSuperAdmin(actor) && !actor.buIds.includes(primary) && !keepsPrimary) throw new FormError("Primary business unit must be one of your business units.");
  const { error, ids } = mergeBuIds(actor, [...new Set([...ints(fd, "businessUnitIds"), ...(keepsPrimary ? [] : [primary])])], existing, "user");
  if (error) throw new FormError(error);
  return [...new Set([...ids, primary])];
}

async function setBusinessUnits(userId: number, ids: number[]) {
  await db.delete(schema.userBusinessUnits).where(eq(schema.userBusinessUnits.userId, userId));
  await db.insert(schema.userBusinessUnits).values(ids.map((businessUnitId) => ({ userId, businessUnitId })));
}

/** Replaces the user's reporting managers. Nobody can manage themselves or someone above them (no loops). */
async function setManagers(userId: number | null, managerIds: number[]) {
  const ids = [...new Set(managerIds)];
  if (userId) {
    if (ids.includes(userId)) throw new FormError("A user can't be their own reporting manager.");
    const below = await teamIds(userId);
    if (ids.some((m) => below.includes(m))) throw new FormError("A manager can't be someone who reports to this user.");
  }
  return async (id: number) => {
    const before = (await db.select().from(schema.userManagers).where(eq(schema.userManagers.userId, id))).map((r) => r.managerId);
    await db.delete(schema.userManagers).where(eq(schema.userManagers.userId, id));
    if (ids.length) await db.insert(schema.userManagers).values(ids.map((managerId) => ({ userId: id, managerId })));
    return [...before].sort().join() !== [...ids].sort().join();
  };
}

/** Optional password typed by the Admin. Returns null when left blank. */
function readPassword(fd: FormData) {
  const password = (fd.get("password") as string | null) ?? "";
  const confirm = (fd.get("confirmPassword") as string | null) ?? "";
  if (!password && !confirm) return null;
  if (password !== confirm) throw new FormError("The two passwords don't match.");
  const problem = passwordProblem(password);
  if (problem) throw new FormError(problem);
  return password;
}

/** Welcome email for a user whose password the Admin set: no link, and never the password itself. */
async function sendAccountReadyEmail(user: { email: string; fullName: string; username: string }) {
  await sendMail(
    user.email,
    "Welcome to ERAM Meeting Planner",
    "Your account is ready",
    `<p>Hello ${esc(user.fullName)},</p><p>An account has been created for you on ERAM Meeting Planner. Your username is <b>${esc(user.username)}</b>.</p><p>Your administrator will give you your password. Please change it under <b>My profile</b> after you sign in.</p>${button(appUrl("/login"), "Sign in")}`,
  );
}

/** Adds the user to newly selected groups and emails them about each new group. */
async function syncMemberships(userId: number, email: string, fullName: string, groupIds: number[], actorId: number) {
  const current = await db.select().from(schema.groupMembers).where(eq(schema.groupMembers.userId, userId));
  const currentIds = current.map((m) => m.groupId);
  const toAdd = groupIds.filter((g) => !currentIds.includes(g));
  const toRemove = currentIds.filter((g) => !groupIds.includes(g));
  if (toRemove.length)
    await db.delete(schema.groupMembers).where(and(eq(schema.groupMembers.userId, userId), inArray(schema.groupMembers.groupId, toRemove)));
  if (toAdd.length) {
    await db.insert(schema.groupMembers).values(toAdd.map((groupId) => ({ groupId, userId })));
    const added = await db.select({ id: schema.groups.id, name: schema.groups.name }).from(schema.groups).where(inArray(schema.groups.id, toAdd));
    for (const g of added)
      await notify([userId], { kind: "GROUP_ADDED", title: `You were added to ${g.name}`, body: "Meetings and tasks for this group include you.", href: `/groups/${g.id}`, actorId });
    await sendMail(
      email,
      `You've been added to ${added.map((g) => g.name).join(", ")}`,
      "Added to a group",
      `<p>Hello ${esc(fullName)},</p><p>You are now a member of: <b>${added.map((g) => esc(g.name)).join(", ")}</b>. Meetings and tasks assigned to these groups will include you.</p>`,
    );
  }
  return { added: toAdd, removed: toRemove };
}

export async function createUser(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: number;
  let passwordSet = false;
  try {
    const admin = await requireAdmin();
    const data = readUser(fd, admin);
    const buIds = await readBusinessUnits(fd, admin, data.businessUnitId, null);
    const saveManagers = await setManagers(null, ints(fd, "managerIds"));
    const password = readPassword(fd);
    passwordSet = !!password;
    const [user] = await db
      .insert(schema.users)
      .values({ ...data, passwordHash: password ? await hashPassword(password) : null, createdById: admin.id, updatedById: admin.id })
      .returning();
    id = user.id;
    await setBusinessUnits(user.id, buIds);
    await saveManagers(user.id);
    await syncMemberships(user.id, user.email, user.fullName, ints(fd, "groupIds"), admin.id);
    if (password) await sendAccountReadyEmail(user);
    else await sendWelcomeEmail(user);
    await audit(admin.id, "USER_CREATED", "user", user.id, { username: user.username, role: user.role, businessUnits: buIds, passwordSetByAdmin: !!password });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/admin/users");
  redirect(`/admin/users/${id}?msg=${passwordSet ? "created_pw" : "created"}`);
}

export async function updateUser(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const id = int(fd, "id");
    if (!id) throw new FormError("Missing user.");
    if (!(await canManageUser(admin, id))) throw new FormError("You can only manage users who belong only to your business units. A Super Admin manages the others.");
    const data = readUser(fd, admin);
    const password = readPassword(fd);
    const [before] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    if (!before) throw new FormError("User not found.");
    if (id === admin.id && data.role !== admin.role) throw new FormError("You can't change your own role.");
    const buBefore = await userBuIds(id);
    const buIds = await readBusinessUnits(fd, admin, data.businessUnitId, id);
    const saveManagers = await setManagers(id, ints(fd, "managerIds"));
    await db.update(schema.users).set({ ...data, updatedById: admin.id }).where(eq(schema.users.id, id));
    await setBusinessUnits(id, buIds);
    const released = await releaseOutsideUnits(admin.id, id, buIds);
    const managersChanged = await saveManagers(id);
    if (password) {
      // A new password also clears any lockout so the user can sign in with it right away.
      await db.update(schema.users).set({ passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null }).where(eq(schema.users.id, id));
      await audit(admin.id, "PASSWORD_SET_BY_ADMIN", "user", id);
    }
    const groups = await syncMemberships(id, data.email, data.fullName, ints(fd, "groupIds"), admin.id);
    const changed = Object.keys(data).filter((k) => String(before[k as keyof typeof before] ?? "") !== String(data[k as keyof typeof data] ?? ""));
    if ([...buBefore].sort().join() !== [...buIds].sort().join()) changed.push("businessUnits");
    if (managersChanged) changed.push("managers");
    await audit(admin.id, "USER_UPDATED", "user", id, { changed, groupsAdded: groups.added, groupsRemoved: groups.removed });
    revalidatePath("/admin/users");
    const note = released.length ? ` They're no longer account owner of ${released.join(", ")} (outside their business units).` : "";
    return { ok: (password ? "User saved and password changed." : "User saved.") + note };
  } catch (e) {
    return toFormError(e);
  }
}

export async function setUserStatus(id: number, status: "ACTIVE" | "INACTIVE") {
  const admin = await requireAdmin();
  let leftOver: { id: number; businessUnitId: number }[] = [];
  if (!(await canManageUser(admin, id))) redirect("/admin/users?msg=denied");
  if (id === admin.id && status === "INACTIVE") redirect(`/admin/users/${id}?msg=self`);
  if (status === "INACTIVE") {
    // Keep at least one active Super Admin.
    const [target] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    if (target?.role === "SUPER_ADMIN") {
      const others = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(eq(schema.users.role, "SUPER_ADMIN"), eq(schema.users.status, "ACTIVE"), ne(schema.users.id, id)));
      if (!others.length) redirect(`/admin/users/${id}?msg=lastadmin`);
    }
    // Open bids must be handed over first, or nobody would be working on them. Only the bids this Admin may
    // edit are considered: the existence of bids in other units is never revealed to them. Those go to the
    // Admins of their units (and Super Admins) as a notice once the user is deactivated.
    const open = await db
      .select({ id: schema.bids.id, businessUnitId: schema.bids.businessUnitId, ownerId: schema.bids.ownerId })
      .from(schema.bids)
      .where(and(eq(schema.bids.ownerId, id), inArray(schema.bids.stage, OPEN_BID_STAGES)));
    for (const bid of open) if (await canControlBid(admin, bid)) redirect(`/admin/users/${id}?msg=hasbids`);
    leftOver = open;
  }
  await db.update(schema.users).set({ status, updatedById: admin.id }).where(eq(schema.users.id, id));
  await audit(admin.id, status === "ACTIVE" ? "USER_ACTIVATED" : "USER_DEACTIVATED", "user", id);
  if (leftOver.length) await tellUnitsToTransfer(id, leftOver);
  if (status === "INACTIVE") await db.delete(schema.bidTeam).where(eq(schema.bidTeam.userId, id));
  revalidatePath("/admin/users");
  redirect(`/admin/users/${id}?msg=${status === "ACTIVE" ? "activated" : "deactivated"}`);
}

export async function unlockUser(id: number) {
  const admin = await requireAdmin();
  if (!(await canManageUser(admin, id))) redirect("/admin/users?msg=denied");
  await db.update(schema.users).set({ failedLogins: 0, lockedUntil: null }).where(eq(schema.users.id, id));
  await audit(admin.id, "USER_UNLOCKED", "user", id);
  redirect(`/admin/users/${id}?msg=unlocked`);
}

export async function sendPasswordLink(id: number) {
  const admin = await requireAdmin();
  if (!(await canManageUser(admin, id))) redirect("/admin/users?msg=denied");
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  if (user) {
    if (user.passwordHash) await sendResetEmail(user);
    else await sendWelcomeEmail(user);
    await audit(admin.id, user.passwordHash ? "PASSWORD_RESET_SENT" : "WELCOME_RESENT", "user", id);
  }
  redirect(`/admin/users/${id}?msg=linksent`);
}

/**
 * A deactivated user still owns open bids the deactivating Admin couldn't see: tell the Admins of those units
 * and the Super Admins (each sees only the count for units they're allowed to see).
 */
async function tellUnitsToTransfer(userId: number, bids: { id: number; businessUnitId: number }[]) {
  const [user] = await db.select({ fullName: schema.users.fullName }).from(schema.users).where(eq(schema.users.id, userId));
  const units = [...new Set(bids.map((b) => b.businessUnitId))];
  const supers = (await db.select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.role, "SUPER_ADMIN"), eq(schema.users.status, "ACTIVE")))).map((u) => u.id);
  const body = (n: number) => `${user?.fullName ?? "A user"} was deactivated and still owns ${n} open bid${n === 1 ? "" : "s"}. Transfer ${n === 1 ? "it" : "them"} from their user page.`;
  for (const bu of units) {
    const n = bids.filter((b) => b.businessUnitId === bu).length;
    const admins = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .innerJoin(schema.userBusinessUnits, eq(schema.userBusinessUnits.userId, schema.users.id))
      .where(and(eq(schema.users.role, "ADMIN"), eq(schema.users.status, "ACTIVE"), eq(schema.userBusinessUnits.businessUnitId, bu)));
    await notify(admins.map((a) => a.id), { kind: "BIDS_TO_TRANSFER", title: "Open bids to transfer", body: body(n), href: `/admin/users/${userId}` });
  }
  await notify(supers, { kind: "BIDS_TO_TRANSFER", title: "Open bids to transfer", body: body(bids.length), href: `/admin/users/${userId}` });
}

/**
 * After a user's units change: they stop being account owner of clients outside their units (an account owner
 * must belong to the client's unit) and leave the bid teams of bids outside them. Returns the clients released.
 */
async function releaseOutsideUnits(actorId: number, userId: number, buIds: number[]) {
  const c = schema.clients;
  const outside = buIds.length ? notInArray(c.businessUnitId, buIds) : undefined;
  const cleared = await db
    .update(c)
    .set({ accountOwnerId: null })
    .where(and(eq(c.accountOwnerId, userId), outside))
    .returning({ id: c.id, name: c.name });
  for (const cl of cleared) await audit(actorId, "CLIENT_UPDATED", "client", cl.id, { name: cl.name, changed: ["accountOwnerId"], reason: "Account owner left the client's business unit" });
  const outsideBids = db
    .select({ id: schema.bids.id })
    .from(schema.bids)
    .where(buIds.length ? notInArray(schema.bids.businessUnitId, buIds) : undefined);
  await db.delete(schema.bidTeam).where(and(eq(schema.bidTeam.userId, userId), inArray(schema.bidTeam.bidId, outsideBids)));
  return cleared.map((x) => x.name);
}
