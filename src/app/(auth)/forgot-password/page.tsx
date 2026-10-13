import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { requestPasswordReset } from "@/lib/actions/auth";

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-navy">Forgot password</h1>
      <p className="text-sm text-slate-600">Enter your email ID. If it belongs to an active account, we&apos;ll email a reset link valid for 30 minutes.</p>
      <ActionForm action={requestPasswordReset} className="space-y-4">
        <label className="block">
          <span className="label">Email ID</span>
          <input name="email" type="email" className="input" required />
        </label>
        <div className="flex items-center justify-between">
          <Link href="/login" className="link text-sm">
            Back to sign in
          </Link>
          <SubmitButton>Send reset link</SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
