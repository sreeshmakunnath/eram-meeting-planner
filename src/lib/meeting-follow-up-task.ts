// A meeting's "Next action & follow-up" becomes one task: assigned to the action owner(s) (the organiser when
// none is chosen), created by the organiser, due on the follow-up date. Saving the meeting again keeps the task
// in step; clearing both the next action and the follow-up date cancels it. Pure database logic (no emails).
import { and, eq, inArray, notInArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";
import { taskBuFor } from "./task-bu";

type Db = NodePgDatabase<typeof schema>;

export type FollowUpSync = { taskId: number; notifyUserIds: number[]; organiserId: number } | null;

const t = schema.tasks;
const isFollowUpOf = (meetingId: number) => and(eq(t.meetingId, meetingId), eq(t.fromMeetingFollowUp, true));

/** The people the task goes to: the action owners, or the organiser when there are none. */
const ownersOr = (owners: number[], organiserId: number) => (owners.length ? owners : [organiserId]);

/**
 * @param previousOwnerIds the meeting's action owners before this save (undefined for a new meeting). Only people
 *   who were owners and no longer are get taken off the task; anyone added on the task itself stays.
 */
export async function syncFollowUpTask(db: Db, meetingId: number, actorId: number, previousOwnerIds?: number[]): Promise<FollowUpSync> {
  const m = await db.query.meetings.findFirst({ where: eq(schema.meetings.id, meetingId), with: { actionOwners: true } });
  if (!m) return null;
  const log = (taskId: number, action: string, details?: Record<string, unknown>) =>
    db.insert(schema.taskActivity).values({ taskId, userId: actorId, action, details: details ?? null });

  const tasks = await db.select().from(t).where(isFollowUpOf(meetingId)).orderBy(t.id);
  const open = tasks.filter((x) => x.status !== "COMPLETED");
  const nextAction = m.nextAction?.trim() || null;

  // Nothing to follow up any more: cancel what is still open (completed work stays as it is).
  if (!nextAction && !m.followUpDate) {
    const live = open.filter((x) => x.status !== "CANCELLED");
    if (live.length) {
      await db.update(t).set({ status: "CANCELLED" }).where(inArray(t.id, live.map((x) => x.id)));
      for (const x of live) await log(x.id, "CANCELLED", { reason: "Next action and follow-up date cleared on the meeting" });
    }
    return null;
  }

  const title = (nextAction ?? `Follow up – ${m.title}`).slice(0, 200);
  const dueDate = m.followUpDate;
  const owners = ownersOr(
    m.actionOwners.map((o) => o.userId),
    m.organiserId,
  );
  const activeOwners = (
    await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(inArray(schema.users.id, owners), eq(schema.users.status, "ACTIVE")))
  ).map((u) => u.id);

  const current = open.at(-1);
  if (!current) {
    // Already done for exactly this action and date: don't start it again.
    if (tasks.some((x) => x.title === title && (x.dueDate ?? null) === (dueDate ?? null))) return null;
    const [task] = await db
      .insert(t)
      .values({
        businessUnitId: await taskBuFor(db, { clientId: m.clientId, meetingId: m.id, userId: m.organiserId }),
        title,
        description: `Next action from the meeting "${m.title}".`,
        category: "GENERAL", // keeps it apart from the BD Target Schedule steps
        meetingId: m.id,
        clientId: m.clientId,
        priority: m.priority,
        dueDate,
        status: "NOT_STARTED",
        fromMeetingFollowUp: true,
        createdById: m.organiserId,
      })
      .returning();
    if (activeOwners.length) await db.insert(schema.taskAssignees).values(activeOwners.map((userId) => ({ taskId: task.id, userId })));
    await log(task.id, "CREATED", { from: `Next action of meeting #${m.id}` });
    return { taskId: task.id, notifyUserIds: activeOwners, organiserId: m.organiserId };
  }

  // Keep the open task in step with the meeting.
  const changed: string[] = [];
  if (current.title !== title) changed.push("title");
  if ((current.dueDate ?? null) !== (dueDate ?? null)) changed.push("dueDate");
  if (current.clientId !== m.clientId) changed.push("clientId");
  if (changed.length || current.status === "CANCELLED") {
    await db
      .update(t)
      .set({ title, dueDate, clientId: m.clientId, ...(current.status === "CANCELLED" ? { status: "NOT_STARTED" as const } : {}) })
      .where(eq(t.id, current.id));
    if (changed.length) await log(current.id, "UPDATED", { changed, from: "meeting" });
    if (current.status === "CANCELLED") await log(current.id, "STATUS_CHANGED", { from: "CANCELLED", to: "NOT_STARTED" });
  }

  const assigned = (await db.select({ userId: schema.taskAssignees.userId }).from(schema.taskAssignees).where(eq(schema.taskAssignees.taskId, current.id))).map((a) => a.userId);
  const added = activeOwners.filter((u) => !assigned.includes(u));
  const wasOwners = previousOwnerIds ? ownersOr(previousOwnerIds, m.organiserId) : [];
  const removed = wasOwners.filter((u) => !owners.includes(u) && assigned.includes(u));
  if (added.length) await db.insert(schema.taskAssignees).values(added.map((userId) => ({ taskId: current.id, userId })));
  if (removed.length)
    await db.delete(schema.taskAssignees).where(and(eq(schema.taskAssignees.taskId, current.id), inArray(schema.taskAssignees.userId, removed)));
  if (added.length || removed.length) {
    const names = async (ids: number[]) =>
      ids.length ? (await db.select({ n: schema.users.fullName }).from(schema.users).where(inArray(schema.users.id, ids))).map((r) => r.n) : [];
    await log(current.id, "ASSIGNEES_CHANGED", { added: await names(added), removed: await names(removed) });
  }
  return { taskId: current.id, notifyUserIds: added, organiserId: m.organiserId };
}

/** Before a meeting is deleted: its open follow-up task is cancelled (the task itself is kept). */
export async function cancelFollowUpTask(db: Db, meetingId: number, actorId: number) {
  const live = await db
    .select({ id: t.id })
    .from(t)
    .where(and(isFollowUpOf(meetingId), notInArray(t.status, ["COMPLETED", "CANCELLED"])));
  if (!live.length) return;
  await db.update(t).set({ status: "CANCELLED" }).where(inArray(t.id, live.map((x) => x.id)));
  for (const x of live) await db.insert(schema.taskActivity).values({ taskId: x.id, userId: actorId, action: "CANCELLED", details: { reason: "Meeting deleted" } });
}
