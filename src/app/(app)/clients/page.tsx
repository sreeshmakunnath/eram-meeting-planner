import { and, asc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import Link from "next/link";
import { Badge, Empty, labelize, PageHeader, statusTone } from "@/components/ui";
import { db, schema } from "@/db";
import { countActive, FilterBar, FilterField } from "@/components/filters";
import { clientVisibleTo, contactVisibleTo } from "@/lib/access";
import { isAdmin, isSuperAdmin, requireUser } from "@/lib/auth";
import { activeUsers, BD_STAGE_LABELS, BD_STAGES, CLIENT_TYPES } from "@/lib/queries";

type Search = { q?: string; type?: string; stage?: string; owner?: string; status?: string; country?: string; bu?: string };

export default async function ClientsPage({ searchParams }: { searchParams: Search }) {
  const me = await requireUser();
  const { clients, users } = schema;
  const visible = clientVisibleTo(me);
  const where: SQL[] = visible ? [visible] : [];
  if (searchParams.bu) where.push(sql`exists (select 1 from client_business_units cb where cb.client_id = ${clients.id} and cb.business_unit_id = ${Number(searchParams.bu)})`);
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

  const [rows, owners, [{ pending }], bus] = await Promise.all([
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
        businessUnits: sql<string>`(select string_agg(b.name, ', ' order by b.name) from client_business_units cb join business_units b on b.id = cb.business_unit_id where cb.client_id = ${clients.id})`.mapWith(String),
        contacts: sql<number>`(${db.select({ n: sql`count(*)` }).from(schema.clientContacts).where(and(eq(schema.clientContacts.clientId, clients.id), contactVisibleTo(me)))})`.mapWith(Number),
      })
      .from(clients)
      .leftJoin(users, eq(clients.accountOwnerId, users.id))
      .where(where.length ? and(...where) : undefined)
      .orderBy(asc(clients.name)),
    activeUsers(),
    db.select({ pending: sql<number>`count(*)`.mapWith(Number) }).from(clients).where(and(eq(clients.status, "PENDING_REVIEW"), visible)),
    db
      .select({ id: schema.businessUnits.id, name: schema.businessUnits.name })
      .from(schema.businessUnits)
      .where(isSuperAdmin(me) ? undefined : inArray(schema.businessUnits.id, me.buIds))
      .orderBy(asc(schema.businessUnits.name)),
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
            {isAdmin(me) && (
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
      {isAdmin(me) && pending > 0 && status !== "PENDING_REVIEW" && (
        <Link href="/clients?status=PENDING_REVIEW" className="mb-4 block rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 hover:bg-amber-100">
          {pending} client{pending === 1 ? "" : "s"} waiting for review →
        </Link>
      )}
<FilterBar
        keep={{ country: searchParams.country }}
        clearHref="/clients"
        active={countActive(searchParams, ["q", "bu", "type", "stage", "owner", "status"], { status: "ACTIVE" })}
      >
        <FilterField label="Search" size="lg">
          <input name="q" defaultValue={searchParams.q} placeholder="Name, short code or city" className="input" />
        </FilterField>
        {bus.length > 1 && (
          <FilterField label="Business unit">
            <select name="bu" defaultValue={searchParams.bu ?? ""} className="input">
              <option value="">All</option>
              {bus.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </FilterField>
        )}
        <FilterField label="Type" size="sm">
          <select name="type" defaultValue={searchParams.type ?? ""} className="input">
            <option value="">All</option>
            {CLIENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {labelize(t)}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="BD stage" size="sm">
          <select name="stage" defaultValue={searchParams.stage ?? ""} className="input">
            <option value="">Any</option>
            {BD_STAGES.map((s) => (
              <option key={s} value={s}>
                {BD_STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Account owner">
          <select name="owner" defaultValue={searchParams.owner ?? ""} className="input">
            <option value="">Anyone</option>
            {owners.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Status" size="sm">
          <select name="status" defaultValue={status} className="input">
            <option value="ACTIVE">Active</option>
            <option value="PENDING_REVIEW">Pending</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ALL">All</option>
          </select>
        </FilterField>
      </FilterBar>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <Empty>No clients match these filters.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Type</th>
                <th>Business units</th>
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
                  <td className="text-slate-600">{c.businessUnits || "—"}</td>
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
