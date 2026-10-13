"use server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { FormError, req, str, toFormError } from "@/lib/form";
import { appUrl, button, esc, sendMail } from "@/lib/mail";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { consumeToken, createToken, findValidToken } from "@/lib/tokens";

export async function sendResetEmail(user: { id: number; email: string; fullName: string }) {
  const token = await createToken(user.id, "RESET_PASSWORD", 30);
  await sendMail(
    user.email,
    "Reset your ERAM Meeting Planner password",
    "Reset your password",
    `<p>Hello ${esc(user.fullName)},</p><p>We received a request to reset your password. The link below is valid for 30 minutes and can be used once.</p>${button(appUrl(`/set-password?token=${token}`), "Reset password")}<p>If you didn't ask for this, you can ignore this email.</p>`,
  );
}

export async function sendWelcomeEmail(user: { id: number; email: string; fullName: string; username: string }) {
  // Welcome links last 72 hours so new staff have time to act on them.
  const token = await createToken(user.id, "SET_PASSWORD", 72 * 60);
  await sendMail(
    user.email,
    "Welcome to ERAM Meeting Planner",
    "Your account is ready",
    `<p>Hello ${esc(user.fullName)},</p><p>An account has been created for you on ERAM Meeting Planner. Your username is <b>${esc(user.username)}</b>.</p><p>Set your password to sign in (link valid for 72 hours):</p>${button(appUrl(`/set-password?token=${token}`), "Set password")}`,
  );
}

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
