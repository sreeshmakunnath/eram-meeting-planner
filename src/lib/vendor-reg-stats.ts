import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { clientVisibleTo } from "@/lib/access";
import type { SessionUser } from "@/lib/auth";
import { VENDOR_REG_OPEN, VENDOR_REG_STAGES, type VendorRegStatus } from "@/lib/vendor-reg";

const vr = schema.vendorRegistrations;

/** Registration counts per status on the clients this viewer can see (a BU-scoped viewer gives that unit's). */
export async function vendorRegCounts(viewer: SessionUser) {
  const rows = await db
    .select({ status: vr.status, n: sql<number>`count(*)`.mapWith(Number) })
    .from(vr)
    .innerJoin(schema.clients, eq(vr.clientId, schema.clients.id))
    .where(clientVisibleTo(viewer))
    .groupBy(vr.status);
  const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<VendorRegStatus, number>>;
  const total = rows.reduce((a, r) => a + r.n, 0);
  return {
    total,
    byStatus,
    stages: VENDOR_REG_STAGES.map((g) => ({ ...g, n: g.statuses.reduce((a, s) => a + (byStatus[s] ?? 0), 0) })),
  };
}

/** Open (not completed) registrations assigned to this person, soonest due first. */
export async function vendorRegsPendingWith(userId: number) {
  return db
    .select({ id: vr.id, clientId: vr.clientId, client: schema.clients.name, title: vr.title, status: vr.status, dueDate: vr.dueDate })
    .from(vr)
    .innerJoin(schema.clients, eq(vr.clientId, schema.clients.id))
    .where(and(eq(vr.assigneeId, userId), inArray(vr.status, VENDOR_REG_OPEN)))
    .orderBy(sql`${vr.dueDate} asc nulls last`, schema.clients.name);
}
