"use server";
import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { FormError, int, ints, isEmail, req, str, toFormError } from "@/lib/form";
import { appUrl, button, esc, sendMail } from "@/lib/mail";
import { notify } from "@/lib/notifications";
import { hashPassword, passwordProblem } from "@/lib/password";
import { sendResetEmail, sendWelcomeEmail } from "./auth";

function readUser(fd: FormData) {
  const username = req(fd, "username", "Username").toLowerCase();
  if (!/^[a-z0-9._-]{3,50}$/.test(username))
    throw new FormError("Username: 3–50 characters, lowercase letters, numbers, dot, dash or underscore, no spaces.");
  const email = req(fd, "email", "Email ID").toLowerCase();
  if (!isEmail(email)) throw new FormError("Enter a valid email ID.");
  const role = str(fd, "role") === "ADMIN" ? ("ADMIN" as const) : ("USER" as const);
  const branchId = int(fd, "branchId");
  if (!branchId) throw new FormError("Branch is required.");
  const businessUnitId = int(fd, "businessUnitId");
  if (!businessUnitId) throw new FormError("Business unit is required.");
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
    managerId: int(fd, "managerId"),
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
    const data = readUser(fd);
    const password = readPassword(fd);
    passwordSet = !!password;
    const [user] = await db
      .insert(schema.users)
      .values({ ...data, passwordHash: password ? await hashPassword(password) : null, createdById: admin.id, updatedById: admin.id })
      .returning();
    id = user.id;
    await syncMemberships(user.id, user.email, user.fullName, ints(fd, "groupIds"), admin.id);
    if (password) await sendAccountReadyEmail(user);
    else await sendWelcomeEmail(user);
    await audit(admin.id, "USER_CREATED", "user", user.id, { username: user.username, role: user.role, passwordSetByAdmin: !!password });
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
    const data = readUser(fd);
    const password = readPassword(fd);
    const [before] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    if (!before) throw new FormError("User not found.");
    if (id === admin.id && data.role !== "ADMIN") throw new FormError("You can't remove your own Admin role.");
    if (data.managerId === id) throw new FormError("A user can't be their own reporting manager.");
    await db.update(schema.users).set({ ...data, updatedById: admin.id }).where(eq(schema.users.id, id));
    if (password) {
      // A new password also clears any lockout so the user can sign in with it right away.
      await db.update(schema.users).set({ passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null }).where(eq(schema.users.id, id));
      await audit(admin.id, "PASSWORD_SET_BY_ADMIN", "user", id);
    }
    const groups = await syncMemberships(id, data.email, data.fullName, ints(fd, "groupIds"), admin.id);
    const changed = Object.keys(data).filter((k) => String(before[k as keyof typeof before] ?? "") !== String(data[k as keyof typeof data] ?? ""));
    await audit(admin.id, "USER_UPDATED", "user", id, { changed, groupsAdded: groups.added, groupsRemoved: groups.removed });
    revalidatePath("/admin/users");
    return { ok: password ? "User saved and password changed." : "User saved." };
  } catch (e) {
    return toFormError(e);
  }
}

export async function setUserStatus(id: number, status: "ACTIVE" | "INACTIVE") {
  const admin = await requireAdmin();
  if (id === admin.id && status === "INACTIVE") redirect(`/admin/users/${id}?msg=self`);
  if (status === "INACTIVE") {
    // Keep at least one active admin.
    const [target] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    if (target?.role === "ADMIN") {
      const others = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(eq(schema.users.role, "ADMIN"), eq(schema.users.status, "ACTIVE"), ne(schema.users.id, id)));
      if (!others.length) redirect(`/admin/users/${id}?msg=lastadmin`);
    }
  }
  await db.update(schema.users).set({ status, updatedById: admin.id }).where(eq(schema.users.id, id));
  await audit(admin.id, status === "ACTIVE" ? "USER_ACTIVATED" : "USER_DEACTIVATED", "user", id);
  revalidatePath("/admin/users");
  redirect(`/admin/users/${id}?msg=${status === "ACTIVE" ? "activated" : "deactivated"}`);
}

export async function unlockUser(id: number) {
  const admin = await requireAdmin();
  await db.update(schema.users).set({ failedLogins: 0, lockedUntil: null }).where(eq(schema.users.id, id));
  await audit(admin.id, "USER_UNLOCKED", "user", id);
  redirect(`/admin/users/${id}?msg=unlocked`);
}

export async function sendPasswordLink(id: number) {
  const admin = await requireAdmin();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  if (user) {
    if (user.passwordHash) await sendResetEmail(user);
    else await sendWelcomeEmail(user);
    await audit(admin.id, user.passwordHash ? "PASSWORD_RESET_SENT" : "WELCOME_RESENT", "user", id);
  }
  redirect(`/admin/users/${id}?msg=linksent`);
}
