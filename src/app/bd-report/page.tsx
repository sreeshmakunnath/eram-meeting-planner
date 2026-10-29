import { redirect } from "next/navigation";
import { DueDelta } from "@/components/due-delta";
import { Logo } from "@/components/logo";
import { PrintButton } from "@/components/print-button";
import { fmtDateTime } from "@/components/ui";
import { selectableBus, teamIds } from "@/lib/access";
import { isAdmin, requireUser } from "@/lib/auth";
import { BD_STEPS, bdMonthlyReport } from "@/lib/bd-report";
import { fmtPlainDate, riyadhParts, todayRiyadh } from "@/lib/meetings";
import { BD_STAGE_LABELS } from "@/lib/queries";
import { CATEGORY_LABEL, completionDelta, TASK_STATUS_LABEL } from "@/lib/tasks";
import type { Cell } from "@/lib/target-schedule";

export const dynamic = "force-dynamic";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const STATUS_CLS: Record<string, string> = {
  COMPLETED: "bg-emerald-50 text-emerald-800 border-emerald-200",
  ON_HOLD: "bg-amber-50 text-amber-800 border-amber-200",
  NOT_STARTED: "bg-slate-50 text-slate-600 border-slate-200",
};

/** One BD step in the client table: status, due date, and for completed steps the day it was done (early / late). */
function StepCell({ c, first, next }: { c: Cell; first: string; next: string }) {
  if (!c) return <span className="text-slate-300">—</span>;
  const doneOn = c.completedAt ? riyadhParts(c.completedAt).date : null;
  const doneThisMonth = !!doneOn && doneOn >= first && doneOn < next;
  return (
    <div className="space-y-0.5 leading-tight">
      <span className={`inline-block rounded border px-1 text-[10px] font-medium ${STATUS_CLS[c.status] ?? "bg-brand-50 text-brand-600 border-brand/30"} ${c.overdue ? "!border-red-300 !bg-red-50 !text-red-700" : ""}`}>
        {TASK_STATUS_LABEL[c.status]}
        {c.overdue && " · overdue"}
      </span>
      <div className="text-[11px] text-slate-600">Due {c.due ? fmtPlainDate(c.due) : "—"}</div>
      {c.status === "COMPLETED" && doneOn && (
        <div className={`text-[11px] ${doneThisMonth ? "font-semibold" : ""}`}>
          Done {fmtPlainDate(doneOn)} <DueDelta days={completionDelta(c.due, c.completedAt)} />
        </div>
      )}
      <div className="text-[10px] text-slate-500">{c.owners || "Unassigned"}</div>
    </div>
  );
}

/**
 * Printable monthly BD progress report: for one business unit (BU Admins: their units; Super Admins: any), or for a
 * manager's team (the clients they and their reportees own).
 */
