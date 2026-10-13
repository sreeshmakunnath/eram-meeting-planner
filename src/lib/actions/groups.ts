"use server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { FormError, int, ints, req, str, toFormError } from "@/lib/form";
import { esc, sendMail } from "@/lib/mail";
import { GROUP_TYPES } from "@/lib/queries";

export async function saveGroup(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: number | null;
  try {
    const admin = await requireAdmin();
    id = int(fd, "id");
    const type = str(fd, "type") as (typeof GROUP_TYPES)[number];
    if (!GROUP_TYPES.includes(type)) throw new FormError("Group type is required.");
    const data = {
      name: req(fd, "name", "Group name"),
      description: str(fd, "description"),
      type,
      leadUserId: int(fd, "leadUserId"),
      status: str(fd, "status") === "ARCHIVED" ? ("ARCHIVED" as const) : ("ACTIVE" as const),
    };
    const memberIds = ints(fd, "memberIds");
    if (data.leadUserId && !memberIds.includes(data.leadUserId)) memberIds.push(data.leadUserId);
    if (!memberIds.length) throw new FormError("Add at least one member.");

    if (id) {
      await db.update(schema.groups).set(data).where(eq(schema.groups.id, id));
    } else {
      const [g] = await db.insert(schema.groups).values(data).returning();
      id = g.id;
    }

    const current = (await db.select().from(schema.groupMembers).where(eq(schema.groupMembers.groupId, id))).map((m) => m.userId);
    const toAdd = memberIds.filter((u) => !current.includes(u));
    const toRemove = current.filter((u) => !memberIds.includes(u));
    if (toRemove.length)
      await db.delete(schema.groupMembers).where(and(eq(schema.groupMembers.groupId, id), inArray(schema.groupMembers.userId, toRemove)));
    if (toAdd.length) {
      await db.insert(schema.groupMembers).values(toAdd.map((userId) => ({ groupId: id!, userId })));
      const added = await db
        .select({ email: schema.users.email, fullName: schema.users.fullName })
        .from(schema.users)
        .where(inArray(schema.users.id, toAdd));
      const [lead] = data.leadUserId
        ? await db.select({ fullName: schema.users.fullName }).from(schema.users).where(eq(schema.users.id, data.leadUserId))
        : [];
      for (const u of added) {
        await sendMail(
          u.email,
          `You've been added to ${data.name}`,
          "Added to a group",
          `<p>Hello ${esc(u.fullName)},</p><p>You are now a member of <b>${esc(data.name)}</b>${lead ? `, led by ${esc(lead.fullName)}` : ""}. Meetings and tasks assigned to this group will include you.</p>`,
        );
      }
    }
    await audit(admin.id, fd.get("id") ? "GROUP_UPDATED" : "GROUP_CREATED", "group", id, {
      name: data.name,
      membersAdded: toAdd,
      membersRemoved: toRemove,
    });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/groups");
  redirect(`/groups/${id}?msg=saved`);
}

export async function deleteGroup(id: number) {
  const admin = await requireAdmin();
  const [g] = await db.select().from(schema.groups).where(eq(schema.groups.id, id));
  if (g) {
    await db.update(schema.clients).set({ accountGroupId: null }).where(eq(schema.clients.accountGroupId, id));
    await db.delete(schema.groups).where(eq(schema.groups.id, id));
    await audit(admin.id, "GROUP_DELETED", "group", id, { name: g.name });
  }
  revalidatePath("/groups");
  redirect("/groups?msg=deleted");
}
