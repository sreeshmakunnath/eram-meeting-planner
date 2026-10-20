"use server";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";

export async function markAllNotificationsRead() {
  const me = await requireUser();
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notifications.userId, me.id), isNull(schema.notifications.readAt)));
  revalidatePath("/", "layout");
}
