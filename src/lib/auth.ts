import { eq, or } from "drizzle-orm";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { audit } from "./audit";
import { verifyPassword } from "./password";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    // Microsoft sign-in can be added later as a second provider (next-auth/providers/azure-ad).
    CredentialsProvider({
      name: "Email and password",
      credentials: { login: { label: "Email or username" }, password: { label: "Password", type: "password" } },
      async authorize(credentials) {
        const login = credentials?.login?.trim().toLowerCase();
        const password = credentials?.password ?? "";
        if (!login || !password) return null;

        const [user] = await db
          .select()
          .from(schema.users)
          .where(or(eq(schema.users.email, login), eq(schema.users.username, login)));

        if (!user) {
          await audit(null, "LOGIN_FAILED", "user", null, { login, reason: "unknown user" });
          return null;
        }
        if (user.status !== "ACTIVE") {
          await audit(user.id, "LOGIN_FAILED", "user", user.id, { reason: "inactive" });
          throw new Error("This account is inactive. Contact your administrator.");
        }
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          throw new Error(`Account locked after ${MAX_FAILED} failed attempts. Try again after ${LOCK_MINUTES} minutes or ask an admin to unlock it.`);
        }
        if (!user.passwordHash) {
          throw new Error("Password not set yet. Use the link in your welcome email, or Forgot password.");
        }

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) {
          const failed = user.failedLogins + 1;
          const lock = failed >= MAX_FAILED;
          await db
            .update(schema.users)
            .set({
              failedLogins: lock ? 0 : failed,
              lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : user.lockedUntil,
            })
            .where(eq(schema.users.id, user.id));
          await audit(user.id, lock ? "ACCOUNT_LOCKED" : "LOGIN_FAILED", "user", user.id, { attempt: failed });
          if (lock) throw new Error(`Account locked for ${LOCK_MINUTES} minutes after ${MAX_FAILED} failed attempts.`);
          return null;
        }

        await db
          .update(schema.users)
          .set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() })
          .where(eq(schema.users.id, user.id));
        await audit(user.id, "LOGIN", "user", user.id);
        return { id: String(user.id), name: user.fullName, email: user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = Number(user.id);
        token.role = user.role;
        return token;
      }
      // On later requests, re-read role and status so admin changes apply without re-login.
      // Runs server-side only (middleware decodes the token without calling this).
      if (token.uid) {
        const [u] = await db
          .select({ role: schema.users.role, status: schema.users.status, fullName: schema.users.fullName })
          .from(schema.users)
          .where(eq(schema.users.id, token.uid));
        if (!u || u.status !== "ACTIVE") token.inactive = true;
        else {
          token.role = u.role;
          token.name = u.fullName;
          token.inactive = false;
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        id: token.uid!,
        name: token.name ?? "",
        email: token.email ?? "",
        role: token.role ?? "USER",
      };
      if (token.inactive) (session as { inactive?: boolean }).inactive = true;
      return session;
    },
  },
};

export type SessionUser = { id: number; name: string; email: string; role: "ADMIN" | "USER" };

/** For server components and actions: returns the signed-in user or redirects to /login. */
export async function requireUser(): Promise<SessionUser> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || (session as { inactive?: boolean }).inactive) redirect("/login");
  return session.user;
}

/** Same as requireUser, but only Admins pass; Users are sent to the dashboard. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/?denied=1");
  return user;
}
