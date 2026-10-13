import { headers } from "next/headers";
import { db, schema } from "@/db";

/** Writes one row to the audit log. Never throws: auditing must not break the action itself. */
export async function audit(
  userId: number | null | undefined,
  action: string,
  entity: string,
  entityId?: number | null,
  details?: Record<string, unknown>,
) {
  let ip: string | null = null;
  try {
    ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  } catch {
    // headers() is unavailable outside a request (e.g. during auth callbacks in some contexts)
  }
  try {
    await db.insert(schema.auditLogs).values({
      userId: userId ?? null,
      action,
      entity,
      entityId: entityId ?? null,
      details: details ?? null,
      ip,
    });
  } catch (e) {
    console.error("audit log write failed", e);
  }
}
