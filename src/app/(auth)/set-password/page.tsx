import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { setPassword } from "@/lib/actions/auth";
import { findValidToken } from "@/lib/tokens";

export const dynamic = "force-dynamic";

export default async function SetPasswordPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token ?? "";
  const valid = token ? await findValidToken(token) : null;
  if (!valid) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-white">Link expired</h1>
        <p className="text-sm text-white/75">This link is invalid, already used, or expired. Request a new one.</p>
        <Link href="/forgot-password" className="btn-primary w-full">
          Request a new link
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-white">{valid.type === "SET_PASSWORD" ? "Set your password" : "Reset your password"}</h1>
      <p className="text-sm text-white/75">At least 8 characters, with an upper-case letter, a number and a symbol.</p>
      <ActionForm action={setPassword} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <label className="block">
          <span className="label">New password</span>
          <input name="password" type="password" className="input" autoComplete="new-password" required />
        </label>
        <label className="block">
          <span className="label">Confirm password</span>
          <input name="confirm" type="password" className="input" autoComplete="new-password" required />
        </label>
        <SubmitButton>Save password</SubmitButton>
      </ActionForm>
    </div>
  );
}
