import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fmtPlainDate, todayRiyadh } from "@/lib/meetings";
import { listTasks } from "@/lib/task-queries";
import { OPEN_STATUSES, TASK_STATUS_LABEL } from "@/lib/tasks";

type Stat = { key: string; name: string; href: string; open: number; overdue: number; week: number; done30: number };

export default async function TaskReportPage() {
  const me = await requireUser();
  const all = await listTasks(me, { scope: "all", bucket: "any" }, 10000);
  const today = todayRiyadh();
  const in7 = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86400_000).toISOString().slice(0, 10);
  const since30 = Date.now() - 30 * 86400_000;
  const tally = (s: Stat, r: (typeof all)[number]) => {
    const open = OPEN_STATUSES.includes(r.status);
    const due = r.dueDate?.slice(0, 10);
    if (open) s.open++;
    if (r.overdue) s.overdue++;
    if (open && due && due >= today && due < in7) s.week++;
    if (r.status === "COMPLETED" && r.completedAt && r.completedAt.getTime() > since30) s.done30++;
  };
  const people = new Map<string, Stat>();
  const groups = new Map<string, Stat>();
  for (const r of all) {
    const names = r.assignees ? r.assignees.split(", ") : ["Unassigned"];
    names.forEach((n, i) => {
      const id = r.assigneeIds?.[i];
      const key = n;
      if (!people.has(key)) people.set(key, { key, name: n, href: id ? `/tasks?scope=all&user=${id}` : "/tasks?scope=all", open: 0, overdue: 0, week: 0, done30: 0 });
      tally(people.get(key)!, r);
    });
    for (const g of r.groups ? r.groups.split(", ") : []) {
      if (!groups.has(g)) groups.set(g, { key: g, name: g, href: "/tasks?scope=all", open: 0, overdue: 0, week: 0, done30: 0 });
      tally(groups.get(g)!, r);
    }
  }
  const overdue = all.filter((r) => r.overdue);
  const byStatus = Object.keys(TASK_STATUS_LABEL).map((s) => [s, all.filter((r) => r.status === s).length] as const);

  const Table = ({ title, rows }: { title: string; rows: Stat[] }) => (
    <section className="card overflow-x-auto">
      <h2 className="border-b border-slate-200 px-4 py-3 font-semibold text-navy">{title}</h2>
      {rows.length === 0 ? (
        <Empty>Nothing yet.</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th className="text-right">Open</th>
              <th className="text-right">Overdue</th>
              <th className="text-right">Due in 7 days</th>
              <th className="text-right">Done (30 days)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows
              .sort((a, b) => b.overdue - a.overdue || b.open - a.open)
              .map((s) => (
                <tr key={s.key}>
                  <td>
                    <Link href={s.href} className="link">
                      {s.name}
                    </Link>
                  </td>
                  <td className="text-right">{s.open}</td>
                  <td className={`text-right ${s.overdue ? "font-semibold text-red-600" : ""}`}>{s.overdue}</td>
                  <td className="text-right">{s.week}</td>
                  <td className="text-right text-emerald-700">{s.done30}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </section>
  );

  return (
    <>
      <PageHeader
        title="Task report"
        subtitle={me.role === "ADMIN" ? "Workload and progress across the organisation." : "Tasks you can see."}
        actions={
          <a href="/api/tasks/export?scope=all&bucket=any" className="btn-secondary">
            Export all tasks
          </a>
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {byStatus.map(([s, n]) => (
          <Link key={s} href={`/tasks?scope=all&bucket=any&status=${s}`} className="card p-4 hover:border-brand/40">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{TASK_STATUS_LABEL[s as keyof typeof TASK_STATUS_LABEL]}</div>
            <div className="mt-1 text-2xl font-bold text-navy">{n}</div>
          </Link>
        ))}
      </div>
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Table title="By person" rows={[...people.values()]} />
        <Table title="By group" rows={[...groups.values()]} />
      </div>
      <section className="card overflow-x-auto">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold text-navy">Overdue ({overdue.length})</h2>
          <a href="/api/tasks/export?scope=all&bucket=overdue" className="link text-sm">
            Export overdue
          </a>
        </div>
        {overdue.length === 0 ? (
          <Empty>Nothing overdue.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Client</th>
                <th>Assigned to</th>
                <th>Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {overdue.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/tasks/${r.id}`} className="link">
                      {r.title}
                    </Link>
                  </td>
                  <td>{r.client ?? "—"}</td>
                  <td>{r.assignees || "—"}</td>
                  <td className="whitespace-nowrap font-semibold text-red-600">{fmtPlainDate(r.dueDate)}</td>
                  <td>{TASK_STATUS_LABEL[r.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
