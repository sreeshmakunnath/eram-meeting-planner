import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import Link from "next/link";
import { Badge, Empty, fmtDateTime, Notice, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { countActive, FilterBar, FilterField } from "@/components/filters";
import { userInMyBus } from "@/lib/access";
import { isSuperAdmin, requireAdmin } from "@/lib/auth";
import { activeBusinessUnits } from "@/lib/queries";

type Search = { q?: string; bu?: string; role?: string; status?: string; msg?: string };

export default async function UsersPage({ searchParams }: { searchParams: Search }) {
  const me = await requireAdmin();
  const { users, businessUnits } = schema;
  // BU Admins see the people in their business units
  const where: SQL[] = isSuperAdmin(me) ? [] : [userInMyBus(me, users.id)];
  if (searchParams.q) {
    const q = `%${searchParams.q}%`;
    where.push(or(ilike(users.fullName, q), ilike(users.email, q), ilike(users.username, q), ilike(users.employeeId, q))!);
  }
  if (searchParams.bu) where.push(sql`exists (select 1 from user_business_units ub where ub.user_id = ${users.id} and ub.business_unit_id = ${Number(searchParams.bu)})`);
  if (searchParams.role === "SUPER_ADMIN" || searchParams.role === "ADMIN" || searchParams.role === "USER") where.push(eq(users.role, searchParams.role));
  if (searchParams.status === "ACTIVE" || searchParams.status === "INACTIVE") where.push(eq(users.status, searchParams.status));

  const [rows, buList] = await Promise.all([
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
        businessUnit: businessUnits.name,
        otherUnits: sql<string>`(select string_agg(b.name, ', ' order by b.name) from user_business_units ub join business_units b on b.id = ub.business_unit_id where ub.user_id = ${users.id} and ub.business_unit_id <> ${users.businessUnitId})`.mapWith(String),
        groupCount: sql<number>`(select count(*) from group_members gm where gm.user_id = ${users.id})`.mapWith(Number),
      })
      .from(users)
      .leftJoin(businessUnits, eq(users.businessUnitId, businessUnits.id))
      .where(where.length ? and(...where) : undefined)
      .orderBy(asc(users.fullName)),
    activeBusinessUnits().then((list) => (isSuperAdmin(me) ? list : list.filter((b) => me.buIds.includes(b.id)))),
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
      {searchParams.msg === "denied" && <Notice tone="error">You can only manage users in your business units.</Notice>}
<FilterBar clearHref="/admin/users" active={countActive(searchParams, ["q", "bu", "role", "status"])}>
        <FilterField label="Search" size="lg">
          <input name="q" defaultValue={searchParams.q} placeholder="Name, email, username or employee ID" className="input" />
        </FilterField>
        <FilterField label="Business unit">
          <select name="bu" defaultValue={searchParams.bu ?? ""} className="input">
            <option value="">All</option>
            {buList.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Role" size="sm">
          <select name="role" defaultValue={searchParams.role ?? ""} className="input">
            <option value="">Any</option>
            <option value="SUPER_ADMIN">Super Admin</option>
            <option value="ADMIN">Admin</option>
            <option value="USER">User</option>
          </select>
        </FilterField>
        <FilterField label="Status" size="sm">
          <select name="status" defaultValue={searchParams.status ?? ""} className="input">
            <option value="">Any</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </FilterField>
      </FilterBar>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <Empty>No users match these filters.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email / username</th>
                <th>Business units</th>
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
                  <td>
                    {u.businessUnit ?? <span className="text-slate-400">—</span>}
                    {u.otherUnits && <div className="text-xs text-slate-500">+ {u.otherUnits}</div>}
                  </td>
                  <td>{u.role === "SUPER_ADMIN" ? <Badge tone="navy">Super Admin</Badge> : u.role === "ADMIN" ? <Badge tone="blue">Admin</Badge> : "User"}</td>
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
