"use client";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const notice = params.get("reset") ? "Password saved. You can sign in now." : null;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await signIn("credentials", { login: fd.get("login"), password: fd.get("password"), redirect: false });
    setBusy(false);
    if (!res || res.error) {
      setError(res?.error && res.error !== "CredentialsSignin" ? res.error : "Incorrect email/username or password.");
      return;
    }
    const cb = params.get("callbackUrl");
    router.push(cb && cb.startsWith("/") ? cb : "/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-xl font-bold text-navy">Sign in</h1>
      {notice && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      <label className="block">
        <span className="label">Email or username</span>
        <input name="login" className="input" autoComplete="username" required autoFocus />
      </label>
      <label className="block">
        <span className="label">Password</span>
        <input name="password" type="password" className="input" autoComplete="current-password" required />
      </label>
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <div className="text-center text-sm">
        <Link href="/forgot-password" className="link">
          Forgot password?
        </Link>
      </div>
    </form>
  );
}
