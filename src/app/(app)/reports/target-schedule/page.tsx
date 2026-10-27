import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { createBdTasks, importTargetSchedule } from "@/lib/actions/target";
import { canManageClient } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { activeUsers } from "@/lib/queries";
import { fmtPlainDate } from "@/lib/meetings";
import { CATEGORY_LABEL, TASK_STATUS_LABEL } from "@/lib/tasks";
import { batches, targetScheduleRows, type Cell, type TargetRow } from "@/lib/target-schedule";
import { BdTasksDialog, type BdTaskDefault } from "./bd-tasks-dialog";
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

/** BD steps in schedule order, with default due dates spread a week apart from today. */
const BD_STEPS = [
  { category: "MARKET_RESEARCH", cell: "research", days: 7 },
  { category: "MIR_REPORT", cell: "mir", days: 14 },
  { category: "APPROACH", cell: "approach", days: 21 },
  { category: "FOLLOW_UP", cell: "followUp", days: 28 },
] as const;
const inDays = (n: number) => new Date(Date.now() + 3 * 3600_000 + n * 86400_000).toISOString().slice(0, 10); // Riyadh date

function missingBdTasks(r: TargetRow): BdTaskDefault[] {
  return BD_STEPS.filter((s) => !r[s.cell]).map((s) => ({
    category: s.category,
    label: CATEGORY_LABEL[s.category],
    title: `${CATEGORY_LABEL[s.category]} – ${r.name}`,
    due: inDays(s.days),
  }));
}

export default async function TargetSchedulePage({ searchParams }: { searchParams: { batch?: string } }) {
  const me = await requireUser();
  const [rows, batchList, users] = await Promise.all([targetScheduleRows(me, searchParams.batch), batches(), activeUsers()]);
  const people = users.map(({ id, fullName }) => ({ id, fullName }));
  // Who may create BD tasks on each row (Admins of the client's units, the account owner)
  const manageable = new Set((await Promise.all(rows.map(async (r) => ((await canManageClient(me, r)) ? r.id : null)))).filter((id) => id !== null));
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
                    {manageable.has(r.id) && missingBdTasks(r).length > 0 && (
                      <BdTasksDialog
                        action={createBdTasks.bind(null, r.id)}
                        clientName={r.name}
                        tasks={missingBdTasks(r)}
                        people={people}
                        defaultAssigneeId={r.accountOwnerId ?? me.id}
                        partial={r.hasTasks}
                      />
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
