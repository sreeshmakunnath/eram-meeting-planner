import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export const activeBranches = () =>
  db.select().from(schema.branches).where(eq(schema.branches.active, true)).orderBy(asc(schema.branches.name));
export const activeBusinessUnits = () =>
  db.select().from(schema.businessUnits).where(eq(schema.businessUnits.active, true)).orderBy(asc(schema.businessUnits.name));
export const activeUsers = () =>
  db
    .select({ id: schema.users.id, fullName: schema.users.fullName, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.status, "ACTIVE"))
    .orderBy(asc(schema.users.fullName));
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
