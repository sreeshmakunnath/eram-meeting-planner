import { and, eq, exists, inArray, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import type { SessionUser } from "./auth";
import { appUrl, button, esc, sendMail } from "./mail";
import { fmtPlainDate } from "./meetings";

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

/** Admins see every task. Users see tasks they created or are assigned to (directly or through a group they're in). */
export function taskVisibleTo(me: SessionUser): SQL | undefined {
  if (me.role === "ADMIN") return undefined;
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
  );
}

export async function canViewTask(me: SessionUser, id: number) {
  if (me.role === "ADMIN") return true;
  const [row] = await db.select({ id: t.id }).from(t).where(and(eq(t.id, id), taskVisibleTo(me)));
  return !!row;
}
/** Editing the task itself: creator or Admin. */
export const canEditTask = (me: SessionUser, task: { createdById: number | null }) => me.role === "ADMIN" || task.createdById === me.id;
/** Updating status / progress / checklist: creator, Admin or any assignee. */
export async function canWorkOnTask(me: SessionUser, task: { id: number; createdById: number | null }) {
  if (canEditTask(me, task)) return true;
  return canViewTask(me, task.id);
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

/** "Task assigned to you" email. */
export async function notifyTaskAssigned(taskId: number, userIds: number[], byName: string) {
  if (!userIds.length) return;
  const task = await db.query.tasks.findFirst({
    where: eq(t.id, taskId),
    with: { client: { columns: { name: true } }, meeting: { columns: { title: true } } },
  });
  if (!task) return;
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