export default async function BdReport({ searchParams }: { searchParams: { bu?: string; month?: string } }) {
  const me = await requireUser();
  const [units, team] = await Promise.all([isAdmin(me) ? selectableBus(me) : Promise.resolve([]), teamIds(me.id)]);
  const isManager = team.length > 0;
  if (!units.length && !isManager) redirect("/reports/target-schedule");
  // "team", a unit id, or the only choice there is
  const choice =
    searchParams.bu === "team" && isManager
      ? ("team" as const)
      : (units.find((u) => u.id === Number(searchParams.bu)) ?? (units.length === 1 && !isManager ? units[0] : !units.length ? ("team" as const) : undefined));
  const bu = choice === "team" ? { id: "team" as const, name: `${me.name}'s team` } : choice;
  const ym = /^\d{4}-\d{2}$/.test(searchParams.month ?? "") ? searchParams.month! : todayRiyadh().slice(0, 7);

  const picker = (
    <form className="mb-6 flex flex-wrap items-end gap-3 print:hidden">
      <a href="/reports/target-schedule" className="link mr-auto self-center text-sm">
        ← BD tracker
      </a>
      <label className="text-sm">
        <span className="label">Report for</span>
        <select name="bu" defaultValue={bu?.id ?? ""} className="input" required>
          <option value="">Choose…</option>
          {isManager && <option value="team">My team (clients my reportees and I own)</option>}
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="label">Month</span>
        <input type="month" name="month" defaultValue={ym} className="input" required />
      </label>
      <button className="btn-secondary">Show report</button>
      {bu && <PrintButton />}
    </form>
  );
  if (!bu)
    return (
      <div className="mx-auto max-w-[297mm] bg-white p-8">
        {picker}
        <p className="text-sm text-slate-500">Choose what the report is for, and the month.</p>
      </div>
    );

  const r = await bdMonthlyReport(me, bu.id === "team" ? { team: true } : { bu: bu.id }, ym);
  const { first, lastDay, asOf } = r.period;
  const next = new Date(Date.parse(`${lastDay}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10);
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  const kpis: [string, string | number, string?][] = [
    ["Target clients", r.totals.clients, `${r.totals.notStarted} not started`],
    ["Steps due this month", r.totals.dueInMonth, `${r.totals.dueInMonthDone} done`],
    ["Steps completed", r.totals.completed, `${pct(r.totals.onTime, r.totals.completed)} on time`],
    ["Overdue steps", r.totals.overdue, `as of ${fmtPlainDate(asOf)}`],
    ["Client meetings held", r.totals.meetings],
    ["All 4 steps done", r.totals.fullyDone, `of ${r.totals.clients} clients`],
  ];
  const section = "mb-2 mt-6 border-b-2 border-navy pb-1 text-sm font-bold uppercase tracking-wide text-navy break-after-avoid";

  return (
    <div className="mx-auto max-w-[297mm] bg-white p-8 text-[12px] print:p-0">
      {picker}
      <style>{"@page { size: A4 landscape; margin: 12mm; }"}</style>

      <div className="flex items-center justify-between gap-4">
        <Logo on="light" className="h-12" />
        <div className="text-right text-[11px] text-slate-500">
          Generated {fmtDateTime(new Date())} by {me.name}
          <br />
          Statuses as of {fmtPlainDate(todayRiyadh())}
        </div>
      </div>
      <div className="mt-3 bg-navy px-4 py-3 text-center text-lg font-bold tracking-wide text-white">
        BD PROGRESS REPORT | {bu.name.toUpperCase()} | {monthName(ym).toUpperCase()}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 md:grid-cols-6 print:grid-cols-6">
        {kpis.map(([label, v, sub]) => (
          <div key={label} className="rounded border border-slate-200 bg-navy-50 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
            <div className={`text-2xl font-bold ${label === "Overdue steps" && Number(v) > 0 ? "text-red-600" : "text-navy"}`}>{v}</div>
            {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
          </div>
        ))}
      </div>

      <h2 className={section}>Progress by client</h2>
      {r.rows.length === 0 ? (
        <p className="text-slate-500">No BD target clients for {bu.name}.</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-navy-50 text-left text-[10px] uppercase tracking-wide text-navy">
              <th className="border border-slate-300 px-2 py-1.5">Client</th>
              {BD_STEPS.map((s) => (
                <th key={s.cell} className="border border-slate-300 px-2 py-1.5">
                  {CATEGORY_LABEL[s.category]}
                </th>
              ))}
              <th className="border border-slate-300 px-2 py-1.5 text-center">Meetings</th>
            </tr>
          </thead>
          <tbody>
            {r.rows.map((c) => (
              <tr key={c.id} className="break-inside-avoid align-top">
                <td className="border border-slate-300 px-2 py-1.5">
                  <div className="font-semibold text-slate-800">{c.name}</div>
                  <div className="text-[10px] text-slate-500">{[c.location, c.batch].filter(Boolean).join(" · ")}</div>
                  <div className="text-[10px] text-slate-500">Owner: {c.accountOwner ?? "—"}</div>
                  {c.bdStage && <div className="text-[10px] text-slate-500">Stage: {BD_STAGE_LABELS[c.bdStage] ?? c.bdStage}</div>}
                </td>
                {BD_STEPS.map((s) => (
                  <td key={s.cell} className="w-[17%] border border-slate-300 px-2 py-1.5">
                    <StepCell c={c[s.cell]} first={first} next={next} />
                  </td>
                ))}
                <td className="border border-slate-300 px-2 py-1.5 text-center">{c.meetings || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="grid gap-6 md:grid-cols-2 print:grid-cols-2">
        <div>
          <h2 className={section}>Completed in {monthName(ym)}</h2>
          {r.completed.length === 0 ? (
            <p className="text-slate-500">No BD steps completed this month.</p>
          ) : (
            <table className="w-full">
              <tbody>
                {r.completed.map((x) => (
                  <tr key={x.cell.taskId} className="border-b border-slate-100">
                    <td className="py-1 pr-2">{x.client}</td>
                    <td className="py-1 pr-2">{CATEGORY_LABEL[x.category]}</td>
                    <td className="py-1 pr-2 text-slate-500">{x.cell.owners}</td>
                    <td className="whitespace-nowrap py-1 text-right">
                      {fmtPlainDate(riyadhParts(x.cell.completedAt!).date)} <DueDelta days={x.delta} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div>
          <h2 className={section}>Overdue as of {fmtPlainDate(asOf)}</h2>
          {r.overdue.length === 0 ? (
            <p className="text-slate-500">Nothing overdue.</p>
          ) : (
            <table className="w-full">
              <tbody>
                {r.overdue.map((x) => (
                  <tr key={x.cell.taskId} className="border-b border-slate-100">
                    <td className="py-1 pr-2">{x.client}</td>
                    <td className="py-1 pr-2">{CATEGORY_LABEL[x.category]}</td>
                    <td className="py-1 pr-2 text-slate-500">{x.cell.owners || "Unassigned"}</td>
                    <td className="whitespace-nowrap py-1 text-right font-semibold text-red-600">
                      {x.daysLate} day{x.daysLate === 1 ? "" : "s"} late
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {r.stageChanges.length > 0 && (
        <>
          <h2 className={section}>BD stage changes</h2>
          <table className="w-full">
            <tbody>
              {r.stageChanges.map((s, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="w-32 py-1 pr-2 text-slate-500">{fmtPlainDate(riyadhParts(s.at).date)}</td>
                  <td className="py-1 pr-2">{s.client}</td>
                  <td className="py-1 pr-2">
                    {(s.from && BD_STAGE_LABELS[s.from]) || "—"} → <b>{(s.to && BD_STAGE_LABELS[s.to]) || "—"}</b>
                  </td>
                  <td className="py-1 text-slate-500">{s.by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <p className="mt-6 text-[10px] text-slate-400">
        ERAM Meeting Planner · {bu.name} · {fmtPlainDate(first)} – {fmtPlainDate(lastDay)} · Each step shows its status today; &quot;Done&quot; dates in bold fall in this month.
      </p>
    </div>
  );
}

