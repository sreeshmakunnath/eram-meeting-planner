// Password emails. Deliberately NOT in a "use server" file: everything exported from one of those can be called
// from the browser, and these take any user and address, so they'd let anyone mail themselves a reset link.
import { appUrl, button, esc, sendMail } from "@/lib/mail";
import { createToken } from "@/lib/tokens";

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
