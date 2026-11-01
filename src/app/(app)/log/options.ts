import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { SessionUser } from "@/lib/auth";
import { EDIT_DAYS } from "@/lib/daily-log";
import { meetingsBetween } from "@/lib/meeting-queries";
import { fmtDay, involves, todayRiyadh } from "@/lib/meetings";
import { clientOptions } from "@/lib/queries";
import { OPEN_STATUSES } from "@/lib/tasks";
import type { LogFormOptions } from "./log-form";

/** Pick lists for the log form: clients they can see, their open tasks, their meetings of the last two weeks. */
export async function logFormOptions(me: SessionUser, include: { taskId?: number | null; meetingId?: number | null } = {}): Promise<LogFormOptions> {
  const now = new Date();
  const t = schema.tasks;
  const mine = sql`(${t.createdById} = ${me.id} or exists (select 1 from task_assignees ta where ta.task_id = ${t.id} and ta.user_id = ${me.id}))`;
  const [clients, tasks, meetings] = await Promise.all([
    clientOptions(me),
    db
      .select({ id: t.id, name: t.title })
      .from(t)
      .where(or(and(mine, inArray(t.status, OPEN_STATUSES)), include.taskId ? eq(t.id, include.taskId) : undefined))
      .orderBy(t.dueDate),
    meetingsBetween(me, new Date(now.getTime() - 14 * 86400_000), new Date(now.getTime() + 86400_000), involves(me.id)),
  ]);
  const today = todayRiyadh();
  return {
    clients,
    tasks,
    meetings: meetings.map((m) => ({ id: m.id, name: `${fmtDay(m.startAt)} · ${m.client ?? m.title}` })).reverse(),
    today,
    minDate: new Date(Date.parse(`${today}T00:00:00Z`) - EDIT_DAYS * 86400_000).toISOString().slice(0, 10),
  };
}
