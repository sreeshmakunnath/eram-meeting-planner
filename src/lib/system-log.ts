// System entries in people's daily logs: what they did in the planner (meetings, tasks, clients), added
// automatically next to what they write themselves. Each thing is logged once (system_key), the entries carry no
// time spent, and nobody can edit them. A failure here never stops the action that triggered it.
import { and, eq, notInArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ActivityType } from "./daily-log-labels";
import { taskBuFor } from "./task-bu";

type Db = typeof db; // a transaction works too (used by tests)

const l = schema.dailyLogs;

/** Today's date in Saudi time (YYYY-MM-DD). */
const riyadhDay = (d: Date = new Date()) => new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
const fmtDay = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Riyadh" }).format(d);

type Entry = {
  userId: number;
  key: string;
  type: ActivityType;
  description: string;
  logDate?: string;
  clientId?: number | null;
  taskId?: number | null;
  meetingId?: number | null;
  businessUnitId?: number;
};

async function add(e: Entry, conn: Db = db) {
  try {
    const businessUnitId = e.businessUnitId ?? (await taskBuFor(conn, { clientId: e.clientId, meetingId: e.meetingId, userId: e.userId }));
    await conn
      .insert(l)
      .values({
        userId: e.userId,
        logDate: e.logDate ?? riyadhDay(),
        type: e.type,
        description: e.description.slice(0, 2000),
        clientId: e.clientId ?? null,
        taskId: e.taskId ?? null,
        meetingId: e.meetingId ?? null,
        businessUnitId,
        system: true,
        systemKey: e.key.slice(0, 100),
      })
      .onConflictDoNothing();
  } catch (err) {
    console.error("system log entry failed", e.key, err);
  }
}

// ---------- tasks ----------
const STATUS_TEXT: Record<string, string> = {
  NOT_STARTED: "Reopened task",
  STARTED: "Started task",
  IN_PROGRESS: "Working on task",
  ON_HOLD: "Put task on hold",
  COMPLETED: "Completed task",
  CANCELLED: "Cancelled task",
};

/** From the task's activity trail: a task someone created, or a status they changed (once per status a day). */
export async function systemLogTask(taskId: number, userId: number | null, action: string, details?: Record<string, unknown>, conn: Db = db) {
  if (!userId || (action !== "CREATED" && action !== "STATUS_CHANGED")) return;
  if (action === "CREATED" && /import/i.test(String(details?.from ?? ""))) return; // bulk imports would flood the log
  try {
    const [t] = await conn
      .select({ title: schema.tasks.title, clientId: schema.tasks.clientId, meetingId: schema.tasks.meetingId, bu: schema.tasks.businessUnitId })
      .from(schema.tasks)
      .where(eq(schema.tasks.id, taskId));
    if (!t) return;
    const to = String(details?.to ?? "");
    const today = riyadhDay();
    await add({
      userId,
      key: action === "CREATED" ? `task:${taskId}:created` : `task:${taskId}:${to}:${today}`,
      type: "TASK",
      description: `${action === "CREATED" ? (details?.subtaskOf ? "Created subtask" : "Created task") : (STATUS_TEXT[to] ?? "Updated task")}: ${t.title}`,
      taskId,
      clientId: t.clientId,
      meetingId: t.meetingId,
      businessUnitId: t.bu,
    }, conn);
  } catch (err) {
    console.error("system log (task) failed", taskId, err);
  }
}

// ---------- meetings ----------
async function meetingInfo(meetingId: number, conn: Db) {
  const [m] = await conn
    .select({ title: schema.meetings.title, clientId: schema.meetings.clientId, startAt: schema.meetings.startAt })
    .from(schema.meetings)
    .where(eq(schema.meetings.id, meetingId));
  return m;
}

/** From the meeting's activity trail: a meeting someone created by hand, or a brief they submitted. */
export async function systemLogMeeting(meetingId: number, userId: number | null, action: string, details?: Record<string, unknown>, conn: Db = db) {
  if (!userId || (action !== "CREATED" && action !== "BRIEF_SUBMITTED")) return;
  if (action === "CREATED" && details?.from) return; // made by the system (brief follow-up) or an Excel import
  try {
    const m = await meetingInfo(meetingId, conn);
    if (!m) return;
    await add({
      userId,
      key: `meeting:${meetingId}:${action === "CREATED" ? "created" : "brief"}`,
      type: "MEETING",
      description:
        action === "CREATED"
          ? `Created meeting: ${m.title}${m.startAt ? ` (on ${fmtDay(m.startAt)})` : " (to be scheduled)"}`
          : `Submitted the meeting brief: ${m.title}`,
      meetingId,
      clientId: m.clientId,
    }, conn);
  } catch (err) {
    console.error("system log (meeting) failed", meetingId, err);
  }
}

/**
 * When a brief is submitted: "Attended meeting" for everyone marked as attended, dated the day of the meeting.
 * People no longer marked lose the entry.
 */
export async function systemLogAttendance(meetingId: number, attendedUserIds: number[], conn: Db = db) {
  try {
    const key = `meeting:${meetingId}:attended`;
    await conn
      .delete(l)
      .where(and(eq(l.meetingId, meetingId), eq(l.systemKey, key), attendedUserIds.length ? notInArray(l.userId, attendedUserIds) : undefined));
    const m = await meetingInfo(meetingId, conn);
    if (!m || !attendedUserIds.length) return;
    const today = riyadhDay();
    const day = m.startAt ? riyadhDay(m.startAt) : today;
    for (const userId of attendedUserIds)
      await add({ userId, key, type: "MEETING", description: `Attended meeting: ${m.title}`, logDate: day > today ? today : day, meetingId, clientId: m.clientId }, conn);
  } catch (err) {
    console.error("system log (attendance) failed", meetingId, err);
  }
}

// ---------- clients ----------
export async function systemLogClientAdded(clientId: number, userId: number, name: string, from?: string, conn: Db = db) {
  await add({ userId, key: `client:${clientId}:added`, type: "CLIENT_ADDED", description: `Added client: ${name}${from ? ` (${from})` : ""}`, clientId }, conn);
}
