import { and, asc, eq, ilike, inArray, sql, type SQL } from "drizzle-orm";
import Link from "next/link";
import { Badge, Empty, labelize, Notice, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { GROUP_TYPES } from "@/lib/queries";

export default async function GroupsPage({ searchParams }: { searchParams: { q?: string; type?: string; status?: string; msg?: string } }) {
  const me = await requireUser();
  const { groups, users } = schema;
  const where: SQL[] = [];
  if (!isAdmin(me)) {
    const mine = await db.select({ id: schema.groupMembers.groupId }).from(schema.groupMembers).where(eq(schema.groupMembers.userId, me.id));
    where.push(inArray(groups.id, mine.length ? mine.map((m) => m.id) : [-1]));
  }
  if (searchParams.q) where.push(ilike(groups.name, `%${searchParams.q}%`));
  if (searchParams.type && (GROUP_TYPES as readonly string[]).includes(searchParams.type))
    where.push(eq(groups.type, searchParams.type as (typeof GROUP_TYPES)[number]));
  const status = searchParams.status ?? "ACTIVE";
  if (status === "ACTIVE" || status === "ARCHIVED") where.push(eq(groups.status, status));

  const rows = await db
    .select({
      id: groups.id,
      name: groups.name,
      type: groups.type,
      status: groups.status,
      description: groups.description,
      lead: users.fullName,
      members: sql<number>`(select count(*) from group_members gm where gm.group_id = ${groups.id})`.mapWith(Number),
    })
    .from(groups)
    .leftJoin(users, eq(groups.leadUserId, users.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(asc(groups.name));

  return (
    <>
      <PageHeader
        title={isAdmin(me) ? "Groups" : "My groups"}
        subtitle={isAdmin(me) ? "Teams, branches, projects and client account teams." : "Groups you belong to."}
        actions={
          isAdmin(me) && (
            <Link href="/groups/new" className="btn-primary">
              Create group
            </Link>
          )
        }
      />
      {searchParams.msg === "deleted" && <Notice tone="ok">Group deleted.</Notice>}
      <form className="card mb-4 flex flex-wrap gap-3 p-4">
        <input name="q" defaultValue={searchParams.q} placeholder="Search groups" className="input max-w-xs" />
        <select name="type" defaultValue={searchParams.type ?? ""} className="input max-w-[12rem]">
          <option value="">All types</option>
          {GROUP_TYPES.map((t) => (
            <option key={t} value={t}>
              {labelize(t)}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={status} className="input max-w-[10rem]">
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
          <option value="ALL">All</option>
        </select>
        <button className="btn-secondary">Filter</button>
      </form>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <Empty>{isAdmin(me) ? "No groups yet. Create the first one." : "You're not in any group yet."}</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Group</th>
                <th>Type</th>
                <th>Lead</th>
                <th>Members</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((g) => (
                <tr key={g.id} className="hover:bg-slate-50">
                  <td>
                    <Link href={`/groups/${g.id}`} className="link">
                      {g.name}
                    </Link>
                    {g.description && <div className="text-xs text-slate-500">{g.description}</div>}
                  </td>
                  <td>{labelize(g.type)}</td>
                  <td>{g.lead ?? "—"}</td>
                  <td>{g.members}</td>
                  <td>
                    <Badge tone={g.status === "ACTIVE" ? "green" : "gray"}>{labelize(g.status)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
