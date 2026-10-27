import { and, asc, eq, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { clientVisibleTo } from "./access";
import type { SessionUser } from "./auth";

export const activeBranches = () =>
  db.select().from(schema.branches).where(eq(schema.branches.active, true)).orderBy(asc(schema.branches.name));
export const activeBusinessUnits = () =>
  db.select().from(schema.businessUnits).where(eq(schema.businessUnits.active, true)).orderBy(asc(schema.businessUnits.name));
export const activeUsers = () =>
  db
    .select({
      id: schema.users.id,
      fullName: schema.users.fullName,
      email: schema.users.email,
      buIds: sql<number[]>`coalesce((select array_agg(ub.business_unit_id) from user_business_units ub where ub.user_id = ${schema.users.id}), '{}')`,
    })
    .from(schema.users)
    .where(eq(schema.users.status, "ACTIVE"))
    .orderBy(asc(schema.users.fullName));
/** Client dropdowns: active and pending clients the user can see (plus `includeId`, the record's current client). */
export const clientOptions = (me: SessionUser, includeId?: number | null) =>
  db
    .select({ id: schema.clients.id, name: schema.clients.name })
    .from(schema.clients)
    .where(and(ne(schema.clients.status, "INACTIVE"), includeId ? or(clientVisibleTo(me), eq(schema.clients.id, includeId)) : clientVisibleTo(me)))
    .orderBy(asc(schema.clients.name));
export const activeGroups = () =>
  db
    .select({ id: schema.groups.id, name: schema.groups.name })
    .from(schema.groups)
    .where(eq(schema.groups.status, "ACTIVE"))
    .orderBy(asc(schema.groups.name));

export const GROUP_TYPES = ["DEPARTMENT", "BRANCH", "PROJECT", "CLIENT_ACCOUNT", "OTHER"] as const;
export const CLIENT_TYPES = ["CLIENT", "PROSPECT", "PARTNER", "VENDOR"] as const;
export const CLIENT_STATUSES = ["ACTIVE", "INACTIVE", "PENDING_REVIEW"] as const;
export const BD_STAGES = ["RESEARCH", "MIR", "APPROACH", "FOLLOW_UP", "ACTIVE_CLIENT"] as const;
export const BD_STAGE_LABELS: Record<string, string> = {
  RESEARCH: "Research",
  MIR: "MIR",
  APPROACH: "Approach",
  FOLLOW_UP: "Follow-up",
  ACTIVE_CLIENT: "Active client",
};
export const INDUSTRIES = ["Oil & gas", "EPC", "Petrochemicals", "Marine & offshore", "Government", "Construction", "Manufacturing", "Other"];
