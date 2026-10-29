import { and, desc, eq, type SQL } from "drizzle-orm";
import Link from "next/link";
import { Empty, fmtDateTime, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireSuperAdmin } from "@/lib/auth";
import { auditNames, RECORD_HREF } from "@/lib/audit-names";

const PAGE = 50;
const ENTITY_LABEL: Record<string, string> = { user: "User", group: "Group", client: "Client", branch: "Branch", businessUnit: "Business unit", meeting: "Meeting", task: "Task" };

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
  const names = await auditNames(rows.slice(0, PAGE));
  const qs = (p: number) => `?${new URLSearchParams({ ...searchParams, page: String(p) } as Record<string, string>)}`;

  return (
    <>
      <PageHeader title="Audit log" subtitle="Sign-ins, password events and every change to users, groups, clients and masters." />
      <form className="card mb-4 flex flex-wrap gap-3 p-4">
        <select name="entity" defaultValue={searchParams.entity ?? ""} className="input max-w-xs">
          <option value="">All entities</option>
          {["user", "group", "client", "branch", "businessUnit"].map((e) => (
            <option key={e} value={e}>
              {ENTITY_LABEL[e]}
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
              {rows.slice(0, PAGE).map((r) => {
                const d = (r.details ?? {}) as { name?: string; title?: string; username?: string };
                const live = r.entityId ? names.name(r.entity, r.entityId) : null;
                const recordName = live ?? d.name ?? d.title ?? d.username ?? null; // deleted records: the name saved with the entry
                const href = live && r.entityId ? RECORD_HREF[r.entity]?.(r.entityId) : undefined;
                return (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{fmtDateTime(r.at)}</td>
                    <td>{r.user ?? "—"}</td>
                    <td className="font-mono text-xs">{r.action}</td>
                    <td className="min-w-[10rem]">
                      <div className="text-xs text-slate-500">{ENTITY_LABEL[r.entity] ?? r.entity}</div>
                      {href ? (
                        <Link href={href} className="link">
                          {recordName}
                        </Link>
                      ) : (
                        <span>{recordName ?? (r.entityId ? `#${r.entityId} (deleted)` : "—")}</span>
                      )}
                    </td>
                    <td className="max-w-md text-xs text-slate-600">
                      {names.details(r).map(([k, v]) => (
                        <div key={k} className="break-words">
                          <span className="text-slate-400">{k}:</span> {v}
                        </div>
                      ))}
                    </td>
                    <td className="text-xs text-slate-500">{r.ip ?? ""}</td>
                  </tr>
                );
              })}
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
