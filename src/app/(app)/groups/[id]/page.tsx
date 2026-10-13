import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge, Empty, fmtDate, labelize, Notice, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { deleteGroup } from "@/lib/actions/groups";
import { requireUser } from "@/lib/auth";

export default async function GroupPage({ params, searchParams }: { params: { id: string }; searchParams: { msg?: string } }) {
  const me = await requireUser();
  const id = Number(params.id);
  const group = Number.isInteger(id)
    ? await db.query.groups.findFirst({
        where: eq(schema.groups.id, id),
        with: { lead: { columns: { fullName: true } }, clients: { columns: { id: true, name: true } } },
      })
    : undefined;
  if (!group) notFound();
  const members = await db
    .select({
      id: schema.users.id,
      fullName: schema.users.fullName,
      email: schema.users.email,
      designation: schema.users.designation,
      branch: schema.branches.name,
      addedAt: schema.groupMembers.addedAt,
    })
    .from(schema.groupMembers)
    .innerJoin(schema.users, eq(schema.groupMembers.userId, schema.users.id))
    .innerJoin(schema.branches, eq(schema.users.branchId, schema.branches.id))
    .where(eq(schema.groupMembers.groupId, id))
    .orderBy(asc(schema.users.fullName));
  if (me.role !== "ADMIN" && !members.some((m) => m.id === me.id)) redirect("/groups");

  return (
    <>
      <PageHeader
        title={group.name}
        subtitle={`${labelize(group.type)} · Lead: ${group.lead?.fullName ?? "—"} · ${members.length} members`}
        actions={
          me.role === "ADMIN" && (
            <>
              <Link href={`/groups/${id}/edit`} className="btn-primary">
                Edit group
              </Link>
              <form action={deleteGroup.bind(null, id)}>
                <button className="btn-danger">Delete</button>
              </form>
            </>
          )
        }
      />
      {searchParams.msg === "saved" && <Notice tone="ok">Group saved. New members were emailed.</Notice>}
      {group.status === "ARCHIVED" && <Notice tone="info">This group is archived and can&apos;t receive new assignments.</Notice>}
      {group.description && <p className="mb-4 text-sm text-slate-600">{group.description}</p>}
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card overflow-x-auto lg:col-span-2">
          <h2 className="border-b border-slate-200 px-4 py-3 font-semibold text-navy">Members</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Branch</th>
                <th>Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.fullName} {m.id === group.leadUserId && <Badge tone="blue">Lead</Badge>}
                    <div className="text-xs text-slate-500">{m.designation ?? m.email}</div>
                  </td>
                  <td>{m.branch}</td>
                  <td className="text-slate-500">{fmtDate(m.addedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <div className="space-y-6">
          <section className="card p-4">
            <h2 className="mb-2 font-semibold text-navy">Client accounts</h2>
            {group.clients.length ? (
              <ul className="space-y-1 text-sm">
                {group.clients.map((c) => (
                  <li key={c.id}>
                    <Link href={`/clients/${c.id}`} className="link">
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Not the account team for any client.</p>
            )}
          </section>
          <section className="card">
            <h2 className="border-b border-slate-200 px-4 py-3 font-semibold text-navy">Upcoming meetings & open tasks</h2>
            <Empty>Arrives with the meeting and task planner (Phases 2–3).</Empty>
          </section>
        </div>
      </div>
    </>
  );
}
