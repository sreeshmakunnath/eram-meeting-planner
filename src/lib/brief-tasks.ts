// Turns the agreed actions of a submitted Meeting Brief into tasks, and keeps them in step when a
// reopened brief is submitted again. Pure database logic (no emails, no request context) so it can
// also run from the migration script to backfill briefs submitted before the task planner existed.
import { and, eq, inArray, isNotNull, notInArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";
import { taskBuFor } from "./task-bu";

type Db = NodePgDatabase<typeof schema>;

export type SyncResult = { created: { taskId: number; userIds: number[] }[]; updated: number[]; cancelled: number[] };

async function setAssignees(db: Db, taskId: number, ownerUserId: number | null, ownerGroupId: number | null) {
  await db.delete(schema.taskAssignees).where(eq(schema.taskAssignees.taskId, taskId));
  await db.delete(schema.taskGroups).where(eq(schema.taskGroups.taskId, taskId));
  const userIds: number[] = [];
  if (ownerGroupId) {
    await db.insert(schema.taskGroups).values({ taskId, groupId: ownerGroupId });
    const members = await db
      .select({ userId: schema.groupMembers.userId })
      .from(schema.groupMembers)
      .innerJoin(schema.users, eq(schema.groupMembers.userId, schema.users.id))
      .where(and(eq(schema.groupMembers.groupId, ownerGroupId), eq(schema.users.status, "ACTIVE")));
    if (members.length) await db.insert(schema.taskAssignees).values(members.map((m) => ({ taskId, userId: m.userId, viaGroupId: ownerGroupId })));
    userIds.push(...members.map((m) => m.userId));
  }
  if (ownerUserId && !userIds.includes(ownerUserId)) {
    await db.insert(schema.taskAssignees).values({ taskId, userId: ownerUserId });
    userIds.push(ownerUserId);
  }
  return userIds;
}

export async function syncBriefTasks(db: Db, briefId: number, actorId: number | null): Promise<SyncResult> {
  const brief = await db.query.meetingBriefs.findFirst({
    where: eq(schema.meetingBriefs.id, briefId),
    with: { meeting: true, actions: { orderBy: (a, { asc }) => [asc(a.position)] } },
  });
  const result: SyncResult = { created: [], updated: [], cancelled: [] };
  if (!brief || brief.status !== "SUBMITTED") return result;
  const m = brief.meeting;

  const existing = await db.select().from(schema.tasks).where(eq(schema.tasks.sourceBriefId, briefId));
  const used = new Set<number>();
  const log = (taskId: number, action: string, details?: Record<string, unknown>) =>
    db.insert(schema.taskActivity).values({ taskId, userId: actorId, action, details: details ?? null });

  for (const a of brief.actions) {
    const title = a.action.slice(0, 200);
    // The task linked to this action row; older tasks without a link fall back to the same action text.
    const match =
      existing.find((x) => !used.has(x.id) && x.sourceActionId === a.id) ??
      existing.find((x) => !used.has(x.id) && x.sourceActionId === null && x.title === title);
    if (match) {
      used.add(match.id);
      const before = await db.select().from(schema.taskAssignees).where(eq(schema.taskAssignees.taskId, match.id));
      const [grp] = await db.select().from(schema.taskGroups).where(eq(schema.taskGroups.taskId, match.id));
      const ownerChanged =
        (grp?.groupId ?? null) !== a.ownerGroupId || (!a.ownerGroupId && (before.length !== 1 || before[0]?.userId !== a.ownerUserId));
      const changed =
        match.title !== title || (match.dueDate ?? null) !== (a.deadline ?? null) || match.sourcePosition !== a.position || match.sourceActionId !== a.id || ownerChanged;
      if (changed) {
        await db
          .update(schema.tasks)
          .set({
            title,
            dueDate: a.deadline,
            sourcePosition: a.position,
            sourceActionId: a.id,
            ...(match.status === "CANCELLED" ? { status: "NOT_STARTED" as const } : {}),
          })
          .where(eq(schema.tasks.id, match.id));
        if (ownerChanged) {
          const now = await setAssignees(db, match.id, a.ownerUserId, a.ownerGroupId);
          const added = now.filter((u) => !before.some((b) => b.userId === u));
          if (added.length) result.created.push({ taskId: match.id, userIds: added }); // notify new owners
        }
        await log(match.id, "UPDATED_FROM_BRIEF", { briefVersion: brief.version });
        result.updated.push(match.id);
      }
      continue;
    }
    const createdById = brief.submittedById ?? actorId ?? m.organiserId;
    const [task] = await db
      .insert(schema.tasks)
      .values({
        businessUnitId: await taskBuFor(db, { clientId: m.clientId, meetingId: m.id, userId: createdById }),
        title,
        description: `Agreed action from the Meeting Brief of "${m.title}".`,
        // GENERAL keeps brief actions apart from the BD Target Schedule categories
        category: m.type === "PRESENTATION" ? "PRESENTATION" : "GENERAL",
        meetingId: m.id,
        clientId: m.clientId,
        priority: m.priority,
        dueDate: a.deadline,
        status: "NOT_STARTED",
        sourceBriefId: briefId,
        sourcePosition: a.position,
        sourceActionId: a.id,
        createdById,
      })
      .returning();
    const userIds = await setAssignees(db, task.id, a.ownerUserId, a.ownerGroupId);
    await log(task.id, "CREATED", { from: `Meeting Brief of meeting #${m.id}` });
    result.created.push({ taskId: task.id, userIds });
  }

  // Actions removed from the brief: cancel their open tasks (completed work is kept as is).
  const orphans = existing.filter((x) => !used.has(x.id) && x.status !== "COMPLETED" && x.status !== "CANCELLED");
  if (orphans.length) {
    await db
      .update(schema.tasks)
      .set({ status: "CANCELLED" })
      .where(inArray(schema.tasks.id, orphans.map((o) => o.id)));
    for (const o of orphans) await log(o.id, "CANCELLED", { reason: "Action removed from the Meeting Brief" });
    result.cancelled.push(...orphans.map((o) => o.id));
  }
  return result;
}

/** One-time catch-up: tasks for briefs submitted before the task planner existed. Safe to run repeatedly. */
export async function backfillBriefTasks(db: Db) {
  const withTasks = db.selectDistinct({ id: schema.tasks.sourceBriefId }).from(schema.tasks).where(isNotNull(schema.tasks.sourceBriefId));
  const briefs = await db
    .select({ id: schema.meetingBriefs.id })
    .from(schema.meetingBriefs)
    .where(and(eq(schema.meetingBriefs.status, "SUBMITTED"), notInArray(schema.meetingBriefs.id, withTasks)));
  let created = 0;
  for (const b of briefs) created += (await syncBriefTasks(db, b.id, null)).created.length;
  return { briefs: briefs.length, created };
}
