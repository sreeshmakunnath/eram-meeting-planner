import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import Link from "next/link";
import { Badge, Empty, fmtDateTime, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { activeBranches } from "@/lib/queries";

type Search = { q?: string; branch?: string; role?: string; status?: string };

export default async function UsersPage({ searchParams }: { searchParams: Search }) {
  await requireAdmin();
  const { users, branches } = schema;
  const where: SQL[] = [];
  if (searchParams.q) {
    const q = `%${searchParams.q}%`;
    where.push(or(ilike(users.fullName, q), ilike(users.email, q), ilike(users.username, q), ilike(users.employeeId, q))!);
  }
  if (searchParams.branch) where.push(eq(users.branchId, Number(searchParams.branch)));
  if (searchParams.role === "ADMIN" || searchParams.role === "USER") where.push(eq(users.role, searchParams.role));
  if (searchParams.status === "ACTIVE" || searchParams.status === "INACTIVE") where.push(eq(users.status, searchParams.status));

  const [rows, branchList] = await Promise.all([
    db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        username: users.username,
        role: users.role,
        status: users.status,
        designation: users.designation,
        lastLoginAt: users.lastLoginAt,
        lockedUntil: users.lockedUntil,
        branch: branches.name,
        groupCount: sql<number>`(select count(*) from group_members gm where gm.user_id = ${users.id})`.mapWith(Number),
      })
      .from(users)
      .innerJoin(branches, eq(users.branchId, branches.id))
      .where(where.length ? and(...where) : undefined)
      .orderBy(asc(users.fullName)),
    activeBranches(),
  ]);

  return (
    <>
      <PageHeader
        title="Users"
        subtitle={`${rows.length} user${rows.length === 1 ? "" : "s"}`}
        actions={
          <Link href="/admin/users/new" className="btn-primary">
            Add user
          </Link>
        }
      />
      <form className="card mb-4 grid gap-3 p-4 md:grid-cols-5">
        <input name="q" defaultValue={searchParams.q} placeholder="Search name, email, username, employee ID" className="input md:col-span-2" />
        <select name="branch" defaultValue={searchParams.branch ?? ""} className="input">
          <option value="">All branches</option>
          {branchList.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select name="role" defaultValue={searchParams.role ?? ""} className="input">
          <option value="">All roles</option>
          <option value="ADMIN">Admin</option>
          <option value="USER">User</option>
        </select>
        <div className="flex gap-2">
          <select name="status" defaultValue={searchParams.status ?? ""} className="input">
            <option value="">Any status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
          <button className="btn-secondary">Filter</button>
        </div>
      </form>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <Empty>No users match these filters.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email / username</th>
                <th>Branch</th>
                <th>Role</th>
                <th>Groups</th>
                <th>Status</th>
                <th>Last sign-in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td>
                    <Link href={`/admin/users/${u.id}`} className="link">
                      {u.fullName}
                    </Link>
                    {u.designation && <div className="text-xs text-slate-500">{u.designation}</div>}
                  </td>
                  <td>
                    {u.email}
                    <div className="text-xs text-slate-500">{u.username}</div>
                  </td>
                  <td>{u.branch}</td>
                  <td>{u.role === "ADMIN" ? <Badge tone="navy">Admin</Badge> : "User"}</td>
                  <td>{u.groupCount}</td>
                  <td>
                    <Badge tone={u.status === "ACTIVE" ? "green" : "gray"}>{u.status === "ACTIVE" ? "Active" : "Inactive"}</Badge>{" "}
                    {u.lockedUntil && u.lockedUntil > new Date() && <Badge tone="red">Locked</Badge>}
                  </td>
                  <td className="whitespace-nowrap text-slate-500">{fmtDateTime(u.lastLoginAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
