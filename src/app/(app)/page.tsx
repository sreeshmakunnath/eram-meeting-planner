import { and, asc, eq, exists, gte, inArray, isNull, lt, ne, notInArray, or, sql } from "drizzle-orm";
import Link from "next/link";
import { Notice, PageHeader, Tabs } from "@/components/ui";
import { db, schema } from "@/db";
import { requireUser, type SessionUser } from "@/lib/auth";
import { BD_STAGE_LABELS, BD_STAGES } from "@/lib/queries";
import { meetingsBetween } from "@/lib/meeting-queries";
import { listTasks } from "@/lib/task-queries";
import { TaskMiniList } from "@/components/task-mini-list";
import { BuTable, KpiTile, MonthColumns, OrderedBars, StackedShare } from "@/components/dashboard-charts";
import { clientStatusRows, FLAGS, type Flag } from "@/lib/client-status";
import { orgStats } from "@/lib/org-stats";
import { fmtDay, fmtTime, riyadh, STATUS_CHIP, STATUS_LABEL, todayRiyadh, visibleTo } from "@/lib/meetings";

function Tile({ label, value, href }: { label: string; value: number | string; href?: string }) {
  const body = (
    <div className="card h-full p-4 transition hover:border-brand/40">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-bold text-navy">{value}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

const count = sql<number>`count(*)`.mapWith(Number);
const m = schema.meetings;

export default async function Dashboard({ searchParams }: { searchParams: { denied?: string; tab?: string } }) {
  const me = await requireUser();
  const isAdmin = me.role === "ADMIN";
  const tab = isAdmin && searchParams.tab === "org" ? "org" : "mine";

  return (
    <>
      <PageHeader title={`Welcome, ${me.name.split(" ")[0]}`} subtitle={isAdmin ? "Your work and the organisation overview." : "Your dashboard."} />
      {searchParams.denied && <Notice tone="error">That page is for Admins only.</Notice>}
      {isAdmin && (
        <Tabs
          active={tab === "org" ? "/?tab=org" : "/"}
          items={[
            { href: "/", label: "My work" },
            { href: "/?tab=org", label: "Organisation overview" },
          ]}
        />
      )}
      {tab === "org" ? <OrgOverview me={me} /> : <MyWork me={me} />}
    </>
  );
}

async function MyWork({ me }: { me: SessionUser }) {
  const personal = { ...me, role: "USER" as const }; // "my" numbers, even for Admins
  const today = todayRiyadh();
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const weekStart = riyadh(new Date(Date.parse(`${today}T00:00:00Z`) - dow * 86400_000).toISOString().slice(0, 10), "00:00");
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400_000);
  const now = new Date();
  const [myGroupList, myWeek, upcoming, [briefsPending], [myActions], myOpen] = await Promise.all([
    db
      .select({ id: schema.groups.id, name: schema.groups.name })
      .from(schema.groupMembers)
      .innerJoin(schema.groups, eq(schema.groupMembers.groupId, schema.groups.id))
      .where(eq(schema.groupMembers.userId, me.id))
      .orderBy(asc(schema.groups.name)),
    meetingsBetween(personal, weekStart, weekEnd, notInArray(m.status, ["CANCELLED"])),
    meetingsBetween(personal, now, new Date(now.getTime() + 7 * 86400_000), inArray(m.status, ["SCHEDULED", "CONFIRMED"])),
    db
      .select({ n: count })
      .from(m)
      .leftJoin(schema.meetingBriefs, eq(schema.meetingBriefs.meetingId, m.id))
      .where(
        and(
          visibleTo(personal),
          lt(m.startAt, now),
          notInArray(m.status, ["CANCELLED", "POSTPONED", "TO_BE_SCHEDULED"]),
          or(isNull(schema.meetingBriefs.id), eq(schema.meetingBriefs.status, "DRAFT")),
        ),
      ),
    db
      .select({ n: count })
      .from(m)
      .where(
        and(
          notInArray(m.status, ["COMPLETED", "CANCELLED"]),
          exists(
            db
              .select({ one: sql`1` })
              .from(schema.meetingActionOwners)
              .where(and(eq(schema.meetingActionOwners.meetingId, m.id), eq(schema.meetingActionOwners.userId, me.id))),
          ),
        ),
      ),
    listTasks(personal, { scope: "mine", bucket: "open" }, 1000),
  ]);
  const myOverdue = myOpen.filter((t) => t.overdue);
  const in7 = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86400_000).toISOString().slice(0, 10);
  const mySoon = myOpen.filter((t) => t.overdue || (t.dueDate && t.dueDate.slice(0, 10) < in7)).slice(0, 8);

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="My meetings this week" value={myWeek.length} href={`/meetings/calendar?user=${me.id}`} />
        <Tile label="My open tasks" value={myOpen.length} href="/tasks" />
        <Tile label="My overdue tasks" value={myOverdue.length} href="/tasks?bucket=overdue" />
        <Tile label="Briefs to write" value={briefsPending.n} href="/meetings?status=ALL" />
      </div>
      {/* Side by side on wide screens; long lists scroll inside their card so the page stays one screen. */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-12">
        <section className="card flex flex-col xl:col-span-5">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h3 className="font-semibold text-navy">My tasks — overdue & next 7 days</h3>
            <Link href="/tasks/new" className="link text-sm">
              + New task
            </Link>
          </div>
          <div className="max-h-[26rem] overflow-y-auto">
            <TaskMiniList rows={mySoon} empty="Nothing due in the next 7 days." />
          </div>
          {myActions.n > 0 && (
            <p className="mt-auto border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
              You also own the next action on {myActions.n} open meeting{myActions.n === 1 ? "" : "s"}.
            </p>
          )}
        </section>
        <section className="card p-4 xl:col-span-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold text-navy">My next 7 days</h3>
            <Link href="/meetings/new" className="link text-sm">
              + New meeting
            </Link>
          </div>
          {upcoming.length ? (
            <ul className="max-h-[24rem] divide-y divide-slate-100 overflow-y-auto text-sm">
              {upcoming.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    <Link href={`/meetings/${u.id}`} className="link">
                      {u.client ?? u.title}
                    </Link>
                    <span className="block text-xs text-slate-500">
                      {fmtDay(u.startAt)} · {fmtTime(u.startAt)}
                    </span>
                  </span>
                  <span className={`rounded border px-1.5 text-[11px] ${STATUS_CHIP[u.status]}`}>{STATUS_LABEL[u.status]}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No meetings booked in the next 7 days.</p>
          )}
        </section>
        <section className="card p-4 lg:col-span-2 xl:col-span-3">
          <h3 className="mb-2 font-semibold text-navy">My groups</h3>
          {myGroupList.length ? (
            <ul className="flex max-h-[24rem] flex-wrap gap-2 overflow-y-auto">
              {myGroupList.map((g) => (
                <li key={g.id}>
                  <Link href={`/groups/${g.id}`} className="inline-block rounded-full bg-brand-50 px-3 py-1 text-sm text-navy hover:bg-brand/10">
                    {g.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">You&apos;re not in any group yet.</p>
          )}
        </section>
      </div>
    </>
  );
}

async function OrgOverview({ me }: { me: SessionUser }) {
  const today = todayRiyadh();
  const [stages, org, [monthCount], [tbs], statusRows, orgOverdue] = await Promise.all([
    db.select({ stage: schema.clients.bdStage, n: count }).from(schema.clients).where(ne(schema.clients.status, "INACTIVE")).groupBy(schema.clients.bdStage),
    orgStats(),
    db
      .select({ n: count })
      .from(m)
      .where(and(gte(m.startAt, riyadh(`${today.slice(0, 7)}-01`, "00:00")), lt(m.startAt, riyadh(new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1)).toISOString().slice(0, 10), "00:00")), notInArray(m.status, ["CANCELLED"]))),
    db.select({ n: count }).from(m).where(inArray(m.status, ["TO_BE_SCHEDULED", "POSTPONED"])),
    clientStatusRows(me),
    listTasks(me, { scope: "all", bucket: "overdue" }, 1000),
  ]);
  const stageCount = (s: string) => stages.find((x) => x.stage === s)?.n ?? 0;
  const flagCount = (f: Flag) => statusRows.filter((r) => r.flag === f).length;
  // Client status segments: state colours (good / warning / critical) then two neutrals; validated as an adjacent set.
  const flagColor: Record<Flag, string> = { BOOKED: "#0ca30c", TO_SCHEDULE: "#fab219", OVERDUE: "#d03b3b", NO_NEXT_STEP: "#898781", NO_MEETING: "#d6d4cc" };

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTile
          label="Meetings held this month"
          value={org.heldThisMonth}
          delta={{ value: org.heldThisMonth - org.heldLastMonth, vs: "last month" }}
          href="/meetings?status=COMPLETED"
        />
        <KpiTile label="Meetings held · 12 months" value={org.heldYear} note={`${org.upcoming7} booked in the next 7 days`} href="/meetings/calendar" />
        <KpiTile
          label="Active clients"
          value={org.clients.active}
          note={org.clients.pending ? <span className="font-semibold text-amber-700">{org.clients.pending} waiting for review</span> : `${org.clients.inactive} inactive`}
          href={org.clients.pending ? "/clients?status=PENDING_REVIEW" : "/clients"}
        />
        <KpiTile label="Active users" value={org.activeUsers} note={`Across ${org.buRows.filter((b) => b.id !== null).length} business units`} href="/admin/users" />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-12">
        <section className="card p-4 lg:col-span-2 xl:col-span-6">
          <div className="mb-1 flex items-baseline justify-between">
            <h3 className="font-semibold text-navy">Meetings held per month</h3>
            <span className="text-xs text-slate-500">Completed meetings, last 12 months</span>
          </div>
          <MonthColumns points={org.months} currentKey={org.thisMonth} />
        </section>
        <section className="card p-4 xl:col-span-3">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="font-semibold text-navy">Client status</h3>
            <Link href="/reports/client-status" className="link text-xs">
              Full report →
            </Link>
          </div>
          <StackedShare
            total={statusRows.length}
            items={(["BOOKED", "TO_SCHEDULE", "OVERDUE", "NO_NEXT_STEP", "NO_MEETING"] as Flag[]).map((f) => ({
              key: f,
              label: FLAGS[f].label,
              n: flagCount(f),
              color: flagColor[f],
              href: `/reports/client-status?flag=${f}`,
            }))}
          />
        </section>
        <section className="card p-4 xl:col-span-3">
          <h3 className="mb-2 font-semibold text-navy">Needs attention</h3>
          <ul className="divide-y divide-slate-100 text-sm">
            {[
              { label: "Follow-ups overdue", n: flagCount("OVERDUE"), href: "/reports/client-status?flag=OVERDUE", tone: "text-red-700" },
              { label: "Overdue tasks", n: orgOverdue.length, href: "/tasks?scope=all&bucket=overdue", tone: "text-red-700" },
              { label: "Meetings to be scheduled", n: tbs.n, href: "/meetings?status=TO_BE_SCHEDULED", tone: "text-amber-700" },
              { label: "Clients waiting for review", n: org.clients.pending, href: "/clients?status=PENDING_REVIEW", tone: "text-amber-700" },
              { label: "Meetings this month (all)", n: monthCount.n, href: "/meetings/calendar", tone: "text-navy" },
            ].map((a) => (
              <li key={a.label}>
                <Link href={a.href} className="flex items-center justify-between py-2 hover:bg-slate-50">
                  <span className="text-slate-700">{a.label}</span>
                  <span className={`font-semibold tabular-nums ${a.n ? a.tone : "text-slate-400"}`}>{a.n}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <section className="card p-4 lg:col-span-5 xl:col-span-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="font-semibold text-navy">BD pipeline</h3>
            <span className="text-xs text-slate-500">Clients by stage (excl. inactive)</span>
          </div>
          <OrderedBars items={BD_STAGES.map((s) => ({ key: s, label: BD_STAGE_LABELS[s], n: stageCount(s), href: `/clients?stage=${s}&status=ALL` }))} />
        </section>
        <section className="card p-4 lg:col-span-7 xl:col-span-8">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="font-semibold text-navy">Business units</h3>
            <span className="text-xs text-slate-500">Bars compare units within each column</span>
          </div>
          <div className="max-h-[18rem] overflow-y-auto">
            <BuTable rows={org.buRows} />
          </div>
        </section>
      </div>
    </>
  );
}
