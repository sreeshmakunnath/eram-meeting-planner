import Link from "next/link";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { createBdTasks, importTargetSchedule } from "@/lib/actions/target";
import { canManageClient, teamIds } from "@/lib/access";
import { isAdmin, requireUser } from "@/lib/auth";
import { activeUsers } from "@/lib/queries";
import { fmtPlainDate } from "@/lib/meetings";
import { CATEGORY_LABEL, TASK_STATUS_LABEL, TASK_STATUS_TONE } from "@/lib/tasks";
import { batches, targetScheduleRows, type Cell, type TargetRow } from "@/lib/target-schedule";
import { BdTasksDialog, type BdTaskDefault } from "./bd-tasks-dialog";
import { TargetImportForm } from "./import-form";

/** One BD step: due date, owner and current status. */
function Step({ c }: { c: Cell }) {
  if (!c) return <span className="text-xs text-slate-300">Not started yet</span>;
  const due = (
    <span className={`whitespace-nowrap ${c.overdue ? "font-semibold text-red-600" : c.status === "COMPLETED" ? "text-emerald-700" : "text-slate-700"}`}>
      {c.due ? fmtPlainDate(c.due) : "No due date"}
      {c.overdue && " · overdue"}
    </span>
  );
  return (
    <div className="space-y-0.5">
      {c.canOpen ? (
        <Link href={`/tasks/${c.taskId}`} className="hover:underline">
          {due}
        </Link>
      ) : (
        due
      )}
      <div className="text-xs text-slate-600">{c.owners || "Unassigned"}</div>
      <Badge tone={TASK_STATUS_TONE[c.status]}>{TASK_STATUS_LABEL[c.status]}</Badge>
    </div>
  );
}

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
  const [rows, batchList, users, team] = await Promise.all([targetScheduleRows(me, searchParams.batch), batches(), activeUsers(), teamIds(me.id)]);
  const people = users.map(({ id, fullName }) => ({ id, fullName }));
  // Who may create BD tasks on each row (Admins of the client's units, the account owner and their managers)
  const manageable = new Set((await Promise.all(rows.map(async (r) => ((await canManageClient(me, r)) ? r.id : null)))).filter((id) => id !== null));
  return (
    <>
      <PageHeader
        title="BD Tracker"
        subtitle={`${searchParams.batch ?? "All batches"} · each company's four BD steps: due date, owner and status. Shown to account owners, their managers and Admins.`}
        actions={
          <>
            {(isAdmin(me) || team.length > 0) && (
              <a href="/bd-report" className="btn-secondary">
                Monthly report
              </a>
            )}
            <a href={`/api/reports/target-schedule${searchParams.batch ? `?batch=${encodeURIComponent(searchParams.batch)}` : ""}`} className="btn-secondary">
              Export Excel
            </a>
          </>
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
          <Empty>No target companies for you here. The tracker lists clients you own, your team owns, or (for Admins) your business units&apos; clients.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Company</th>
                {BD_STEPS.map((s) => (
                  <th key={s.cell}>{CATEGORY_LABEL[s.category]}</th>
                ))}
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
                    <div className="text-xs text-slate-500">{[r.location, r.batch && !searchParams.batch ? r.batch : null].filter(Boolean).join(" · ")}</div>
                    <div className="text-xs text-slate-500">Owner: {r.accountOwner ?? "—"}</div>
                  </td>
                  {BD_STEPS.map((s) => (
                    <td key={s.cell} className="min-w-[9rem] align-top">
                      <Step c={r[s.cell]} />
                    </td>
                  ))}
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
