import { eq } from "drizzle-orm";
import Link from "next/link";
import { db, schema } from "@/db";

/** "Showing <unit> only" banner for lists opened from the business unit overview (?bu=), with a link to clear it. */
export async function BuFilterNotice({ bu, params, path }: { bu?: string; params: Record<string, string | undefined>; path: string }) {
  if (!bu || !Number(bu)) return null;
  const [unit] = await db.select({ name: schema.businessUnits.name }).from(schema.businessUnits).where(eq(schema.businessUnits.id, Number(bu)));
  const rest = new URLSearchParams(Object.entries(params).filter(([k, v]) => v && k !== "bu" && k !== "msg") as [string, string][]).toString();
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-brand/30 bg-brand-50 px-4 py-2 text-sm text-navy">
      <span>
        Showing <b>{unit?.name ?? "one business unit"}</b> only.
      </span>
      <Link href={rest ? `${path}?${rest}` : path} className="link">
        Show all
      </Link>
    </div>
  );
}
