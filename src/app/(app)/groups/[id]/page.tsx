import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge, Empty, fmtDate, labelize, Notice, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { deleteGroup } from "@/lib/actions/groups";
import { requireUser } from "@/lib/auth";
import { listMeetings } from "@/lib/meeting-queries";
import { listTasks } from "@/lib/task-queries";
import { TaskMiniList } from "@/components/task-mini-list";
import { fmtDay, fmtTime, STATUS_CHIP, STATUS_LABEL } from "@/lib/meetings";

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
      businessUnit: schema.businessUnits.name,
      addedAt: schema.groupMembers.addedAt,
    })
    .from(schema.groupMembers)
    .innerJoin(schema.users, eq(schema.groupMembers.userId, schema.users.id))
    .leftJoin(schema.businessUnits, eq(schema.users.businessUnitId, schema.businessUnits.id))
    .where(eq(schema.groupMembers.groupId, id))
    .orderBy(asc(schema.users.fullName));
  if (me.role !== "ADMIN" && !members.some((m) => m.id === me.id)) redirect("/groups");
  const meetings = (await listMeetings({ ...me, role: "ADMIN" }, { group: String(id), status: "OPEN" }, 10)).filter((x) => x.status !== "POSTPONED");
  const groupTasks = await listTasks({ ...me, role: "ADMIN" }, { scope: "all", bucket: "open", group: String(id) }, 15);

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
                <th>Business unit</th>
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
                  <td>{m.businessUnit ?? <span className="text-slate-400">—</span>}</td>
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
            <h2 className="border-b border-slate-200 px-4 py-3 font-semibold text-navy">Open meetings</h2>
            {meetings.length ? (
              <ul className="divide-y divide-slate-100 text-sm">
                {meetings.map((mt) => (
                  <li key={mt.id} className="flex items-center justify-between gap-2 px-4 py-2">
                    <span>
                      <Link href={`/meetings/${mt.id}`} className="link">
                        {mt.client ?? mt.title}
                      </Link>
                      <span className="block text-xs text-slate-500">{mt.startAt ? `${fmtDay(mt.startAt)} · ${fmtTime(mt.startAt)}` : "Date not set"}</span>
                    </span>
                    <span className={`rounded border px-1.5 text-[11px] ${STATUS_CHIP[mt.status]}`}>{STATUS_LABEL[mt.status]}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No open meetings assigned to this group.</Empty>
            )}
          </section>
          <section className="card">
            <h2 className="border-b border-slate-200 px-4 py-3 font-semibold text-navy">Open tasks</h2>
            <TaskMiniList rows={groupTasks} empty="No open tasks assigned to this group." />
          </section>
        </div>
      </div>
    </>
  );
}
