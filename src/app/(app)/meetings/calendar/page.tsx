import { and, asc, eq, exists, ne, sql, type SQL } from "drizzle-orm";
import Link from "next/link";
import { Badge, PageHeader, Tabs } from "@/components/ui";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { meetingsBetween, toBeScheduled } from "@/lib/meeting-queries";
import { tasksDueBetween } from "@/lib/task-queries";
import { fmtPlainDate, fmtTime, riyadh, riyadhParts, STATUS_CHIP, STATUS_LABEL, todayRiyadh } from "@/lib/meetings";
import { activeGroups, activeUsers } from "@/lib/queries";

type Search = { month?: string; view?: string; user?: string; group?: string; client?: string; tasks?: string };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const shiftMonth = (ym: string, n: number) => {
  const [y, mo] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

export default async function CalendarPage({ searchParams }: { searchParams: Search }) {
  const me = await requireUser();
  const today = todayRiyadh();
  const ym = /^\d{4}-\d{2}$/.test(searchParams.month ?? "") ? searchParams.month! : today.slice(0, 7);
  const view = searchParams.view === "agenda" ? "agenda" : "month";
  const first = `${ym}-01`;
  const gridStart = addDays(first, -new Date(`${first}T00:00:00Z`).getUTCDay()); // weeks start Sunday
  const lastOfMonth = addDays(shiftMonth(ym, 1) + "-01", -1);
  const weeks = Math.ceil((Date.parse(`${lastOfMonth}T00:00:00Z`) - Date.parse(`${gridStart}T00:00:00Z`)) / (7 * 86400_000) + 1 / 7);
  const gridEnd = addDays(gridStart, weeks * 7);

  const m = schema.meetings;
  const extra: SQL[] = [];
  if (searchParams.user)
    extra.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(schema.meetingAttendees)
          .where(and(eq(schema.meetingAttendees.meetingId, m.id), eq(schema.meetingAttendees.userId, Number(searchParams.user)))),
      ),
    );
  if (searchParams.group)
    extra.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(schema.meetingGroups)
          .where(and(eq(schema.meetingGroups.meetingId, m.id), eq(schema.meetingGroups.groupId, Number(searchParams.group)))),
      ),
    );
  if (searchParams.client) extra.push(eq(m.clientId, Number(searchParams.client)));
  const filter = extra.length ? and(...extra) : undefined;

  const showTasks = searchParams.tasks !== "0";
  const taskFilter = searchParams.client ? eq(schema.tasks.clientId, Number(searchParams.client)) : undefined;
  const [meetings, pending, users, groups, clients, dueTasks] = await Promise.all([
    meetingsBetween(me, riyadh(gridStart, "00:00"), riyadh(gridEnd, "00:00"), filter),
    toBeScheduled(me, filter),
    activeUsers(),
    activeGroups(),
    db.select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients).where(ne(schema.clients.status, "INACTIVE")).orderBy(asc(schema.clients.name)),
    showTasks && !searchParams.user && !searchParams.group ? tasksDueBetween(me, gridStart, gridEnd, taskFilter) : Promise.resolve([]),
  ]);
  const tasksByDay = new Map<string, typeof dueTasks>();
  for (const t of dueTasks) {
    const d = t.dueDate!.slice(0, 10);
    tasksByDay.set(d, [...(tasksByDay.get(d) ?? []), t]);
  }
  const byDay = new Map<string, typeof meetings>();
  for (const x of meetings) {
    const d = riyadhParts(x.startAt!).date;
    byDay.set(d, [...(byDay.get(d) ?? []), x]);
  }
  const keep = Object.entries(searchParams).filter(([k, v]) => v && k !== "month" && k !== "view") as [string, string][];
  const href = (patch: Record<string, string>) => `/meetings/calendar?${new URLSearchParams({ ...Object.fromEntries(keep), month: ym, view, ...patch })}`;
  const [y, mo] = ym.split("-").map(Number);

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle="Meetings by date, in Saudi time. Click a day to plan a meeting on it."
        actions={
          <Link href="/meetings/new" className="btn-primary">
            New meeting
          </Link>
        }
      />
      <Tabs
        active="/meetings/calendar"
        items={[
          { href: "/meetings", label: "Planner list" },
          { href: "/meetings/calendar", label: "Calendar" },
        ]}
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={href({ month: shiftMonth(ym, -1) })} className="btn-secondary px-3" aria-label="Previous month">
            ←
          </Link>
          <Link href={href({ month: today.slice(0, 7) })} className="btn-secondary">
            Today
          </Link>
          <Link href={href({ month: shiftMonth(ym, 1) })} className="btn-secondary px-3" aria-label="Next month">
            →
          </Link>
          <h2 className="ml-2 text-lg font-semibold text-navy">
            {MONTHS[mo - 1]} {y}
          </h2>
        </div>
        <div className="flex gap-1 rounded-md border border-slate-300 bg-white p-0.5 text-sm">
          <Link href={href({ view: "month" })} className={`rounded px-3 py-1 ${view === "month" ? "bg-navy text-white" : "text-slate-600"}`}>
            Month
          </Link>
          <Link href={href({ view: "agenda" })} className={`rounded px-3 py-1 ${view === "agenda" ? "bg-navy text-white" : "text-slate-600"}`}>
            Agenda
          </Link>
        </div>
      </div>
      <form className="card mb-4 flex flex-wrap gap-3 p-3">
        <input type="hidden" name="month" value={ym} />
        <input type="hidden" name="view" value={view} />
        <select name="user" defaultValue={searchParams.user ?? ""} className="input max-w-[14rem]">
          <option value="">{me.role === "ADMIN" ? "Everyone" : "All my meetings"}</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.id === me.id ? `Me (${u.fullName})` : u.fullName}
            </option>
          ))}
        </select>
        <select name="group" defaultValue={searchParams.group ?? ""} className="input max-w-[14rem]">
          <option value="">Any group</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" name="tasks" value="0" defaultChecked={!showTasks} className="accent-brand" /> Hide task due dates
        </label>
        <select name="client" defaultValue={searchParams.client ?? ""} className="input max-w-[14rem]">
          <option value="">Any client</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button className="btn-secondary">Apply</button>
      </form>

      <div className="grid gap-6 xl:grid-cols-4">
        <div className="xl:col-span-3">
          {view === "month" ? (
            <div className="card overflow-hidden">
              <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                {DAYS.map((d) => (
                  <div key={d} className={`py-2 ${d === "Fri" || d === "Sat" ? "text-slate-400" : ""}`}>
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i)).map((d, i) => {
                  const inMonth = d.startsWith(ym);
                  const list = byDay.get(d) ?? [];
                  const weekend = i % 7 >= 5;
                  return (
                    <div
                      key={d}
                      className={`group relative min-h-[6.5rem] border-b border-r border-slate-100 p-1.5 ${inMonth ? (weekend ? "bg-slate-50/60" : "bg-white") : "bg-slate-50 text-slate-400"}`}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${d === today ? "bg-brand font-bold text-white" : ""}`}>{Number(d.slice(8))}</span>
                        <Link href={`/meetings/new?date=${d}`} className="rounded px-1 text-sm text-slate-400 opacity-0 hover:text-brand group-hover:opacity-100" aria-label={`New meeting on ${d}`}>
                          +
                        </Link>
                      </div>
                      <div className="space-y-1">
                        {list.slice(0, 4).map((x) => (
                          <Link key={x.id} href={`/meetings/${x.id}`} title={`${x.title} · ${STATUS_LABEL[x.status]}`} className={`block truncate rounded border px-1.5 py-0.5 text-[11px] leading-tight ${STATUS_CHIP[x.status]}`}>
                            <b>{fmtTime(x.startAt)}</b> {x.client ?? x.title}
                          </Link>
                        ))}
                        {(tasksByDay.get(d) ?? []).slice(0, Math.max(0, 4 - list.length)).map((t) => (
                          <Link
                            key={`t${t.id}`}
                            href={`/tasks/${t.id}`}
                            title={`Task due: ${t.title}`}
                            className={`block truncate rounded border border-dashed px-1.5 py-0.5 text-[11px] leading-tight ${t.status === "COMPLETED" ? "border-emerald-300 text-emerald-700 line-through" : t.dueDate!.slice(0, 10) < today ? "border-red-300 text-red-700" : "border-slate-300 text-slate-600"}`}
                          >
                            ☐ {t.title}
                          </Link>
                        ))}
                        {list.length + (tasksByDay.get(d)?.length ?? 0) > 4 && (
                          <Link href={href({ view: "agenda" })} className="block px-1 text-[11px] text-slate-500">
                            +{list.length + (tasksByDay.get(d)?.length ?? 0) - 4} more
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="card divide-y divide-slate-100">
              {[...byDay.entries()].filter(([d]) => d.startsWith(ym)).length === 0 && <div className="px-4 py-10 text-center text-sm text-slate-500">No meetings this month.</div>}
              {[...byDay.entries()]
                .filter(([d]) => d.startsWith(ym))
                .map(([d, list]) => (
                  <div key={d} className="grid gap-2 px-4 py-3 md:grid-cols-5">
                    <div className={`text-sm font-semibold ${d === today ? "text-brand" : "text-navy"}`}>{fmtPlainDate(d)}</div>
                    <ul className="space-y-1.5 md:col-span-4">
                      {list.map((x) => (
                        <li key={x.id} className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="w-24 text-slate-500">
                            {fmtTime(x.startAt)}–{fmtTime(x.endAt)}
                          </span>
                          <Link href={`/meetings/${x.id}`} className="link">
                            {x.title}
                          </Link>
                          <span className={`rounded border px-1.5 text-[11px] ${STATUS_CHIP[x.status]}`}>{STATUS_LABEL[x.status]}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            {(["SCHEDULED", "CONFIRMED", "COMPLETED", "CANCELLED"] as const).map((s) => (
              <span key={s} className={`rounded border px-1.5 py-0.5 ${STATUS_CHIP[s]}`}>
                {STATUS_LABEL[s]}
              </span>
            ))}
            {showTasks && <span className="rounded border border-dashed border-slate-300 px-1.5 py-0.5 text-slate-600">☐ Task due</span>}
          </div>
        </div>

        <aside className="card self-start">
          <h3 className="border-b border-slate-200 px-4 py-3 font-semibold text-navy">
            To Be Scheduled <span className="font-normal text-slate-500">({pending.length})</span>
          </h3>
          {pending.length ? (
            <ul className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto">
              {pending.map((p) => (
                <li key={p.id} className="px-4 py-2.5 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/meetings/${p.id}/edit`} className="link">
                      {p.client ?? p.title}
                    </Link>
                    {p.priority === "HIGH" && <Badge tone="red">High</Badge>}
                  </div>
                  {p.followUpDate && <div className="text-xs text-slate-500">Follow up by {fmtPlainDate(p.followUpDate)}</div>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-sm text-slate-500">Nothing waiting for a date.</p>
          )}
        </aside>
      </div>
    </>
  );
}
