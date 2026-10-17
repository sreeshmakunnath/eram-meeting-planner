import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import Link from "next/link";
import { Badge, Empty, labelize, PageHeader, statusTone } from "@/components/ui";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { activeUsers, BD_STAGE_LABELS, BD_STAGES, CLIENT_TYPES } from "@/lib/queries";

type Search = { q?: string; type?: string; stage?: string; owner?: string; status?: string; country?: string };

export default async function ClientsPage({ searchParams }: { searchParams: Search }) {
  const me = await requireUser();
  const { clients, users } = schema;
  const where: SQL[] = [];
  if (searchParams.q) {
    const q = `%${searchParams.q}%`;
    where.push(or(ilike(clients.name, q), ilike(clients.shortCode, q), ilike(clients.city, q))!);
  }
  if (searchParams.type && (CLIENT_TYPES as readonly string[]).includes(searchParams.type))
    where.push(eq(clients.type, searchParams.type as (typeof CLIENT_TYPES)[number]));
  if (searchParams.stage && (BD_STAGES as readonly string[]).includes(searchParams.stage))
    where.push(eq(clients.bdStage, searchParams.stage as (typeof BD_STAGES)[number]));
  if (searchParams.owner) where.push(eq(clients.accountOwnerId, Number(searchParams.owner)));
  if (searchParams.country) where.push(ilike(clients.country, searchParams.country));
  const status = searchParams.status ?? "ACTIVE";
  if (status === "ACTIVE" || status === "INACTIVE" || status === "PENDING_REVIEW") where.push(eq(clients.status, status));

  const [rows, owners, [{ pending }]] = await Promise.all([
    db
      .select({
        id: clients.id,
        name: clients.name,
        shortCode: clients.shortCode,
        type: clients.type,
        country: clients.country,
        city: clients.city,
        bdStage: clients.bdStage,
        status: clients.status,
        owner: users.fullName,
        contacts: sql<number>`(select count(*) from client_contacts cc where cc.client_id = ${clients.id})`.mapWith(Number),
      })
      .from(clients)
      .leftJoin(users, eq(clients.accountOwnerId, users.id))
      .where(where.length ? and(...where) : undefined)
      .orderBy(asc(clients.name)),
    activeUsers(),
    db.select({ pending: sql<number>`count(*)`.mapWith(Number) }).from(clients).where(eq(clients.status, "PENDING_REVIEW")),
  ]);

  const csv = new URLSearchParams(searchParams as Record<string, string>).toString();

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={`${rows.length} client${rows.length === 1 ? "" : "s"}`}
        actions={
          <>
            <a href={`/api/clients/export?${csv}`} className="btn-secondary">
              Export CSV
            </a>
            {me.role === "ADMIN" && (
              <Link href="/clients/import" className="btn-secondary">
                Import Excel
              </Link>
            )}
            <Link href="/clients/new" className="btn-primary">
              Add client
            </Link>
          </>
        }
      />
      {me.role === "ADMIN" && pending > 0 && status !== "PENDING_REVIEW" && (
        <Link href="/clients?status=PENDING_REVIEW" className="mb-4 block rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 hover:bg-amber-100">
          {pending} client{pending === 1 ? "" : "s"} waiting for review →
        </Link>
      )}
      <form className="card mb-4 grid gap-3 p-4 md:grid-cols-6">
        <input name="q" defaultValue={searchParams.q} placeholder="Search name, code, city" className="input md:col-span-2" />
        <select name="type" defaultValue={searchParams.type ?? ""} className="input">
          <option value="">All types</option>
          {CLIENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {labelize(t)}
            </option>
          ))}
        </select>
        <select name="stage" defaultValue={searchParams.stage ?? ""} className="input">
          <option value="">Any BD stage</option>
          {BD_STAGES.map((s) => (
            <option key={s} value={s}>
              {BD_STAGE_LABELS[s]}
            </option>
          ))}
        </select>
        <select name="owner" defaultValue={searchParams.owner ?? ""} className="input">
          <option value="">Any owner</option>
          {owners.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <select name="status" defaultValue={status} className="input">
            <option value="ACTIVE">Active</option>
            <option value="PENDING_REVIEW">Pending</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ALL">All</option>
          </select>
          <button className="btn-secondary">Filter</button>
        </div>
      </form>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <Empty>No clients match these filters.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Type</th>
                <th>Location</th>
                <th>BD stage</th>
                <th>Account owner</th>
                <th>Contacts</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td>
                    <Link href={`/clients/${c.id}`} className="link">
                      {c.name}
                    </Link>
                    {c.shortCode && <span className="ml-2 text-xs text-slate-500">{c.shortCode}</span>}
                  </td>
                  <td>{labelize(c.type)}</td>
                  <td>{[c.city, c.country].filter(Boolean).join(", ")}</td>
                  <td>{c.bdStage ? BD_STAGE_LABELS[c.bdStage] : "—"}</td>
                  <td>{c.owner ?? "—"}</td>
                  <td>{c.contacts}</td>
                  <td>
                    <Badge tone={statusTone(c.status)}>{labelize(c.status)}</Badge>
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
