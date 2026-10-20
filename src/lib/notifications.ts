import { and, count, desc, eq, isNull, lt, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";

export type NotificationKind =
  | "MEETING_INVITE"
  | "MEETING_UPDATED"
  | "MEETING_CONFIRMED"
  | "MEETING_CANCELLED"
  | "BRIEF_SUBMITTED"
  | "TASK_ASSIGNED"
  | "TASK_COMPLETED"
  | "MENTION"
  | "GROUP_ADDED";

/**
 * Saves an in-app notification for each user (the person who caused it is left out).
 * Like sendMail, it never fails the action that triggered it.
 */
export async function notify(userIds: number[], n: { kind: NotificationKind; title: string; body?: string | null; href?: string | null; actorId?: number | null }) {
  const ids = [...new Set(userIds)].filter((id) => id && id !== n.actorId);
  if (!ids.length) return;
  try {
    await db.insert(schema.notifications).values(
      ids.map((userId) => ({
        userId,
        kind: n.kind,
        title: n.title.slice(0, 200),
        body: n.body?.slice(0, 1000) ?? null,
        href: n.href ?? null,
        actorId: n.actorId ?? null,
      })),
    );
  } catch (e) {
    console.error("notify failed", n.kind, e);
  }
}

export async function unreadCount(userId: number) {
  const [row] = await db
    .select({ n: count() })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)));
  return row?.n ?? 0;
}

export async function listNotifications(userId: number, limit = 100) {
  // Housekeeping: read notifications older than 90 days are dropped.
  await db
    .delete(schema.notifications)
    .where(and(eq(schema.notifications.userId, userId), isNotNull(schema.notifications.readAt), lt(schema.notifications.createdAt, new Date(Date.now() - 90 * 86400_000))));
  return db
    .select({
      id: schema.notifications.id,
      kind: schema.notifications.kind,
      title: schema.notifications.title,
      body: schema.notifications.body,
      href: schema.notifications.href,
      readAt: schema.notifications.readAt,
      createdAt: schema.notifications.createdAt,
      actor: schema.users.fullName,
    })
    .from(schema.notifications)
    .leftJoin(schema.users, eq(schema.notifications.actorId, schema.users.id))
    .where(eq(schema.notifications.userId, userId))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit);
}
