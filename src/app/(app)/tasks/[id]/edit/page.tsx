import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { canEditTask } from "@/lib/tasks";
import { TaskForm } from "../../task-form";

export default async function EditTaskPage({ params }: { params: { id: string } }) {
  const me = await requireUser();
  const id = Number(params.id);
  const [task] = Number.isInteger(id) ? await db.select().from(schema.tasks).where(eq(schema.tasks.id, id)) : [];
  if (!task) notFound();
  if (!(await canEditTask(me, task))) redirect(`/tasks/${id}?msg=denied`);
  const [assignees, groups] = await Promise.all([
    db.select().from(schema.taskAssignees).where(eq(schema.taskAssignees.taskId, id)),
    db.select().from(schema.taskGroups).where(eq(schema.taskGroups.taskId, id)),
  ]);
  return (
    <>
      <PageHeader title={`Edit: ${task.title}`} />
      <TaskForm me={me} task={task} userIds={assignees.filter((a) => a.viaGroupId === null).map((a) => a.userId)} groupIds={groups.map((g) => g.groupId)} />
    </>
  );
}
