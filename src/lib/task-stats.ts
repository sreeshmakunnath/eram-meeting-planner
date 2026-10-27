import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { userInMyBus } from "./access";
import type { SessionUser } from "./auth";
import { todayRiyadh } from "./meetings";
import { taskWhere } from "./task-queries";

const t = schema.tasks;
const n = (cond: ReturnType<typeof sql>) => sql<number>`count(*) filter (where ${cond})`.mapWith(Number);

/**
 * Task totals and a per-assignee split for the admin overview: open, overdue (open and past due) and completed.
 * With a business unit, only tasks assigned to its people count, and only its people are listed.
 */
export async function taskStats(viewer: SessionUser, bu?: number) {
  const today = todayRiyadh();
  const where = taskWhere(viewer, { scope: "all", bucket: "any", bu: bu ? String(bu) : undefined });
  const open = sql`${t.status} in ('NOT_STARTED', 'STARTED', 'IN_PROGRESS', 'ON_HOLD')`;
  const overdue = sql`${open} and ${t.dueDate}::date < ${today}::date`;
  const completed = sql`${t.status} = 'COMPLETED'`;
  const counts = { open: n(open), overdue: n(overdue), completed: n(completed) };

  const [[totals], people] = await Promise.all([
    db
      .select({ ...counts, completed30: n(sql`${completed} and ${t.completedAt} >= now() - interval '30 days'`) })
      .from(t)
      .where(where),
    db
      .select({ id: schema.users.id, name: schema.users.fullName, ...counts })
      .from(t)
      .innerJoin(schema.taskAssignees, eq(schema.taskAssignees.taskId, t.id))
      .innerJoin(schema.users, eq(schema.taskAssignees.userId, schema.users.id))
      .where(and(where, bu ? userInMyBus({ ...viewer, buIds: [bu] }, schema.users.id) : undefined))
      .groupBy(schema.users.id, schema.users.fullName)
      .orderBy(desc(n(overdue)), desc(n(open)), asc(schema.users.fullName)),
  ]);
  return { totals, people: people.filter((p) => p.open || p.overdue || p.completed) };
}
