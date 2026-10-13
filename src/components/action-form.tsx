"use client";
import { useFormState, useFormStatus } from "react-dom";

export type ActionState = { error?: string; ok?: string } | undefined;
type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

/** Wraps a server action form: shows its error / success message and disables the button while saving. */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useFormState(action, undefined);
  return (
    <form action={formAction} className={className}>
      {state?.error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{state.error}</div>}
      {state?.ok && <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{state.ok}</div>}
      {children}
    </form>
  );
}

export function SubmitButton({ children, variant = "primary" }: { children: React.ReactNode; variant?: "primary" | "secondary" | "danger" }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`btn-${variant}`}>
      {pending ? "Saving…" : children}
    </button>
  );
}
