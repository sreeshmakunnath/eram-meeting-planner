import Link from "next/link";
import { countActive, FilterBar, FilterField } from "@/components/filters";
import { Badge, Empty, Notice, PageHeader } from "@/components/ui";
import { teamIds } from "@/lib/access";
import { deleteLog } from "@/lib/actions/daily-log";
import { isAdmin, isSuperAdmin, requireUser } from "@/lib/auth";
import { ACTIVITY_LABEL, ALL_ACTIVITY_TYPES, canEditLog, defaultRange, EDIT_DAYS, fmtMinutes, listLogs, logWhere, type LogFilters, type LogRow } from "@/lib/daily-log";
import { fmtPlainDate } from "@/lib/meetings";
import { activeUsers, clientOptions } from "@/lib/queries";
import { LogForm } from "./log-form";
import { logFormOptions } from "./options";

const messages: Record<string, { tone: "ok" | "error"; text: string }> = {
  saved: { tone: "ok", text: "Entry saved." },
  deleted: { tone: "ok", text: "Entry deleted." },
  locked: { tone: "error", text: `Entries can only be changed by the person who wrote them, up to ${EDIT_DAYS} days after writing.` },
};

export default async function DailyLogPage(props: { searchParams: Promise<LogFilters & { msg?: string }> }) {
  const searchParams = await props.searchParams;
  const me = await requireUser();
  const f = searchParams;
  const range = defaultRange();
  const [options, rows, team, users, clients] = await Promise.all([logFormOptions(me), listLogs(logWhere(me, f)), teamIds(me.id), activeUsers(), clientOptions(me)]);
  const canSeeOthers = team.length > 0 || isAdmin(me);
  // People whose logs this viewer can open: everyone (Super Admin), their units' people (Admin), their team
  const people = users.filter((u) => u.id !== me.id && (isSuperAdmin(me) || team.includes(u.id) || (isAdmin(me) && u.buIds.some((b) => me.buIds.includes(b)))));
  const scope = f.scope ?? "mine";
  const qs = new URLSearchParams(Object.entries(f).filter(([k, v]) => v && k !== "msg") as [string, string][]).toString();
  const msg = f.msg ? messages[f.msg] : undefined;

  const days = new Map<string, LogRow[]>();
  for (const r of rows) days.set(r.logDate, [...(days.get(r.logDate) ?? []), r]);
  const total = rows.reduce((n, r) => n + (r.minutes ?? 0), 0);
  const byType = ALL_ACTIVITY_TYPES.map((t) => ({ t, n: rows.filter((r) => r.type === t).length, min: rows.filter((r) => r.type === t).reduce((n, r) => n + (r.minutes ?? 0), 0) })).filter((x) => x.n);
  const byPerson = scope === "mine" ? [] : [...new Set(rows.map((r) => r.user))].map((name) => ({ name, n: rows.filter((r) => r.user === name).length })).sort((a, b) => b.n - a.n);

  return (
    <>
      <PageHeader
        title="Daily log"
        subtitle={`What you did, in your own words: calls, visits, research, proposals. You can edit an entry for ${EDIT_DAYS} days. Meetings, tasks and new clients are added automatically as System entries.`}
        actions={
          <a href={`/api/log/export?${qs}`} className="btn-secondary">
            Export Excel
          </a>
        }
      />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <section className="card mb-4 p-4">
        <h2 className="mb-3 font-semibold text-navy">Log an activity</h2>
        <LogForm options={options} />
      </section>

      <FilterBar clearHref="/log" active={countActive(f as Record<string, string | undefined>, ["scope", "user", "client", "type", "source", "from", "to", "q"], { scope: "mine" })}>
        {canSeeOthers && (
          <FilterField label="Show">
            <select name="scope" defaultValue={scope} className="input">
              <option value="mine">My log</option>
              {team.length > 0 && <option value="team">My team&apos;s</option>}
              <option value="all">{isSuperAdmin(me) ? "Everyone's" : isAdmin(me) ? "My business units (and team)" : "Mine and my team's"}</option>
            </select>
          </FilterField>
        )}
        {canSeeOthers && (
          <FilterField label="Person">
            <select name="user" defaultValue={f.user ?? ""} className="input">
              <option value="">Anyone</option>
              {people.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
          </FilterField>
        )}
        <FilterField label="Client">
          <select name="client" defaultValue={f.client ?? ""} className="input">
            <option value="">All</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Type" size="sm">
          <select name="type" defaultValue={f.type ?? ""} className="input">
            <option value="">All</option>
            {ALL_ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACTIVITY_LABEL[t]}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Entries" size="sm">
          <select name="source" defaultValue={f.source ?? ""} className="input">
            <option value="">All</option>
            <option value="written">Written</option>
            <option value="system">System</option>
          </select>
        </FilterField>
        <FilterField label="From" size="sm">
          <input type="date" name="from" defaultValue={f.from ?? range.from} className="input" />
        </FilterField>
        <FilterField label="To" size="sm">
          <input type="date" name="to" defaultValue={f.to ?? range.to} className="input" />
        </FilterField>
        <FilterField label="Search">
          <input name="q" defaultValue={f.q} placeholder="Words in the entry" className="input" />
        </FilterField>
      </FilterBar>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          {rows.length === 0 ? (
            <Empty>Nothing logged for these filters.</Empty>
          ) : (
            [...days].map(([day, list]) => {
              const mins = list.reduce((n, r) => n + (r.minutes ?? 0), 0);
              return (
                <section key={day}>
                  <h3 className="flex justify-between border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-navy">
                    {fmtPlainDate(day)}
                    <span className="font-normal text-slate-500">
                      {list.length} entr{list.length === 1 ? "y" : "ies"}
                      {mins ? ` · ${fmtMinutes(mins)}` : ""}
                    </span>
                  </h3>
                  <ul className="divide-y divide-slate-100">
                    {list.map((r) => (
                      <li key={r.id} className="px-4 py-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="blue">{ACTIVITY_LABEL[r.type]}</Badge>
                          {r.system && <Badge>System</Badge>}
                          {r.userId !== me.id && <b className="text-slate-700">{r.user}</b>}
                          {r.minutes ? <span className="text-xs text-slate-500">{fmtMinutes(r.minutes)}</span> : null}
                          {canEditLog(me, r) && (
                            <span className="ml-auto flex gap-3 text-xs">
                              <Link href={`/log/${r.id}/edit`} className="link">
                                Edit
                              </Link>
                              <form action={deleteLog.bind(null, r.id)}>
                                <button className="text-slate-500 hover:text-red-600">Delete</button>
                              </form>
                            </span>
                          )}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-slate-800">{r.description}</p>
                        {(r.client || r.task || r.meeting) && (
                          <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                            {r.client && (
                              <Link href={`/clients/${r.clientId}?tab=log`} className="hover:underline">
                                Client: {r.client}
                              </Link>
                            )}
                            {r.task && (
                              <Link href={`/tasks/${r.taskId}`} className="hover:underline">
                                Task: {r.task}
                              </Link>
                            )}
                            {r.meeting && (
                              <Link href={`/meetings/${r.meetingId}`} className="hover:underline">
                                Meeting: {r.meeting}
                              </Link>
                            )}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })
          )}
        </div>

        <aside className="card h-fit p-4 text-sm">
          <h3 className="mb-2 font-semibold text-navy">Summary</h3>
          <p className="mb-3 text-slate-500">
            {fmtPlainDate(f.from || range.from)} – {fmtPlainDate(f.to || range.to)}: {rows.length} entr{rows.length === 1 ? "y" : "ies"}
            {total ? `, ${fmtMinutes(total)} logged` : ""}
          </p>
          {byType.length > 0 && (
            <table className="w-full">
              <tbody className="divide-y divide-slate-100">
                {byType.map((x) => (
                  <tr key={x.t}>
                    <td className="py-1.5">{ACTIVITY_LABEL[x.t]}</td>
                    <td className="py-1.5 text-right font-semibold">{x.n}</td>
                    <td className="py-1.5 pl-3 text-right text-xs text-slate-500">{fmtMinutes(x.min)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {byPerson.length > 0 && (
            <>
              <h4 className="mb-1 mt-4 font-semibold text-navy">By person</h4>
              <ul className="divide-y divide-slate-100">
                {byPerson.map((p) => (
                  <li key={p.name} className="flex justify-between py-1.5">
                    {p.name}
                    <b>{p.n}</b>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
