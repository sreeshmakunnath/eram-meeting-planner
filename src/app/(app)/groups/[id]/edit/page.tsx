import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { GroupForm } from "../../group-form";

export default async function EditGroupPage({ params }: { params: { id: string } }) {
  await requireAdmin();
  const id = Number(params.id);
  const [group] = Number.isInteger(id) ? await db.select().from(schema.groups).where(eq(schema.groups.id, id)) : [];
  if (!group) notFound();
  const members = await db.select().from(schema.groupMembers).where(eq(schema.groupMembers.groupId, id));
  return (
    <>
      <PageHeader title={`Edit ${group.name}`} />
      <GroupForm group={group} memberIds={members.map((m) => m.userId)} />
    </>
  );
}
