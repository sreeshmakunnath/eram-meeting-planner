"use server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { db, schema } from "@/db";
import { requireUser, type SessionUser } from "@/lib/auth";
import { FormError, int, ints, req, str, toFormError } from "@/lib/form";
import { appUrl, button, esc, sendMail } from "@/lib/mail";
import { notify } from "@/lib/notifications";
import { PRIORITIES } from "@/lib/meetings";
import {
  canEditTask,
  canWorkOnTask,
  expandAssignees,
  logTaskActivity,
  notifyTaskAssigned,
  TASK_CATEGORIES,
  TASK_STATUS_LABEL,
  TASK_STATUSES,
  type TaskStatus,
} from "@/lib/tasks";

const pick = <T extends readonly string[]>(list: T, v: string | null, fallback: T[number]): T[number] =>
  v && (list as readonly string[]).includes(v) ? (v as T[number]) : fallback;

async function loadTask(id: number) {
  const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id));
  return task;
}

/** Tells the creator when someone else completes their task. */
async function notifyCompleted(taskId: number, me: SessionUser) {
  const task = await db.query.tasks.findFirst({ where: eq(schema.tasks.id, taskId), with: { createdBy: { columns: { id: true, email: true, fullName: true } } } });
  if (!task?.createdBy || task.createdBy.id === me.id) return;
  await notify([task.createdBy.id], { kind: "TASK_COMPLETED", title: `Task completed: ${task.title}`, body: `Completed by ${me.name}`, href: `/tasks/${taskId}`, actorId: me.id });
  await sendMail(
    task.createdBy.email,
    `Task completed: ${task.title}`,
    "Task completed",
    `<p>Hello ${esc(task.createdBy.fullName)},</p><p>${esc(me.name)} completed <b>${esc(task.title)}</b>.</p>${button(appUrl(`/tasks/${taskId}`), "Open task")}`,
  );
}

