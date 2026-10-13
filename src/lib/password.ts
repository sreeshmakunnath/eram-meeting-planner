import bcrypt from "bcryptjs";

/** Password policy from the design: min 8 chars, one upper case, one number, one symbol. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(pw)) return "Password needs at least one upper-case letter.";
  if (!/[0-9]/.test(pw)) return "Password needs at least one number.";
  if (!/[^A-Za-z0-9]/.test(pw)) return "Password needs at least one symbol.";
  return null;
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);
