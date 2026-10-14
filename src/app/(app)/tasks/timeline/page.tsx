import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fmtPlainDate, todayRiyadh } from "@/lib/meetings";
import { listTasks, type TaskFilters } from "@/lib/task-queries";
import { TASK_STATUS_LABEL } from "@/lib/tasks";
import { TaskFilterBar } from "../task-filters";
import { NewTaskButton, TaskTabs } from "../task-nav";

const DAYS = 42; // six weeks
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const diff = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400_000);
const BAR: Record<string, string> = {
  NOT_STARTED: "bg-slate-300",
  STARTED: "bg-brand/60",
  IN_PROGRESS: "bg-brand",
  ON_HOLD: "bg-amber-400",
  COMPLETED: "bg-emerald-500",
};

export default async function TimelinePage({ searchParams }: { searchParams: TaskFilters & { start?: string } }) {
  const me = await requireUser();
  const today = todayRiyadh();
  const thisSunday = addDays(today, -new Date(`${today}T00:00:00Z`).getUTCDay());
  const start = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.start ?? "") ? searchParams.start! : addDays(thisSunday, -7);
  const end = addDays(start, DAYS);
  const rows = (await listTasks(me, { ...searchParams, bucket: "any" }))
    .filter((r) => r.dueDate && r.status !== "CANCELLED")
    .map((r) => ({ ...r, s: (r.startDate ?? r.dueDate)!.slice(0, 10), e: r.dueDate!.slice(0, 10) }))
    .filter((r) => r.e >= start && r.s < end)
    .sort((a, b) => (a.assignees || "~").localeCompare(b.assignees || "~") || a.s.localeCompare(b.s));
  const keep = Object.entries(searchParams).filter(([k, v]) => v && k !== "start") as [string, string][];
  const nav = (d: string) => `/tasks/timeline?${new URLSearchParams([...keep, ["start", d]])}`;
  const days = Array.from({ length: DAYS }, (_, i) => addDays(start, i));
  const col = (d: string) => Math.max(0, Math.min(DAYS, diff(d, start)));

  return (
    <>
      <PageHeader title="Task timeline" subtitle="Each bar runs from the task's start date (or due date) to its due date." actions={<NewTaskButton />} />
      <TaskTabs active="timeline" qs={new URLSearchParams(keep).toString()} />
      <TaskFilterBar me={me} f={searchParams} showBucket={false} />
      <div className="mb-3 flex items-center gap-2">
        <Link href={nav(addDays(start, -14))} className="btn-secondary px-3" aria-label="Earlier">
          ←
        </Link>
        <Link href={nav(addDays(thisSunday, -7))} className="btn-secondary">
          Today
        </Link>
        <Link href={nav(addDays(start, 14))} className="btn-secondary px-3" aria-label="Later">
          →
        </Link>
        <span className="ml-2 text-sm font-semibold text-navy">
          {fmtPlainDate(start)} – {fmtPlainDate(addDays(end, -1))}
        </span>
      </div>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <Empty>No tasks with due dates in these six weeks.</Empty>
        ) : (
          <div className="min-w-[960px]">
            <div className="grid border-b border-slate-200 bg-slate-50 text-[10px] text-slate-500" style={{ gridTemplateColumns: `16rem repeat(${DAYS}, minmax(0, 1fr))` }}>
              <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide">Task · assignee</div>
              {days.map((d) => {
                const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
                return (
                  <div key={d} className={`border-l border-slate-200 py-2 text-center ${dow >= 5 ? "bg-slate-100" : ""} ${d === today ? "font-bold text-brand" : ""}`}>
                    {dow === 0 || d === start ? <div className="font-semibold">{new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}</div> : <div>&nbsp;</div>}
                    {Number(d.slice(8))}
                  </div>
                );
              })}
            </div>
            {rows.map((r) => {
              const from = col(r.s);
              const to = Math.max(from + 1, col(addDays(r.e, 1)));
              return (
                <div key={r.id} className="grid items-center border-b border-slate-100 text-sm hover:bg-slate-50" style={{ gridTemplateColumns: `16rem repeat(${DAYS}, minmax(0, 1fr))` }}>
                  <div className="truncate px-3 py-2">
                    <Link href={`/tasks/${r.id}`} className="link">
                      {r.title}
                    </Link>
                    <div className="truncate text-xs text-slate-500">{r.assignees || "Unassigned"}</div>
                  </div>
                  <div className="relative h-full py-2" style={{ gridColumn: `2 / span ${DAYS}` }}>
                    {(() => {
                      const t = diff(today, start);
                      return t >= 0 && t < DAYS ? <div className="absolute inset-y-0 w-px bg-brand/50" style={{ left: `${((t + 0.5) / DAYS) * 100}%` }} /> : null;
                    })()}
                    <Link
                      href={`/tasks/${r.id}`}
                      title={`${r.title} · ${TASK_STATUS_LABEL[r.status]} · due ${fmtPlainDate(r.e)}`}
                      className={`relative block h-5 rounded ${BAR[r.status] ?? "bg-slate-300"} ${r.overdue ? "ring-2 ring-red-500" : ""}`}
                      style={{ marginLeft: `${(from / DAYS) * 100}%`, width: `${((to - from) / DAYS) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
        {Object.entries(BAR).map(([s, c]) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`inline-block h-3 w-5 rounded ${c}`} />
            {TASK_STATUS_LABEL[s as keyof typeof TASK_STATUS_LABEL]}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded bg-slate-300 ring-2 ring-red-500" /> Overdue
        </span>
      </div>
    </>
  );
}