async function applyStatus(me: SessionUser, taskId: number, status: TaskStatus, percent?: number) {
  const task = await loadTask(taskId);
  if (!task || !(await canWorkOnTask(me, task))) throw new FormError("You can't update this task.");
  const p = status === "COMPLETED" ? 100 : (percent ?? (task.status === "COMPLETED" ? 0 : task.percent));
  await db
    .update(schema.tasks)
    .set({ status, percent: Math.max(0, Math.min(100, p)), completedAt: status === "COMPLETED" ? (task.completedAt ?? new Date()) : null })
    .where(eq(schema.tasks.id, taskId));
  if (task.status !== status) {
    await logTaskActivity(taskId, me.id, "STATUS_CHANGED", { from: task.status, to: status });
    if (status === "COMPLETED") await notifyCompleted(taskId, me);
  } else if (percent !== undefined && percent !== task.percent) await logTaskActivity(taskId, me.id, "PROGRESS", { from: task.percent, to: p });
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

export async function saveTask(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: number | null;
  try {
    const me = await requireUser();
    id = int(fd, "id");
    const before = id ? await loadTask(id) : undefined;
    if (id && !before) throw new FormError("Task not found.");
    if (before && !canEditTask(me, before)) throw new FormError("Only the creator or an Admin can edit this task.");

    const data = {
      title: req(fd, "title", "Title"),
      description: str(fd, "description"),
      category: pick(TASK_CATEGORIES, str(fd, "category"), "GENERAL"),
      meetingId: int(fd, "meetingId"),
      clientId: int(fd, "clientId"),
      priority: pick(PRIORITIES, str(fd, "priority"), "MEDIUM"),
      startDate: str(fd, "startDate"),
      dueDate: str(fd, "dueDate"),
    };
    if (!data.dueDate) throw new FormError("Due date is required.");
    if (data.startDate && data.startDate > data.dueDate) throw new FormError("Start date must be on or before the due date.");
    const userIds = ints(fd, "userIds");
    const groupIds = ints(fd, "groupIds");
    if (!userIds.length && !groupIds.length) throw new FormError("Assign the task to at least one person or group.");

    // A meeting link implies its client
    if (data.meetingId && !data.clientId) {
      const [m] = await db.select({ clientId: schema.meetings.clientId }).from(schema.meetings).where(eq(schema.meetings.id, data.meetingId));
      data.clientId = m?.clientId ?? null;
    }

    const individual = !before && fd.get("groupMode") === "INDIVIDUAL" && groupIds.length > 0;
    const wanted = await expandAssignees(userIds, groupIds);

    if (individual) {
      // One separate task per person, each tracked on its own
      const createdIds: number[] = [];
      for (const [userId, viaGroupId] of wanted) {
        const [task] = await db.insert(schema.tasks).values({ ...data, createdById: me.id }).returning();
        await db.insert(schema.taskAssignees).values({ taskId: task.id, userId, viaGroupId });
        await logTaskActivity(task.id, me.id, "CREATED", { mode: "individual copy" });
        await notifyTaskAssigned(task.id, [userId], me.name, me.id);
        createdIds.push(task.id);
      }
      id = createdIds[0];
      revalidatePath("/tasks");
      redirect(`/tasks?msg=copies&n=${createdIds.length}`);
    }

    if (before) {
      await db.update(schema.tasks).set(data).where(eq(schema.tasks.id, before.id));
      const changed = (Object.keys(data) as (keyof typeof data)[]).filter((k) => String(before[k] ?? "") !== String(data[k] ?? ""));
      if (changed.length) await logTaskActivity(before.id, me.id, "UPDATED", { changed });
    } else {
      const [task] = await db.insert(schema.tasks).values({ ...data, createdById: me.id }).returning();
      id = task.id;
      await logTaskActivity(id, me.id, "CREATED");
    }
    const taskId = id!;

    const existing = await db.select().from(schema.taskAssignees).where(eq(schema.taskAssignees.taskId, taskId));
    const added = [...wanted.keys()].filter((u) => !existing.some((e) => e.userId === u));
    const removed = existing.filter((e) => !wanted.has(e.userId)).map((e) => e.userId);
    if (removed.length) await db.delete(schema.taskAssignees).where(and(eq(schema.taskAssignees.taskId, taskId), inArray(schema.taskAssignees.userId, removed)));
    for (const [userId, viaGroupId] of wanted)
      if (!existing.some((e) => e.userId === userId)) await db.insert(schema.taskAssignees).values({ taskId, userId, viaGroupId });
    await db.delete(schema.taskGroups).where(eq(schema.taskGroups.taskId, taskId));
    if (groupIds.length) await db.insert(schema.taskGroups).values(groupIds.map((groupId) => ({ taskId, groupId })));
    if (before && (added.length || removed.length)) await logTaskActivity(taskId, me.id, "ASSIGNEES_CHANGED", { added, removed });
    await notifyTaskAssigned(taskId, added.filter((u) => u !== me.id), me.name, me.id);

    // Status / progress on the same form
    const status = pick(TASK_STATUSES, str(fd, "status"), before?.status ?? "NOT_STARTED");
    const percent = int(fd, "percent") ?? undefined;
    if (!before || status !== before.status || percent !== before.percent) await applyStatus(me, taskId, status, percent);
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/tasks");
  redirect(`/tasks/${id}?msg=saved`);
}

/** Board drag-and-drop and the quick status buttons. */
export async function setTaskStatus(id: number, status: TaskStatus): Promise<{ error?: string; ok?: string }> {
  const me = await requireUser();
  if (!TASK_STATUSES.includes(status)) return { error: "Unknown status." };
  try {
    await applyStatus(me, id, status);
    return { ok: `Moved to ${TASK_STATUS_LABEL[status]}.` };
  } catch (e) {
    return toFormError(e);
  }
}

export async function updateProgress(id: number, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const me = await requireUser();
    await applyStatus(me, id, pick(TASK_STATUSES, str(fd, "status"), "IN_PROGRESS"), int(fd, "percent") ?? undefined);
    return { ok: "Progress saved." };
  } catch (e) {
    return toFormError(e);
  }
}

export async function addChecklistItem(id: number, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const me = await requireUser();
    const task = await loadTask(id);
    if (!task || !(await canWorkOnTask(me, task))) throw new FormError("You can't change this task.");
    const items = await db.select().from(schema.taskChecklist).where(eq(schema.taskChecklist.taskId, id));
    await db.insert(schema.taskChecklist).values({ taskId: id, text: req(fd, "text", "Item").slice(0, 300), position: items.length });
    revalidatePath(`/tasks/${id}`);
    return { ok: undefined };
  } catch (e) {
    return toFormError(e);
  }
}

