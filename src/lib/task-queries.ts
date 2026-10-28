import { and, asc, eq, exists, gte, ilike, inArray, isNotNull, lt, notInArray, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import type { SessionUser } from "./auth";
import { PRIORITIES, todayRiyadh } from "./meetings";
import { assignedToMyTeam, OPEN_STATUSES, TASK_CATEGORIES, TASK_STATUSES, taskVisibleTo, type TaskStatus } from "./tasks";

export type TaskFilters = {
  scope?: string; // "mine" (assigned to me, default) | "created" | "team" (assigned to my reportees) | "all"
  bucket?: string; // today | week | overdue | upcoming | open (default) | completed | any
  status?: string;
  category?: string;
  client?: string;
  meeting?: string;
  user?: string;
  group?: string;
  priority?: string;
  q?: string;
  bu?: string; // the task's business unit
};

const t = schema.tasks;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const assignedTo = (userId: number) =>
  exists(
    db
      .select({ one: sql`1` })
      .from(schema.taskAssignees)
      .where(and(eq(schema.taskAssignees.taskId, t.id), eq(schema.taskAssignees.userId, userId))),
  );

export function taskWhere(me: SessionUser, f: TaskFilters): SQL | undefined {
  const today = todayRiyadh();
  const w: (SQL | undefined)[] = [taskVisibleTo(me)];
  const scope = f.scope ?? "mine";
  if (scope === "mine") w.push(assignedTo(me.id));
  if (scope === "created") w.push(eq(t.createdById, me.id));
  if (scope === "team") w.push(assignedToMyTeam(me));
  const open = inArray(t.status, OPEN_STATUSES);
  const due = sql`${t.dueDate}::date`;
  switch (f.bucket ?? "open") {
    case "today":
      w.push(open, sql`${due} = ${today}::date`);
      break;
    case "week":
      w.push(open, sql`${due} >= ${today}::date`, sql`${due} < ${addDays(today, 7)}::date`);
      break;
    case "overdue":
      w.push(open, sql`${due} < ${today}::date`);
      break;
    case "upcoming":
      w.push(open, sql`${due} >= ${addDays(today, 7)}::date`);
      break;
    case "completed":
      w.push(eq(t.status, "COMPLETED"));
      break;
    case "any":
      break;
    default:
      w.push(open);
  }
  if (f.status && (TASK_STATUSES as readonly string[]).includes(f.status)) w.push(eq(t.status, f.status as TaskStatus));
  if (f.category && (TASK_CATEGORIES as readonly string[]).includes(f.category)) w.push(eq(t.category, f.category as (typeof TASK_CATEGORIES)[number]));
  if (f.priority && (PRIORITIES as readonly string[]).includes(f.priority)) w.push(eq(t.priority, f.priority as (typeof PRIORITIES)[number]));
  if (f.client) w.push(eq(t.clientId, Number(f.client)));
  if (f.meeting) w.push(eq(t.meetingId, Number(f.meeting)));
  if (f.user) w.push(assignedTo(Number(f.user)));
  if (f.group)
    w.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(schema.taskGroups)
          .where(and(eq(schema.taskGroups.taskId, t.id), eq(schema.taskGroups.groupId, Number(f.group)))),
      ),
    );
  if (f.bu) w.push(eq(t.businessUnitId, Number(f.bu)));
  if (f.q) w.push(or(ilike(t.title, `%${f.q}%`), ilike(t.description, `%${f.q}%`), ilike(schema.clients.name, `%${f.q}%`)));
  const list = w.filter(Boolean) as SQL[];
  return list.length ? and(...list) : undefined;
}

export async function listTasks(me: SessionUser, f: TaskFilters, limit = 500) {
  const today = todayRiyadh();
  return db
    .select({
      id: t.id,
      title: t.title,
      category: t.category,
      priority: t.priority,
      status: t.status,
      percent: t.percent,
      startDate: t.startDate,
      dueDate: t.dueDate,
      completedAt: t.completedAt,
      clientId: t.clientId,
      client: schema.clients.name,
      meetingId: t.meetingId,
      fromBrief: sql<boolean>`${t.sourceBriefId} is not null`,
      createdById: t.createdById,
      parentId: t.parentTaskId,
      businessUnit: sql<string>`(select b.name from business_units b where b.id = ${t.businessUnitId})`,
      parentTitle: sql<string | null>`(select p.title from tasks p where p.id = ${t.parentTaskId})`,
      assignees: sql<string>`(select string_agg(u.full_name, ', ' order by u.full_name) from task_assignees ta join users u on u.id = ta.user_id where ta.task_id = ${t.id})`.mapWith(String),
      assigneeIds: sql<number[]>`coalesce((select array_agg(ta.user_id order by u.full_name) from task_assignees ta join users u on u.id = ta.user_id where ta.task_id = ${t.id}), '{}')`,
      groups: sql<string>`(select string_agg(g.name, ', ') from task_groups tg join groups g on g.id = tg.group_id where tg.task_id = ${t.id})`.mapWith(String),
      overdue: sql<boolean>`${t.dueDate}::date < ${today}::date and ${t.status} in ('NOT_STARTED','STARTED','IN_PROGRESS','ON_HOLD')`,
    })
    .from(t)
    .leftJoin(schema.clients, eq(t.clientId, schema.clients.id))
    .where(taskWhere(me, f))
    .orderBy(sql`${t.dueDate} asc nulls last`, sql`case ${t.priority} when 'HIGH' then 0 when 'MEDIUM' then 1 else 2 end`, asc(t.id))
    .limit(limit);
}
export type TaskRow = Awaited<ReturnType<typeof listTasks>>[number];

/** Tasks with a due date in [from, to) — for the calendar. */
export async function tasksDueBetween(me: SessionUser, from: string, to: string, extra?: SQL) {
  return db
    .select({ id: t.id, title: t.title, dueDate: t.dueDate, status: t.status, client: schema.clients.name })
    .from(t)
    .leftJoin(schema.clients, eq(t.clientId, schema.clients.id))
    .where(and(taskVisibleTo(me), isNotNull(t.dueDate), gte(t.dueDate, from), lt(t.dueDate, to), notInArray(t.status, ["CANCELLED"]), extra))
    .orderBy(asc(t.dueDate));
}

