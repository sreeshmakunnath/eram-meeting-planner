import { asc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { Notice, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { BD_STAGE_LABELS, BD_STAGES } from "@/lib/queries";

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

  return (
    <>
      <PageHeader title={`Welcome, ${me.name.split(" ")[0]}`} subtitle={isAdmin ? "Your dashboard and the organisation overview." : "Your dashboard."} />
      {searchParams.denied && <Notice tone="error">That page is for Admins only.</Notice>}

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">My work</h2>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="My meetings this week" value="—" />
        <Tile label="My open tasks" value="—" />
        <Tile label="My groups" value={myGroups.n} href="/groups" />
        <Tile label="Active clients" value={activeClients.n} href="/clients" />
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
          <h3 className="mb-2 font-semibold text-navy">Coming next</h3>
          <p className="text-sm text-slate-600">
            Meetings and the calendar arrive in Phase 2; the task planner, Meeting Briefs and reports in Phase 3. Their numbers will fill the tiles above.
          </p>
        </section>
      </div>

      {isAdmin && (
        <>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Organisation</h2>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Active users" value={activeUsers.n} href="/admin/users?status=ACTIVE" />
            <Tile label="Clients pending review" value={pendingClients.n} href="/clients?status=PENDING_REVIEW" />
            <Tile label="Meetings this month" value="—" />
            <Tile label="Overdue tasks" value="—" />
          </div>
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
