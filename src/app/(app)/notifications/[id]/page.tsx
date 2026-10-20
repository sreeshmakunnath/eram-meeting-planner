import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";

/** Opening a notification: mark it read, then go to what it's about. */
export default async function OpenNotification({ params }: { params: { id: string } }) {
  const me = await requireUser();
  const id = Number(params.id);
  if (!Number.isInteger(id)) redirect("/notifications");
  const [n] = await db
    .select({ href: schema.notifications.href })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.id, id), eq(schema.notifications.userId, me.id)));
  if (!n) redirect("/notifications");
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notifications.id, id), isNull(schema.notifications.readAt)));
  redirect(n.href ?? "/notifications");
}