export async function toggleChecklistItem(taskId: number, itemId: number, done: boolean) {
  const me = await requireUser();
  const task = await loadTask(taskId);
  if (!task || !(await canWorkOnTask(me, task))) return;
  await db.update(schema.taskChecklist).set({ done }).where(and(eq(schema.taskChecklist.id, itemId), eq(schema.taskChecklist.taskId, taskId)));
  // Checklist drives progress when the task has one
  const items = await db.select().from(schema.taskChecklist).where(eq(schema.taskChecklist.taskId, taskId));
  const pct = Math.round((items.filter((i) => i.done).length / items.length) * 100);
  const status: TaskStatus = pct === 100 ? task.status : task.status === "NOT_STARTED" && pct > 0 ? "IN_PROGRESS" : task.status;
  await db.update(schema.tasks).set({ percent: pct, status }).where(eq(schema.tasks.id, taskId));
  revalidatePath(`/tasks/${taskId}`);
}

export async function deleteChecklistItem(taskId: number, itemId: number) {
  const me = await requireUser();
  const task = await loadTask(taskId);
  if (!task || !(await canWorkOnTask(me, task))) return;
  await db.delete(schema.taskChecklist).where(and(eq(schema.taskChecklist.id, itemId), eq(schema.taskChecklist.taskId, taskId)));
  revalidatePath(`/tasks/${taskId}`);
}

/** Comments; "@username" or "@Firstname" emails the mentioned person. */
export async function addComment(id: number, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const me = await requireUser();
    const task = await loadTask(id);
    if (!task || !(await canWorkOnTask(me, task))) throw new FormError("You can't comment on this task.");
    const body = req(fd, "body", "Comment");
    await db.insert(schema.taskComments).values({ taskId: id, userId: me.id, body });
    const handles = [...body.matchAll(/@([\p{L}0-9._-]+)/gu)].map((m) => m[1].toLowerCase());
    if (handles.length) {
      const users = await db.select({ id: schema.users.id, username: schema.users.username, fullName: schema.users.fullName, email: schema.users.email }).from(schema.users).where(eq(schema.users.status, "ACTIVE"));
      const mentioned = users.filter((u) => u.id !== me.id && handles.some((h) => u.username === h || u.fullName.toLowerCase().split(" ")[0] === h));
      await notify(
        mentioned.map((u) => u.id),
        { kind: "MENTION", title: `${me.name} mentioned you on: ${task.title}`, body: body.length > 300 ? `${body.slice(0, 300)}…` : body, href: `/tasks/${id}`, actorId: me.id },
      );
      for (const u of mentioned)
        await sendMail(
          u.email,
          `${me.name} mentioned you on: ${task.title}`,
          "You were mentioned",
          `<p>Hello ${esc(u.fullName)},</p><p>${esc(me.name)} wrote on <b>${esc(task.title)}</b>:</p><blockquote style="border-left:3px solid #2E75B6;margin:0;padding:4px 12px;white-space:pre-wrap">${esc(body)}</blockquote>${button(appUrl(`/tasks/${id}`), "Open task")}`,
        );
      if (mentioned.length) await logTaskActivity(id, me.id, "MENTIONED", { users: mentioned.map((u) => u.fullName) });
    }
    revalidatePath(`/tasks/${id}`);
    return { ok: "Comment added." };
  } catch (e) {
    return toFormError(e);
  }
}

export async function deleteTask(id: number) {
  const me = await requireUser();
  const task = await loadTask(id);
  if (!task || !canEditTask(me, task)) redirect(`/tasks/${id}?msg=denied`);
  await db.delete(schema.tasks).where(eq(schema.tasks.id, id));
  revalidatePath("/tasks");
  redirect("/tasks?msg=deleted");
}
