import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listTasks, type TaskFilters } from "@/lib/task-queries";
import { TaskFilterBar } from "../task-filters";
import { NewTaskButton, TaskTabs } from "../task-nav";
import { Board } from "./board";

export default async function BoardPage({ searchParams }: { searchParams: TaskFilters }) {
  const me = await requireUser();
  const rows = (await listTasks(me, { ...searchParams, bucket: "any" })).filter(
    (r) => r.status !== "CANCELLED" && (r.status !== "COMPLETED" || (r.completedAt && Date.now() - r.completedAt.getTime() < 14 * 86400_000)),
  );
  const qs = new URLSearchParams(Object.entries(searchParams).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <>
      <PageHeader title="Task board" subtitle="Drag a card to change its status. Completed shows the last 14 days." actions={<NewTaskButton />} />
      <TaskTabs active="board" qs={qs} />
      <TaskFilterBar me={me} f={searchParams} path="/tasks/board" showBucket={false} />
      <Board
        cards={rows.map((r) => ({
          id: r.id,
          title: r.title,
          status: r.status,
          client: r.client,
          assignees: r.assignees,
          dueDate: r.dueDate,
          overdue: r.overdue,
          priority: r.priority,
          canMove: me.role !== "USER" || r.createdById === me.id || (r.assigneeIds ?? []).includes(me.id),
        }))}
      />
    </>
  );
}
