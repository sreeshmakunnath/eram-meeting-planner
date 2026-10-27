import Link from "next/link";
import { Badge, Empty, Notice, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fmtPlainDate, PRIORITY_LABEL } from "@/lib/meetings";
import { listTasks, type TaskFilters } from "@/lib/task-queries";
import { CATEGORY_LABEL, TASK_STATUS_LABEL, TASK_STATUS_TONE } from "@/lib/tasks";
import { TaskFilterBar } from "./task-filters";
import { NewTaskButton, TaskTabs } from "./task-nav";

const BUCKETS: [string, string][] = [
  ["today", "Today"],
  ["week", "This week"],
  ["overdue", "Overdue"],
  ["upcoming", "Upcoming"],
  ["open", "All open"],
  ["completed", "Completed"],
  ["any", "Everything"],
];

export default async function TasksPage({ searchParams }: { searchParams: TaskFilters & { msg?: string; n?: string } }) {
  const me = await requireUser();
  const bucket = searchParams.bucket ?? "open";
  const rows = await listTasks(me, searchParams);
  const keep = Object.entries(searchParams).filter(([k, v]) => v && !["msg", "n", "bucket"].includes(k)) as [string, string][];
  const qsFor = (b: string) => new URLSearchParams([...keep, ["bucket", b]]).toString();
  const qs = new URLSearchParams(Object.entries(searchParams).filter(([k, v]) => v && !["msg", "n"].includes(k)) as [string, string][]).toString();

  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle="Agreed actions from Meeting Briefs appear here automatically."
        actions={
          <>
            <a href={`/api/tasks/export?${qs}`} className="btn-secondary">
              Export Excel
            </a>
            <NewTaskButton />
          </>
        }
      />
      <TaskTabs active="list" qs={keep.length ? new URLSearchParams(keep).toString() : ""} />
      {searchParams.msg === "deleted" && <Notice tone="ok">Task deleted.</Notice>}
      {searchParams.msg === "copies" && <Notice tone="ok">Created {searchParams.n} separate tasks, one per person.</Notice>}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {BUCKETS.map(([b, l]) => (
          <Link
            key={b}
            href={`/tasks?${qsFor(b)}`}
            className={`rounded-full border px-3 py-1 text-sm ${bucket === b ? "border-navy bg-navy text-white" : b === "overdue" ? "border-red-200 bg-white text-red-700 hover:bg-red-50" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            {l}
          </Link>
        ))}
      </div>
      <TaskFilterBar me={me} f={searchParams} />
      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <Empty>
            No tasks here.{" "}
            <Link href="/tasks/new" className="link">
              Create one
            </Link>
          </Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Client</th>
                <th>Assigned to</th>
                <th>Due</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Progress</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="min-w-[14rem]">
                    <Link href={`/tasks/${r.id}`} className="link">
                      {r.title}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {CATEGORY_LABEL[r.category]}
                      {r.fromBrief && " · from Meeting Brief"}
                      {r.parentId && <> · subtask of <Link href={`/tasks/${r.parentId}`} className="hover:underline">{r.parentTitle}</Link></>}
                    </div>
                  </td>
                  <td>
                    {r.client ? (
                      <Link href={`/clients/${r.clientId}?tab=tasks`} className="hover:underline">
                        {r.client}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="min-w-[10rem] text-slate-600">
                    {r.assignees || "—"}
                    {r.groups && <div className="text-xs text-slate-500">Group: {r.groups}</div>}
                  </td>
                  <td className={`whitespace-nowrap ${r.overdue ? "font-semibold text-red-600" : ""}`}>
                    {fmtPlainDate(r.dueDate)}
                    {r.overdue && <div className="text-xs font-normal">Overdue</div>}
                  </td>
                  <td>{PRIORITY_LABEL[r.priority]}</td>
                  <td>
                    <Badge tone={TASK_STATUS_TONE[r.status]}>{TASK_STATUS_LABEL[r.status]}</Badge>
                  </td>
                  <td className="w-28">
                    <div className="h-1.5 rounded-full bg-slate-100">
                      <div className="h-1.5 rounded-full bg-brand" style={{ width: `${r.percent}%` }} />
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">{r.percent}%</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
