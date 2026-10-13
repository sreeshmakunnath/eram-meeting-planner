import { and, asc, eq, exists, gte, inArray, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import Link from "next/link";
import { Notice, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { BD_STAGE_LABELS, BD_STAGES } from "@/lib/queries";
import { clientStatusRows } from "@/lib/client-status";
import { meetingsBetween } from "@/lib/meeting-queries";
import { fmtDay, fmtTime, riyadh, STATUS_CHIP, STATUS_LABEL, todayRiyadh, visibleTo } from "@/lib/meetings";

function Tile({ label, value, href }: { label: string; value: number | string; href?: string }) {
  const body = (
    <div className="card p-4 transition hover:border-brand/40">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-bold text-navy">{value}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

const count = sql<number>`count(*)`.mapWith(Number);

export default async function Dashboard({ searchParams }: { searchParams: { denied?: string } }) {
  const me = await requireUser();
  const isAdmin = me.role === "ADMIN";

  const [[myGroups], [activeClients], [pendingClients], [activeUsers], myGroupList, stages, branches] = await Promise.all([
    db.select({ n: count }).from(schema.groupMembers).where(eq(schema.groupMembers.userId, me.id)),
    db.select({ n: count }).from(schema.clients).where(eq(schema.clients.status, "ACTIVE")),
    db.select({ n: count }).from(schema.clients).where(eq(schema.clients.status, "PENDING_REVIEW")),
    db.select({ n: count }).from(schema.users).where(eq(schema.users.status, "ACTIVE")),
    db
      .select({ id: schema.groups.id, name: schema.groups.name })
      .from(schema.groupMembers)
      .innerJoin(schema.groups, eq(schema.groupMembers.groupId, schema.groups.id))
      .where(eq(schema.groupMembers.userId, me.id))
      .orderBy(asc(schema.groups.name)),
    db.select({ stage: schema.clients.bdStage, n: count }).from(schema.clients).groupBy(schema.clients.bdStage),
    db
      .select({ name: schema.branches.name, n: count })
      .from(schema.users)
      .innerJoin(schema.branches, eq(schema.users.branchId, schema.branches.id))
      .where(eq(schema.users.status, "ACTIVE"))
      .groupBy(schema.branches.name)
      .orderBy(asc(schema.branches.name)),
  ]);

  const stageCount = (s: string) => stages.find((x) => x.stage === s)?.n ?? 0;

  // ---- meetings ----
  const personal = { ...me, role: "USER" as const }; // "my" numbers, even for Admins
  const today = todayRiyadh();
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const weekStart = riyadh(new Date(Date.parse(`${today}T00:00:00Z`) - dow * 86400_000).toISOString().slice(0, 10), "00:00");
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400_000);
  const now = new Date();
  const m = schema.meetings;
  const [myWeek, upcoming, [briefsPending], [myActions], [monthCount], [tbs], statusRows] = await Promise.all([
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
    db
      .select({ n: count })
      .from(m)
      .where(and(gte(m.startAt, riyadh(`${today.slice(0, 7)}-01`, "00:00")), lt(m.startAt, riyadh(new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1)).toISOString().slice(0, 10), "00:00")), notInArray(m.status, ["CANCELLED"]))),
    db.select({ n: count }).from(m).where(inArray(m.status, ["TO_BE_SCHEDULED", "POSTPONED"])),
    isAdmin ? clientStatusRows(me) : Promise.resolve([]),
  ]);
  const overdue = statusRows.filter((r) => r.flag === "OVERDUE").length;

  return (
    <>
      <PageHeader title={`Welcome, ${me.name.split(" ")[0]}`} subtitle={isAdmin ? "Your dashboard and the organisation overview." : "Your dashboard."} />
      {searchParams.denied && <Notice tone="error">That page is for Admins only.</Notice>}

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">My work</h2>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="My meetings this week" value={myWeek.length} href={`/meetings/calendar?user=${me.id}`} />
        <Tile label="Briefs to write" value={briefsPending.n} href="/meetings?status=ALL" />
        <Tile label="My next actions" value={myActions.n} href="/meetings" />
        <Tile label="My groups" value={myGroups.n} href="/groups" />
      </div>
      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <section className="card p-4">
          <h3 className="mb-2 font-semibold text-navy">My groups</h3>
          {myGroupList.length ? (
            <ul className="flex flex-wrap gap-2">
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
        <section className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold text-navy">My next 7 days</h3>
            <Link href="/meetings/new" className="link text-sm">
              + New meeting
            </Link>
          </div>
          {upcoming.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
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
      </div>

      {isAdmin && (
        <>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Organisation</h2>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Active users" value={activeUsers.n} href="/admin/users?status=ACTIVE" />
            <Tile label="Meetings this month" value={monthCount.n} href="/meetings/calendar" />
            <Tile label="To be scheduled" value={tbs.n} href="/meetings?status=TO_BE_SCHEDULED" />
            <Tile label="Follow-ups overdue" value={overdue} href="/reports/client-status?flag=OVERDUE" />
          </div>
          {pendingClients.n > 0 && (
            <Link href="/clients?status=PENDING_REVIEW" className="mb-6 block rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 hover:bg-amber-100">
              {pendingClients.n} client{pendingClients.n === 1 ? "" : "s"} waiting for review →
            </Link>
          )}
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="card p-4">
              <h3 className="mb-3 font-semibold text-navy">BD pipeline (clients by stage)</h3>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {BD_STAGES.map((s) => (
                    <tr key={s}>
                      <td className="py-1.5">
                        <Link href={`/clients?stage=${s}&status=ALL`} className="link">
                          {BD_STAGE_LABELS[s]}
                        </Link>
                      </td>
                      <td className="py-1.5 text-right font-semibold text-navy">{stageCount(s)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="card p-4">
              <h3 className="mb-3 font-semibold text-navy">Active users by branch</h3>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {branches.map((b) => (
                    <tr key={b.name}>
                      <td className="py-1.5">{b.name}</td>
                      <td className="py-1.5 text-right font-semibold text-navy">{b.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        </>
      )}
    </>
  );
}
