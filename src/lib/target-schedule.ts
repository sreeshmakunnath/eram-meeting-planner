import { and, asc, eq, inArray, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { clientInMyBus, teamOf } from "./access";
import { isAdmin, isSuperAdmin, type SessionUser } from "./auth";
import { todayRiyadh } from "./meetings";
import { OPEN_STATUSES, taskVisibleTo, type TaskCategory, type TaskStatus } from "./tasks";

export const BD_CATEGORIES: TaskCategory[] = ["MARKET_RESEARCH", "MIR_REPORT", "APPROACH", "FOLLOW_UP"];

/** `canOpen`: the viewer may open the task itself (the tracker shows every BD task of the clients it lists). */
export type Cell = { taskId: number; due: string | null; status: TaskStatus; owners: string; overdue: boolean; canOpen: boolean; completedAt: Date | null } | null;

/**
 * Who sees a client on the BD tracker: Super Admins, Admins of the client's business units, the client's account
 * owner and the owner's managers (any level). Other Users don't, even when they can see the client itself.
 */
export function trackerVisibleTo(me: SessionUser): SQL | undefined {
  if (isSuperAdmin(me)) return undefined;
  const c = schema.clients;
  return or(isAdmin(me) ? clientInMyBus(me, c.id) : undefined, eq(c.accountOwnerId, me.id), sql`${c.accountOwnerId} in ${teamOf(me.id)}`);
}

/**
 * The BD Target Schedule: one row per target company, columns built from that client's tasks in the
 * Market research / MIR report / Approach / Follow-up categories (latest non-cancelled task of each).
 */
/** Narrows the tracker for the monthly BD report: one business unit's clients, or the clients a manager's team owns. */
export type ReportScope = { bu: number } | { team: true };

export async function targetScheduleRows(me: SessionUser, batch?: string, scope?: ReportScope) {
  const today = todayRiyadh();
  const clients = await db
    .select({
      id: schema.clients.id,
      name: schema.clients.name,
      country: schema.clients.country,
      city: schema.clients.city,
      batch: schema.clients.targetBatch,
      notes: schema.clients.notes,
      bdStage: schema.clients.bdStage,
      accountOwnerId: schema.clients.accountOwnerId,
      accountOwner: schema.users.fullName,
    })
    .from(schema.clients)
    .leftJoin(schema.users, eq(schema.clients.accountOwnerId, schema.users.id))
    .where(
      and(
        ne(schema.clients.status, "INACTIVE"),
        trackerVisibleTo(me),
        scope && "bu" in scope
          ? sql`exists (select 1 from client_business_units cb where cb.client_id = ${schema.clients.id} and cb.business_unit_id = ${scope.bu})`
          : undefined,
        scope && "team" in scope ? or(eq(schema.clients.accountOwnerId, me.id), sql`${schema.clients.accountOwnerId} in ${teamOf(me.id)}`) : undefined,
        batch ? eq(schema.clients.targetBatch, batch) : or(isNotNull(schema.clients.targetBatch), eq(schema.clients.type, "PROSPECT")),
      ),
    )
    .orderBy(asc(schema.clients.targetBatch), asc(schema.clients.name));
  const ids = clients.map((c) => c.id);
  const tasks = ids.length
    ? await db
        .select({
          id: schema.tasks.id,
          clientId: schema.tasks.clientId,
          category: schema.tasks.category,
          status: schema.tasks.status,
          dueDate: schema.tasks.dueDate,
          createdAt: schema.tasks.createdAt,
          completedAt: schema.tasks.completedAt,
          canOpen: taskVisibleTo(me) ? sql<boolean>`(${taskVisibleTo(me)})` : sql<boolean>`true`,
        })
        .from(schema.tasks)
        .where(
          and(
            inArray(schema.tasks.clientId, ids),
            inArray(schema.tasks.category, BD_CATEGORIES),
            ne(schema.tasks.status, "CANCELLED"),
            isNull(schema.tasks.sourceBriefId), // brief actions are tracked as tasks, not as BD schedule steps
            isNull(schema.tasks.parentTaskId),
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
      canOpen: !!t.canOpen,
      completedAt: t.completedAt,
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
