"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { db, schema } from "@/db";
import { canSeeClient } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { ACTIVITY_TYPES, canEditLog, EDIT_DAYS, type ActivityType } from "@/lib/daily-log";
import { FormError, int, req, str, toFormError } from "@/lib/form";
import { canView as canViewMeeting, todayRiyadh } from "@/lib/meetings";
import { taskBuFor } from "@/lib/task-bu";
import { canViewTask } from "@/lib/tasks";

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

/** Adds an entry (no id) or saves an edit of one's own recent entry. */
export async function saveLog(_: ActionState, fd: FormData): Promise<ActionState> {
  let editing = false;
  try {
    const me = await requireUser();
    const id = int(fd, "id");
    const before = id ? (await db.select().from(schema.dailyLogs).where(eq(schema.dailyLogs.id, id)))[0] : undefined;
    if (id && (!before || !canEditLog(me, before))) throw new FormError(`You can only edit your own entries, up to ${EDIT_DAYS} days after writing them.`);
    editing = !!before;

    const today = todayRiyadh();
    const logDate = str(fd, "logDate") ?? today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate)) throw new FormError("Pick a valid date.");
    if (logDate > today) throw new FormError("You can't log activity for a future date.");
    if (logDate < addDays(today, -EDIT_DAYS) && logDate !== before?.logDate) throw new FormError(`Entries can be back-dated up to ${EDIT_DAYS} days.`);
    const typeIn = str(fd, "type");
    if (!typeIn || !(ACTIVITY_TYPES as readonly string[]).includes(typeIn)) throw new FormError("Pick an activity type.");
    const description = req(fd, "description", "What you did").slice(0, 2000);
    const minutes = int(fd, "minutes");
    if (minutes !== null && (minutes < 0 || minutes > 24 * 60)) throw new FormError("Time spent must be between 0 and 24 hours.");

    let clientId = int(fd, "clientId");
    const taskId = int(fd, "taskId");
    const meetingId = int(fd, "meetingId");
    if (clientId && clientId !== before?.clientId && !(await canSeeClient(me, clientId))) throw new FormError("You don't have access to that client.");
    if (taskId && taskId !== before?.taskId && !(await canViewTask(me, taskId))) throw new FormError("You don't have access to that task.");
    if (meetingId && meetingId !== before?.meetingId && !(await canViewMeeting(me, meetingId))) throw new FormError("You don't have access to that meeting.");

    // A task or meeting link implies its client; a task also fixes the business unit
    let task: { clientId: number | null; businessUnitId: number } | undefined;
    if (taskId) [task] = await db.select({ clientId: schema.tasks.clientId, businessUnitId: schema.tasks.businessUnitId }).from(schema.tasks).where(eq(schema.tasks.id, taskId));
    if (!clientId && task?.clientId) clientId = task.clientId;
    if (!clientId && meetingId) {
      const [m] = await db.select({ clientId: schema.meetings.clientId }).from(schema.meetings).where(eq(schema.meetings.id, meetingId));
      clientId = m?.clientId ?? null;
    }
    const businessUnitId = task?.businessUnitId ?? (await taskBuFor(db, { clientId, meetingId, userId: me.id }));

    const data = { logDate, type: typeIn as ActivityType, description, minutes, clientId, taskId, meetingId, businessUnitId };
    if (before) await db.update(schema.dailyLogs).set(data).where(eq(schema.dailyLogs.id, before.id));
    else await db.insert(schema.dailyLogs).values({ ...data, userId: me.id });
    revalidatePath("/log");
    if (clientId) revalidatePath(`/clients/${clientId}`);
    if (taskId) revalidatePath(`/tasks/${taskId}`);
  } catch (e) {
    return toFormError(e);
  }
  if (editing) redirect("/log?msg=saved");
  return { ok: "Logged." };
}

export async function deleteLog(id: number) {
  const me = await requireUser();
  const [entry] = await db.select().from(schema.dailyLogs).where(eq(schema.dailyLogs.id, id));
  if (!entry || !canEditLog(me, entry)) redirect("/log?msg=locked");
  await db.delete(schema.dailyLogs).where(eq(schema.dailyLogs.id, id));
  revalidatePath("/log");
  redirect("/log?msg=deleted");
}
