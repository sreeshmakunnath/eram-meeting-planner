import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { createBdTasks, importTargetSchedule } from "@/lib/actions/target";
import { requireUser } from "@/lib/auth";
import { fmtPlainDate } from "@/lib/meetings";
import { TASK_STATUS_LABEL } from "@/lib/tasks";
import { batches, targetScheduleRows, type Cell } from "@/lib/target-schedule";
import { TargetImportForm } from "./import-form";

function Due({ c }: { c: Cell }) {
  if (!c) return <span className="text-slate-300">—</span>;
  return (
    <Link href={`/tasks/${c.taskId}`} className={`whitespace-nowrap hover:underline ${c.overdue ? "font-semibold text-red-600" : c.status === "COMPLETED" ? "text-emerald-700" : ""}`}>
      {c.due ? fmtPlainDate(c.due) : "No date"}
      {c.status === "COMPLETED" && " ✓"}
    </Link>
  );
}
const statusCls = (s: string | null) =>
  s === "COMPLETED" ? "text-emerald-700" : s === "ON_HOLD" ? "text-amber-700" : s === "NOT_STARTED" || !s ? "text-slate-500" : "text-brand-600";

export default async function TargetSchedulePage({ searchParams }: { searchParams: { batch?: string } }) {
  const me = await requireUser();
  const [rows, batchList] = await Promise.all([targetScheduleRows(me, searchParams.batch), batches()]);
  return (
    <>
      <PageHeader
        title="BD Target Schedule"
        subtitle={`${searchParams.batch ?? "All batches"} · built from each company's Market research, MIR, Approach and Follow-up tasks. Red = overdue.`}
        actions={
          <a href={`/api/reports/target-schedule${searchParams.batch ? `?batch=${encodeURIComponent(searchParams.batch)}` : ""}`} className="btn-secondary">
            Export Excel
          </a>
        }
      />
      {me.role === "SUPER_ADMIN" && <TargetImportForm action={importTargetSchedule} />}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {[undefined, ...batchList].map((b) => (
          <Link
            key={b ?? "all"}
            href={b ? `/reports/target-schedule?batch=${encodeURIComponent(b)}` : "/reports/target-schedule"}
            className={`rounded-full border px-3 py-1 text-sm ${searchParams.batch === b ? "border-navy bg-navy text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            {b ?? "All"}
          </Link>
        ))}
      </div>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <Empty>No target companies yet. Import a schedule, or set a batch on a client.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Company</th>
                <th>Location</th>
                <th>Market research deadline</th>
                <th>MIR report deadline</th>
                <th>Research / MIR owner</th>
                <th>Research / MIR status</th>
                <th>Approach deadline</th>
                <th>Follow-up deadline</th>
                <th>Approach owner</th>
                <th>Approach status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="text-slate-400">{i + 1}</td>
                  <td className="min-w-[10rem]">
                    <Link href={`/clients/${r.id}?tab=tasks`} className="link">
                      {r.name}
                    </Link>
                    {r.batch && !searchParams.batch && <div className="text-xs text-slate-500">{r.batch}</div>}
                  </td>
                  <td className="whitespace-nowrap">{r.location}</td>
                  <td>
                    <Due c={r.research} />
                  </td>
                  <td>
                    <Due c={r.mir} />
                  </td>
                  <td className="text-slate-600">{r.researchOwner || "—"}</td>
                  <td className={statusCls(r.researchStatus)}>{r.researchStatus ? TASK_STATUS_LABEL[r.researchStatus] : "—"}</td>
                  <td>
                    <Due c={r.approach} />
                  </td>
                  <td>
                    <Due c={r.followUp} />
                  </td>
                  <td className="text-slate-600">{r.approachOwner || "—"}</td>
                  <td className={statusCls(r.approachStatus)}>{r.approachStatus ? TASK_STATUS_LABEL[r.approachStatus] : "—"}</td>
                  <td className="min-w-[10rem] text-xs text-slate-500">
                    {r.notes}
                    {!r.hasTasks && (
                      <form action={createBdTasks.bind(null, r.id)}>
                        <button className="text-xs font-medium text-brand hover:underline">+ Create BD tasks</button>
                      </form>
                    )}
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
