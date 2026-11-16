import { redirect } from "next/navigation";
import { Suspense } from "react";
import LoginForm from "./login-form";

export default async function LoginPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  // Credentials must never sit in a URL (history, logs, Referer). If they arrive there, drop them and keep
  // only the harmless parameters.
  if ("password" in sp || "login" in sp) {
    const keep = new URLSearchParams();
    for (const k of ["callbackUrl", "reset"]) if (typeof sp[k] === "string") keep.set(k, sp[k] as string);
    redirect(`/login${keep.size ? `?${keep}` : ""}`);
  }
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
