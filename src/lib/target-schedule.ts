import { and, asc, eq, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { clientVisibleTo } from "./access";
import type { SessionUser } from "./auth";
import { todayRiyadh } from "./meetings";
import { OPEN_STATUSES, taskVisibleTo, type TaskCategory, type TaskStatus } from "./tasks";

export const BD_CATEGORIES: TaskCategory[] = ["MARKET_RESEARCH", "MIR_REPORT", "APPROACH", "FOLLOW_UP"];

export type Cell = { taskId: number; due: string | null; status: TaskStatus; owners: string; overdue: boolean } | null;

/**
 * The BD Target Schedule: one row per target company, columns built from that client's tasks in the
 * Market research / MIR report / Approach / Follow-up categories (latest non-cancelled task of each).
 */
export async function targetScheduleRows(me: SessionUser, batch?: string) {
  const today = todayRiyadh();
  const clients = await db
    .select({ id: schema.clients.id, name: schema.clients.name, country: schema.clients.country, city: schema.clients.city, batch: schema.clients.targetBatch, notes: schema.clients.notes, bdStage: schema.clients.bdStage, accountOwnerId: schema.clients.accountOwnerId })
    .from(schema.clients)
    .where(and(ne(schema.clients.status, "INACTIVE"), clientVisibleTo(me), batch ? eq(schema.clients.targetBatch, batch) : or(isNotNull(schema.clients.targetBatch), eq(schema.clients.type, "PROSPECT"))))
    .orderBy(asc(schema.clients.targetBatch), asc(schema.clients.name));
  const ids = clients.map((c) => c.id);
  const tasks = ids.length
    ? await db
        .select({ id: schema.tasks.id, clientId: schema.tasks.clientId, category: schema.tasks.category, status: schema.tasks.status, dueDate: schema.tasks.dueDate, createdAt: schema.tasks.createdAt })
        .from(schema.tasks)
        .where(
          and(
            inArray(schema.tasks.clientId, ids),
            inArray(schema.tasks.category, BD_CATEGORIES),
            ne(schema.tasks.status, "CANCELLED"),
            isNull(schema.tasks.sourceBriefId), // brief actions are tracked as tasks, not as BD schedule steps
            isNull(schema.tasks.parentTaskId),
            taskVisibleTo(me),
          ),
        )
    : [];
  const owners = tasks.length
    ? await db
        .select({ taskId: schema.taskAssignees.taskId, name: schema.users.fullName })
        .from(schema.taskAssignees)
        .innerJoin(schema.users, eq(schema.taskAssignees.userId, schema.users.id))
        .where(inArray(schema.taskAssignees.taskId, tasks.map((t) => t.id)))
    : [];

  const cell = (clientId: number, cat: TaskCategory): Cell => {
    const t = tasks.filter((x) => x.clientId === clientId && x.category === cat).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    if (!t) return null;
    const due = t.dueDate?.slice(0, 10) ?? null;
    return {
      taskId: t.id,
      due,
      status: t.status,
      owners: owners.filter((o) => o.taskId === t.id).map((o) => o.name).join(", "),
      overdue: !!due && due < today && OPEN_STATUSES.includes(t.status),
    };
  };
  return clients.map((c) => {
    const research = cell(c.id, "MARKET_RESEARCH");
    const mir = cell(c.id, "MIR_REPORT");
    const approach = cell(c.id, "APPROACH");
    const followUp = cell(c.id, "FOLLOW_UP");
    return {
      ...c,
      location: [c.city, c.country].filter(Boolean).join(", "),
      research,
      mir,
      approach,
      followUp,
      researchOwner: mir?.owners || research?.owners || "",
      researchStatus: (mir ?? research)?.status ?? null,
      approachOwner: approach?.owners || followUp?.owners || "",
      approachStatus: approach?.status ?? null,
      hasTasks: !!(research || mir || approach || followUp),
    };
  });
}
export type TargetRow = Awaited<ReturnType<typeof targetScheduleRows>>[number];

export async function batches() {
  const rows = await db.selectDistinct({ b: schema.clients.targetBatch }).from(schema.clients).where(isNotNull(schema.clients.targetBatch)).orderBy(asc(schema.clients.targetBatch));
  return rows.map((r) => r.b!).filter(Boolean);
}
