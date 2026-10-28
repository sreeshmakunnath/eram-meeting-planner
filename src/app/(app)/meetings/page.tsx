import Link from "next/link";
import { countActive, FilterBar, FilterField } from "@/components/filters";
import { Badge, Empty, Notice, PageHeader, Tabs } from "@/components/ui";
import { selectableBus } from "@/lib/access";
import { isSuperAdmin, requireUser } from "@/lib/auth";
import { listMeetings, type MeetingFilters } from "@/lib/meeting-queries";
import { fmtDay, fmtPlainDate, fmtTime, PRIORITY_LABEL, STATUS_LABEL, STATUS_TONE, TYPE_LABEL } from "@/lib/meetings";
import { activeGroups, activeUsers, clientOptions } from "@/lib/queries";

const priorityTone = { HIGH: "red", MEDIUM: "amber", LOW: "gray" } as const;

export default async function MeetingsPage({ searchParams }: { searchParams: MeetingFilters & { msg?: string } }) {
  const me = await requireUser();
  const [rows, clients, users, groups, units] = await Promise.all([
    listMeetings(me, searchParams),
    clientOptions(me),
    activeUsers(),
    activeGroups(),
    selectableBus(me),
  ]);
  const qs = new URLSearchParams(Object.entries(searchParams).filter(([k, v]) => v && k !== "msg") as [string, string][]).toString();
  const status = searchParams.status ?? "ALL";

  return (
    <>
      <PageHeader
        title="Client Meeting Planner"
        subtitle={`${rows.length} meeting${rows.length === 1 ? "" : "s"}${me.role === "SUPER_ADMIN" ? "" : me.role === "ADMIN" ? " in your business units or that you're involved in" : " you or your team are involved in"}`}
        actions={
          <>
            <a href={`/api/meetings/export?${qs}`} className="btn-secondary">
              Export Excel
            </a>
            {isSuperAdmin(me) && (
              <Link href="/meetings/import" className="btn-secondary">
                Import Excel
              </Link>
            )}
            <Link href="/meetings/new" className="btn-primary">
              New meeting
            </Link>
          </>
        }
      />
      <Tabs
        active="/meetings"
        items={[
          { href: "/meetings", label: "Planner list" },
          { href: "/meetings/calendar", label: "Calendar" },
        ]}
      />
      {searchParams.msg === "deleted" && <Notice tone="ok">Meeting deleted.</Notice>}
      {searchParams.msg === "imported" && <Notice tone="ok">Import finished.</Notice>}

<FilterBar
        keep={{}}
        clearHref="/meetings"
        active={countActive(searchParams, ["q", "status", "priority", "bu", "client", "user", "group", "from", "to"], { status: "ALL" })}
      >
        <FilterField label="Search" size="lg">
          <input name="q" defaultValue={searchParams.q} placeholder="Title, client or agenda" className="input" />
        </FilterField>
        <FilterField label="Status">
          <select name="status" defaultValue={status} className="input">
            <option value="ALL">All</option>
            <option value="OPEN">Open (not done)</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Priority" size="sm">
          <select name="priority" defaultValue={searchParams.priority ?? ""} className="input">
            <option value="">Any</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </FilterField>
        {units.length > 1 && (
          <FilterField label="Business unit">
            <select name="bu" defaultValue={searchParams.bu ?? ""} className="input">
              <option value="">All</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </FilterField>
        )}
        <FilterField label="Client">
          <select name="client" defaultValue={searchParams.client ?? ""} className="input">
            <option value="">All</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Attendee">
          <select name="user" defaultValue={searchParams.user ?? ""} className="input">
            <option value="">Anyone</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Group" size="sm">
          <select name="group" defaultValue={searchParams.group ?? ""} className="input">
            <option value="">Any</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="From" size="sm">
          <input type="date" name="from" defaultValue={searchParams.from} className="input" />
        </FilterField>
        <FilterField label="To" size="sm">
          <input type="date" name="to" defaultValue={searchParams.to} className="input" />
        </FilterField>
      </FilterBar>

      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <Empty>
            No meetings match.{" "}
            <Link href="/meetings/new" className="link">
              Plan one
            </Link>
          </Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Priority</th>
                <th>Client / meeting</th>
                <th>Date & time</th>
                <th>Status</th>
                <th>ERAM attendees</th>
                <th>Objective / agenda</th>
                <th>Next action</th>
                <th>Follow-up</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td>
                    <Badge tone={priorityTone[r.priority]}>{PRIORITY_LABEL[r.priority]}</Badge>
                  </td>
                  <td className="min-w-[12rem]">
                    <Link href={`/meetings/${r.id}`} className="link">
                      {r.client ?? r.title}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {TYPE_LABEL[r.type]}
                      {r.location ? ` · ${r.location}` : ""}
                    </div>
                  </td>
                  <td className="whitespace-nowrap">
                    {r.startAt ? (
                      <>
                        {fmtDay(r.startAt)}
                        <div className="text-xs text-slate-500">
                          {fmtTime(r.startAt)}–{fmtTime(r.endAt)}
                        </div>
                      </>
                    ) : (
                      <span className="text-slate-400">Not set</span>
                    )}
                  </td>
                  <td>
                    <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                    {r.briefStatus === "SUBMITTED" && <div className="mt-1 text-xs text-emerald-700">Brief submitted</div>}
                  </td>
                  <td className="min-w-[10rem] text-slate-600">{r.attendees || "—"}</td>
                  <td className="min-w-[14rem] max-w-xs text-slate-600">{r.objective}</td>
                  <td className="min-w-[12rem] max-w-xs text-slate-600">
                    {r.nextAction || "—"}
                    {r.owners && <div className="text-xs text-slate-500">Owner: {r.owners}</div>}
                  </td>
                  <td className="whitespace-nowrap">{fmtPlainDate(r.followUpDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
