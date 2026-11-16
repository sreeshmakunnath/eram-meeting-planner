"use server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { FormError, req, str, toFormError } from "@/lib/form";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { consumeToken, findValidToken } from "@/lib/tokens";
import { sendResetEmail } from "@/lib/auth-emails";

export async function requestPasswordReset(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, "email")?.toLowerCase();
  if (email) {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    if (user && user.status === "ACTIVE") {
      await sendResetEmail(user);
      await audit(user.id, "PASSWORD_RESET_REQUESTED", "user", user.id);
    }
  }
  // Same answer either way, so the form can't be used to discover which emails exist.
  return { ok: "If that email belongs to an active account, a reset link is on its way." };
}

export async function setPassword(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const raw = req(fd, "token", "Token");
    const password = String(fd.get("password") ?? "");
    if (password !== String(fd.get("confirm") ?? "")) throw new FormError("Passwords don't match.");
    const problem = passwordProblem(password);
    if (problem) throw new FormError(problem);
    const token = await findValidToken(raw);
    if (!token) throw new FormError("This link is invalid or expired. Request a new one.");
    await db
      .update(schema.users)
      .set({ passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null })
      .where(eq(schema.users.id, token.userId));
    await consumeToken(token.id);
    await audit(token.userId, token.type === "SET_PASSWORD" ? "PASSWORD_SET" : "PASSWORD_RESET", "user", token.userId);
  } catch (e) {
    return toFormError(e);
  }
  redirect("/login?reset=1");
}

export async function changePassword(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const me = await requireUser();
    const current = String(fd.get("current") ?? "");
    const password = String(fd.get("password") ?? "");
    if (password !== String(fd.get("confirm") ?? "")) throw new FormError("New passwords don't match.");
    const problem = passwordProblem(password);
    if (problem) throw new FormError(problem);
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, me.id));
    if (!user?.passwordHash || !(await verifyPassword(current, user.passwordHash)))
      throw new FormError("Current password is incorrect.");
    await db.update(schema.users).set({ passwordHash: await hashPassword(password) }).where(eq(schema.users.id, me.id));
    await audit(me.id, "PASSWORD_CHANGED", "user", me.id);
    return { ok: "Password changed." };
  } catch (e) {
    return toFormError(e);
  }
}

export async function updateProfile(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const me = await requireUser();
    const fullName = req(fd, "fullName", "Full name");
    const mobile = str(fd, "mobile");
    if (mobile && !/^\+?[0-9 ]{7,20}$/.test(mobile)) throw new FormError("Mobile number should be digits, e.g. +966 5X XXX XXXX.");
    await db.update(schema.users).set({ fullName, mobile, updatedById: me.id }).where(eq(schema.users.id, me.id));
    await audit(me.id, "PROFILE_UPDATED", "user", me.id);
    return { ok: "Profile saved." };
  } catch (e) {
    return toFormError(e);
  }
}
