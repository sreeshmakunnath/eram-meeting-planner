/** Small helpers for reading FormData in server actions. */
export const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};
export const req = (fd: FormData, key: string, label: string) => {
  const s = str(fd, key);
  if (!s) throw new FormError(`${label} is required.`);
  return s;
};
export const int = (fd: FormData, key: string) => {
  const s = str(fd, key);
  const n = s ? Number(s) : NaN;
  return Number.isInteger(n) ? n : null;
};
export const ints = (fd: FormData, key: string) =>
  fd
    .getAll(key)
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);

export class FormError extends Error {}

/** Converts known errors (validation, unique constraint) into a message for the form. */
export function toFormError(e: unknown): { error: string } {
  if (e instanceof FormError) return { error: e.message };
  const pg = e as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  const code = pg.code ?? pg.cause?.code;
  const constraint = pg.constraint ?? pg.cause?.constraint ?? "";
  if (code === "23505") {
    const field = constraint.includes("email")
      ? "email ID"
      : constraint.includes("username")
        ? "username"
        : constraint.includes("employee")
          ? "employee ID"
          : "name";
    return { error: `That ${field} is already in use.` };
  }
  // Next.js redirects are thrown as errors and must keep propagating.
  if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
  console.error(e);
  return { error: "Something went wrong. Please try again." };
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
