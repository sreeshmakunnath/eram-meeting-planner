import { and, desc, eq, notLike } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import { clientVisibleTo } from "./access";
import type { SessionUser } from "./auth";
import { visibleTo } from "./meetings";
import { taskVisibleTo } from "./tasks";

export type ActivityItem = { kind: "meeting" | "task" | "client"; id: number; title: string; action: string; user: string | null; at: Date; href: string };

/** Latest changes to meetings, tasks and clients the viewer can see, newest first. */
export async function recentActivity(viewer: SessionUser, limit = 15): Promise<ActivityItem[]> {
  const actor = alias(schema.users, "actor");
  const ma = schema.meetingActivity;
  const ta = schema.taskActivity;
  const al = schema.auditLogs;
  const [meetings, tasks, clients] = await Promise.all([
    db
      .select({ id: schema.meetings.id, title: schema.meetings.title, action: ma.action, user: actor.fullName, at: ma.createdAt })
      .from(ma)
      .innerJoin(schema.meetings, eq(ma.meetingId, schema.meetings.id))
      .leftJoin(actor, eq(ma.userId, actor.id))
      .where(visibleTo(viewer))
      .orderBy(desc(ma.createdAt))
      .limit(limit),
    db
      .select({ id: schema.tasks.id, title: schema.tasks.title, action: ta.action, user: actor.fullName, at: ta.createdAt })
      .from(ta)
      .innerJoin(schema.tasks, eq(ta.taskId, schema.tasks.id))
      .leftJoin(actor, eq(ta.userId, actor.id))
      .where(taskVisibleTo(viewer))
      .orderBy(desc(ta.createdAt))
      .limit(limit),
    // Client changes, without contact entries (contacts can be private)
    db
      .select({ id: schema.clients.id, title: schema.clients.name, action: al.action, user: actor.fullName, at: al.createdAt })
      .from(al)
      .innerJoin(schema.clients, eq(al.entityId, schema.clients.id))
      .leftJoin(actor, eq(al.userId, actor.id))
      .where(and(eq(al.entity, "client"), notLike(al.action, "CONTACT%"), clientVisibleTo(viewer)))
      .orderBy(desc(al.createdAt))
      .limit(limit),
  ]);
  return [
    ...meetings.map((r) => ({ ...r, kind: "meeting" as const, href: `/meetings/${r.id}` })),
    ...tasks.map((r) => ({ ...r, kind: "task" as const, href: `/tasks/${r.id}` })),
    ...clients.map((r) => ({ ...r, kind: "client" as const, href: `/clients/${r.id}` })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, limit);
}
