import { and, eq, exists, inArray, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { teamOf } from "./access";
import { isAdmin, isSuperAdmin, type SessionUser } from "./auth";
import { appUrl, button, esc, sendMail } from "./mail";
import { fmtPlainDate, riyadhParts } from "./meetings";
import { notify } from "./notifications";

/** Days between the due date and completion (Saudi dates): negative = early, 0 = on the day, positive = late. */
export function completionDelta(dueDate: string | null, completedAt: Date | null) {
  if (!dueDate || !completedAt) return null;
  return Math.round((Date.parse(riyadhParts(completedAt).date) - Date.parse(dueDate.slice(0, 10))) / 86400_000);
}

export const TASK_STATUSES = ["NOT_STARTED", "STARTED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  NOT_STARTED: "Not started",
  STARTED: "Started",
  IN_PROGRESS: "In progress",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};
export const TASK_STATUS_TONE: Record<TaskStatus, "gray" | "blue" | "navy" | "green" | "amber" | "red"> = {
  NOT_STARTED: "gray",
  STARTED: "blue",
  IN_PROGRESS: "navy",
  ON_HOLD: "amber",
  COMPLETED: "green",
  CANCELLED: "red",
};
export const OPEN_STATUSES: TaskStatus[] = ["NOT_STARTED", "STARTED", "IN_PROGRESS", "ON_HOLD"];

export const TASK_CATEGORIES = ["MARKET_RESEARCH", "MIR_REPORT", "APPROACH", "FOLLOW_UP", "PRESENTATION", "GENERAL"] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];
export const CATEGORY_LABEL: Record<TaskCategory, string> = {
  MARKET_RESEARCH: "Market research",
  MIR_REPORT: "MIR report",
  APPROACH: "Approach",
  FOLLOW_UP: "Follow-up",
  PRESENTATION: "Presentation",
  GENERAL: "General",
};

const t = schema.tasks;

/** A task in one of the Admin's business units (every task belongs to exactly one). */
function taskInMyBus(me: SessionUser): SQL {
  return inArray(t.businessUnitId, me.buIds);
}

/** Tasks the person created or is assigned to (directly or through a group they're in). */
function myOwnTask(me: SessionUser): SQL {
  return or(
    eq(t.createdById, me.id),
    exists(
      db
        .select({ one: sql`1` })
        .from(schema.taskAssignees)
        .where(and(eq(schema.taskAssignees.taskId, t.id), eq(schema.taskAssignees.userId, me.id))),
    ),
    exists(
      db
        .select({ one: sql`1` })
        .from(schema.taskGroups)
        .where(
          and(
            eq(schema.taskGroups.taskId, t.id),
            sql`${schema.taskGroups.groupId} in (select gm.group_id from group_members gm where gm.user_id = ${me.id})`,
          ),
        ),
    ),
  )!;
}

/** Tasks created by or assigned to someone under this manager in the reporting lines (any depth). */
function myTeamTask(me: SessionUser): SQL {
  const team = teamOf(me.id);
  return sql`(${t.createdById} in ${team} or exists (select 1 from task_assignees ta where ta.task_id = ${t.id} and ta.user_id in ${team}))`;
}

/** Assigned to someone under this manager. */
export const assignedToMyTeam = (me: SessionUser): SQL =>
  sql`exists (select 1 from task_assignees ta where ta.task_id = ${t.id} and ta.user_id in ${teamOf(me.id)})`;

/**
 * Super Admins see every task; BU Admins see the tasks of their business units. Everyone sees tasks they
 * created or are assigned to (directly or through a group they're in), the subtasks of those tasks, and the
 * main task of a subtask assigned to them. Managers also see their reportees' tasks.
 */
export function taskVisibleTo(me: SessionUser): SQL | undefined {
  if (isSuperAdmin(me)) return undefined;
  return or(
    isAdmin(me) ? taskInMyBus(me) : undefined,
    myOwnTask(me),
    myTeamTask(me),
    sql`${t.parentTaskId} in (select p.id from tasks p where p.created_by_id = ${me.id} or exists (select 1 from task_assignees pa where pa.task_id = p.id and pa.user_id = ${me.id}))`,
    sql`exists (select 1 from tasks s join task_assignees sa on sa.task_id = s.id where s.parent_task_id = ${t.id} and sa.user_id = ${me.id})`,
  );
}

export async function canViewTask(me: SessionUser, id: number) {
  if (isSuperAdmin(me)) return true;
  const [row] = await db.select({ id: t.id }).from(t).where(and(eq(t.id, id), taskVisibleTo(me)));
  return !!row;
}
type TaskRef = { id: number; createdById: number | null; parentTaskId?: number | null };

