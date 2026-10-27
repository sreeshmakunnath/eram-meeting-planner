import { and, desc, eq, type SQL } from "drizzle-orm";
import Link from "next/link";
import { Empty, fmtDateTime, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireSuperAdmin } from "@/lib/auth";

const PAGE = 50;

export default async function AuditPage({ searchParams }: { searchParams: { entity?: string; action?: string; page?: string } }) {
  await requireSuperAdmin();
  const page = Math.max(1, Number(searchParams.page) || 1);
  const where: SQL[] = [];
  if (searchParams.entity) where.push(eq(schema.auditLogs.entity, searchParams.entity));
  if (searchParams.action) where.push(eq(schema.auditLogs.action, searchParams.action));
  const rows = await db
    .select({
      id: schema.auditLogs.id,
      at: schema.auditLogs.createdAt,
      action: schema.auditLogs.action,
      entity: schema.auditLogs.entity,
      entityId: schema.auditLogs.entityId,
      details: schema.auditLogs.details,
      ip: schema.auditLogs.ip,
      user: schema.users.fullName,
    })
    .from(schema.auditLogs)
    .leftJoin(schema.users, eq(schema.auditLogs.userId, schema.users.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(schema.auditLogs.createdAt))
    .limit(PAGE + 1)
    .offset((page - 1) * PAGE);
  const hasMore = rows.length > PAGE;
  const qs = (p: number) => `?${new URLSearchParams({ ...searchParams, page: String(p) } as Record<string, string>)}`;

  return (
    <>
      <PageHeader title="Audit log" subtitle="Sign-ins, password events and every change to users, groups, clients and masters." />
      <form className="card mb-4 flex flex-wrap gap-3 p-4">
        <select name="entity" defaultValue={searchParams.entity ?? ""} className="input max-w-xs">
          <option value="">All entities</option>
          {["user", "group", "client", "branch", "businessUnit"].map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <input name="action" defaultValue={searchParams.action} placeholder="Action, e.g. LOGIN_FAILED" className="input max-w-xs" />
        <button className="btn-secondary">Filter</button>
      </form>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <Empty>No entries.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Record</th>
                <th>Details</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.slice(0, PAGE).map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{fmtDateTime(r.at)}</td>
                  <td>{r.user ?? "—"}</td>
                  <td className="font-mono text-xs">{r.action}</td>
                  <td className="whitespace-nowrap">
                    {r.entity}
                    {r.entityId ? ` #${r.entityId}` : ""}
                  </td>
                  <td className="max-w-md break-words font-mono text-xs text-slate-500">{r.details ? JSON.stringify(r.details) : ""}</td>
                  <td className="text-xs text-slate-500">{r.ip ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="mt-4 flex justify-between text-sm">
        {page > 1 ? (
          <Link href={qs(page - 1)} className="link">
            ← Newer
          </Link>
        ) : (
          <span />
        )}
        {hasMore && (
          <Link href={qs(page + 1)} className="link">
            Older →
          </Link>
        )}
      </div>
    </>
  );
}