/** Editing the task itself: the creator, a Super Admin, an Admin of the task's business units, or (for a subtask) whoever can edit the main task. */
export async function canEditTask(me: SessionUser, task: TaskRef): Promise<boolean> {
  if (isSuperAdmin(me) || task.createdById === me.id) return true;
  if (isAdmin(me)) {
    const [row] = await db.select({ id: t.id }).from(t).where(and(eq(t.id, task.id), taskInMyBus(me)));
    if (row) return true;
  }
  if (task.parentTaskId) {
    const [parent] = await db.select({ id: t.id, createdById: t.createdById }).from(t).where(eq(t.id, task.parentTaskId));
    return !!parent && canEditTask(me, parent);
  }
  return false;
}
/** Updating status / progress / subtasks / comments: whoever can edit it, or its assignees (directly or through a group). */
export async function canWorkOnTask(me: SessionUser, task: TaskRef) {
  if (await canEditTask(me, task)) return true;
  const [row] = await db.select({ id: t.id }).from(t).where(and(eq(t.id, task.id), myOwnTask(me)));
  return !!row;
}

/** Comments: whoever can work on the task, and managers of the people on it (they view and comment, nothing more). */
export async function canCommentOnTask(me: SessionUser, task: TaskRef) {
  if (await canWorkOnTask(me, task)) return true;
  const [row] = await db.select({ id: t.id }).from(t).where(and(eq(t.id, task.id), myTeamTask(me)));
  return !!row;
}

/** A main task's % complete follows its subtasks (cancelled ones don't count); work on a subtask starts the main task. */
export async function syncParentProgress(parentId: number) {
  const subs = await db.select({ status: t.status }).from(t).where(eq(t.parentTaskId, parentId));
  const counted = subs.filter((s) => s.status !== "CANCELLED");
  if (!counted.length) return;
  const [parent] = await db.select({ status: t.status }).from(t).where(eq(t.id, parentId));
  if (!parent) return;
  const pct = Math.round((counted.filter((s) => s.status === "COMPLETED").length / counted.length) * 100);
  const started = counted.some((s) => s.status !== "NOT_STARTED");
  const status: TaskStatus = parent.status === "NOT_STARTED" && started ? "IN_PROGRESS" : parent.status;
  await db.update(t).set({ percent: parent.status === "COMPLETED" ? 100 : pct, status }).where(eq(t.id, parentId));
}

export async function logTaskActivity(taskId: number, userId: number | null, action: string, details?: Record<string, unknown>) {
  await db.insert(schema.taskActivity).values({ taskId, userId, action, details: details ?? null });
}

/** Group members (active users) + direct picks. Direct picks win over a group link. */
export async function expandAssignees(userIds: number[], groupIds: number[]) {
  const map = new Map<number, number | null>();
  if (groupIds.length) {
    const members = await db
      .select({ userId: schema.groupMembers.userId, groupId: schema.groupMembers.groupId })
      .from(schema.groupMembers)
      .innerJoin(schema.users, eq(schema.groupMembers.userId, schema.users.id))
      .where(and(inArray(schema.groupMembers.groupId, groupIds), eq(schema.users.status, "ACTIVE")));
    for (const m of members) if (!map.has(m.userId)) map.set(m.userId, m.groupId);
  }
  for (const u of userIds) map.set(u, null);
  return map;
}

/** "Task assigned to you" email and in-app notification. */
export async function notifyTaskAssigned(taskId: number, userIds: number[], byName: string, actorId: number | null = null) {
  if (!userIds.length) return;
  const task = await db.query.tasks.findFirst({
    where: eq(t.id, taskId),
    with: { client: { columns: { name: true } }, meeting: { columns: { title: true } } },
  });
  if (!task) return;
  await notify(userIds, {
    kind: "TASK_ASSIGNED",
    title: `Task assigned: ${task.title}`,
    body: [`From ${byName}`, task.dueDate ? `due ${fmtPlainDate(task.dueDate)}` : "no due date", task.client?.name, task.meeting ? `from meeting ${task.meeting.title}` : null].filter(Boolean).join(" · "),
    href: `/tasks/${taskId}`,
    actorId,
  });
  const people = await db.select({ email: schema.users.email, fullName: schema.users.fullName }).from(schema.users).where(inArray(schema.users.id, userIds));
  for (const p of people) {
    await sendMail(
      p.email,
      `Task assigned: ${task.title}${task.dueDate ? ` — due ${fmtPlainDate(task.dueDate)}` : ""}`,
      "A task was assigned to you",
      `<p>Hello ${esc(p.fullName)},</p><p>${esc(byName)} assigned you a task:</p><p style="font-size:16px"><b>${esc(task.title)}</b></p>
      <p>Due: <b>${task.dueDate ? fmtPlainDate(task.dueDate) : "no due date"}</b>${task.client ? `<br>Client: ${esc(task.client.name)}` : ""}${task.meeting ? `<br>From meeting: ${esc(task.meeting.title)}` : ""}</p>
      ${task.description ? `<p style="white-space:pre-wrap">${esc(task.description)}</p>` : ""}${button(appUrl(`/tasks/${taskId}`), "Open task")}`,
    );
  }
}
