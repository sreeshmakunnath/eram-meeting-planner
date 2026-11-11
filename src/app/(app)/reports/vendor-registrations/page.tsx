import { and, asc, eq, exists, inArray, sql, type SQL } from "drizzle-orm";
import Link from "next/link";
import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { Donut } from "@/components/dashboard-charts";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { clientVisibleTo, selectableBus, teamOf, teamIds } from "@/lib/access";
import { isAdmin, isSuperAdmin, requireUser } from "@/lib/auth";
import { todayRiyadh } from "@/lib/meetings";
import {
  stageOf,
  VENDOR_REG_LABEL,
  VENDOR_REG_OPEN,
  VENDOR_REG_STAGES,
  VENDOR_REG_STATUSES,
  VENDOR_REG_TONE,
  type VendorRegStage,
  type VendorRegStatus,
} from "@/lib/vendor-reg";

const day = (s: string | Date) => new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Riyadh" });

type Scope = "mine" | "team" | "all";
type Q = { scope?: Scope; status?: string | null; stage?: string | null; bu?: number | null };

/**
 * Vendor registrations, three ways: assigned to me, assigned to my team (everyone under me in the reporting
 * lines), and — for Admins — everything on their business units' clients. Any of them can be narrowed to
 * one business unit, and without one the table at the bottom splits the numbers by unit.
 */
export default async function VendorRegistrationReport(props: { searchParams: Promise<{ scope?: string; status?: string; stage?: string; bu?: string; mine?: string }> }) {
  const sp = await props.searchParams;
  const me = await requireUser();
  const admin = isAdmin(me);
  const vr = schema.vendorRegistrations;
  const [team, units] = await Promise.all([teamIds(me.id), selectableBus(me)]);

  const scopes: { key: Scope; label: string }[] = [
    { key: "mine", label: "With me" },
    ...(team.length ? [{ key: "team" as const, label: "My team" }] : []),
    ...(admin ? [{ key: "all" as const, label: isSuperAdmin(me) ? "All business units" : "All in my business units" }] : []),
  ];
  const asked = (sp.mine === "1" ? "mine" : sp.scope) as Scope | undefined;
  const scope: Scope = scopes.some((s) => s.key === asked) ? asked! : admin ? "all" : "mine";
  // "OPEN" = everything not completed
  const status = sp.status === "OPEN" || VENDOR_REG_STATUSES.includes(sp.status as VendorRegStatus) ? sp.status! : null;
  const stage = VENDOR_REG_STAGES.some((g) => g.key === sp.stage) ? (sp.stage as VendorRegStage) : null;
  const bu = units.find((u) => u.id === Number(sp.bu)) ?? null;

  const where: (SQL | undefined)[] = [clientVisibleTo(me)];
  if (scope === "mine") where.push(eq(vr.assigneeId, me.id));
  if (scope === "team") where.push(sql`${vr.assigneeId} in ${teamOf(me.id)}`);
  if (bu)
    where.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(schema.clientBusinessUnits)
          .where(and(eq(schema.clientBusinessUnits.clientId, vr.clientId), eq(schema.clientBusinessUnits.businessUnitId, bu.id))),
      ),
    );
  const rows = await db
    .select({
      id: vr.id,
      clientId: vr.clientId,
      client: schema.clients.name,
      title: vr.title,
      status: vr.status,
      dueDate: vr.dueDate,
      updatedAt: vr.updatedAt,
      vendorCode: vr.vendorCode,
      assignee: schema.users.fullName,
    })
    .from(vr)
    .innerJoin(schema.clients, eq(vr.clientId, schema.clients.id))
    .leftJoin(schema.users, eq(vr.assigneeId, schema.users.id))
    .where(and(...where))
    .orderBy(sql`${vr.dueDate} asc nulls last`, asc(schema.clients.name));

  const today = todayRiyadh();
  const overdue = (r: (typeof rows)[number]) => !!r.dueDate && r.status !== "COMPLETED" && r.dueDate < today;
  const isOpen = (s: VendorRegStatus) => VENDOR_REG_OPEN.includes(s);
  const shown = rows.filter((r) => (status === "OPEN" ? isOpen(r.status) : !status || r.status === status) && (!stage || stageOf(r.status) === stage));
  const openCount = rows.filter((r) => isOpen(r.status)).length;
  const counts = VENDOR_REG_STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length] as const);

  const href = (q: Q) => {
    const p = new URLSearchParams();
    const next = { scope, bu: bu?.id ?? null, ...q };
    if (next.scope !== (admin ? "all" : "mine")) p.set("scope", next.scope!);
    if (next.status) p.set("status", next.status);
    if (next.stage) p.set("stage", next.stage);
    if (next.bu) p.set("bu", String(next.bu));
    const s = p.toString();
    return `/reports/vendor-registrations${s ? `?${s}` : ""}`;
  };

  // Split by business unit (a client in two units counts in both), only when no unit is picked.
  const byBu =
    !bu && units.length > 1 && rows.length
      ? await (async () => {
          const ids = [...new Set(rows.map((r) => r.clientId))];
          const links = await db
            .select({ clientId: schema.clientBusinessUnits.clientId, buId: schema.clientBusinessUnits.businessUnitId })
            .from(schema.clientBusinessUnits)
            .where(inArray(schema.clientBusinessUnits.clientId, ids));
          const unitsOf = new Map<number, number[]>();
          for (const l of links) unitsOf.set(l.clientId, [...(unitsOf.get(l.clientId) ?? []), l.buId]);
          const blank = () => ({ total: 0, open: 0, hold: 0, completed: 0, overdue: 0 });
          const stats = new Map<number | null, ReturnType<typeof blank>>();
          for (const r of rows) {
            const mine = (unitsOf.get(r.clientId) ?? []).filter((id) => units.some((u) => u.id === id));
            for (const id of mine.length ? mine : [null]) {
              const s = stats.get(id) ?? blank();
              s.total++;
              if (isOpen(r.status)) s.open++;
              if (r.status === "ON_HOLD") s.hold++;
              if (r.status === "COMPLETED") s.completed++;
              if (overdue(r)) s.overdue++;
              stats.set(id, s);
            }
          }
          return [...units.map((u) => ({ id: u.id as number | null, name: u.name })), { id: null, name: "No business unit" }]
            .filter((u) => stats.has(u.id))
            .map((u) => ({ ...u, ...stats.get(u.id)! }));
        })()
      : [];

  const scopeWord = scope === "mine" ? " assigned to you" : scope === "team" ? " assigned to your team" : "";

  return (
    <>
      <PageHeader
        title="Vendor registrations"
        subtitle="Where ERAM stands as a registered vendor with each client"
        actions={
          scopes.length > 1 && (
            <div className="flex gap-1 rounded-md bg-slate-100 p-1 text-sm">
              {scopes.map((s) => (
                <Link key={s.key} href={href({ scope: s.key })} className={`rounded px-3 py-1 ${scope === s.key ? "bg-white shadow-sm" : "text-slate-600"}`}>
                  {s.label}
                </Link>
              ))}
            </div>
          )
        }
      />

      {units.length > 1 && (
        <form className="mb-4 flex flex-wrap items-center gap-3">
          {scope !== (admin ? "all" : "mine") && <input type="hidden" name="scope" value={scope} />}
          {status && <input type="hidden" name="status" value={status} />}
          {stage && <input type="hidden" name="stage" value={stage} />}
          <label htmlFor="bu" className="text-sm font-semibold text-navy">
            Business unit
          </label>
          <AutoSubmitSelect id="bu" name="bu" defaultValue={bu ? String(bu.id) : ""} className="input w-auto min-w-[14rem]">
            <option value="">{isSuperAdmin(me) ? "All business units" : "All my business units"}</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </AutoSubmitSelect>
          <noscript>
            <button className="btn-secondary">Show</button>
          </noscript>
        </form>
      )}

      <div className="mb-4 grid gap-4 lg:grid-cols-12">
        <section className="card p-4 lg:col-span-4">
          <h3 className="mb-3 font-semibold text-navy">By stage</h3>
          <Donut
            total={rows.length}
            items={VENDOR_REG_STAGES.map((g) => ({
              key: g.key,
              label: g.label,
              color: g.color,
              n: rows.filter((r) => stageOf(r.status) === g.key).length,
              href: href({ stage: stage === g.key ? null : g.key, status: null }),
            }))}
          />
        </section>
        <section className="lg:col-span-8">
          <div className="flex flex-wrap gap-2">
            <Link href={href({ status: null, stage: null })} className={`card px-3 py-2 text-sm ${!status && !stage ? "ring-2 ring-brand" : ""}`}>
              <div className="text-xs text-slate-500">All</div>
              <div className="text-lg font-semibold text-navy">{rows.length}</div>
            </Link>
            <Link href={href({ status: "OPEN", stage: null })} className={`card px-3 py-2 text-sm ${status === "OPEN" ? "ring-2 ring-brand" : ""}`}>
              <div className="text-xs text-slate-500">Pending</div>
              <div className={`text-lg font-semibold ${openCount ? "text-amber-700" : "text-navy"}`}>{openCount}</div>
            </Link>
            {counts.map(([s, n]) => (
              <Link key={s} href={href({ status: s, stage: null })} className={`card px-3 py-2 text-sm ${status === s ? "ring-2 ring-brand" : ""}`}>
                <div className="text-xs text-slate-500">{VENDOR_REG_LABEL[s]}</div>
                <div className="text-lg font-semibold text-navy">{n}</div>
              </Link>
            ))}
          </div>
          {byBu.length > 0 && (
            <div className="card mt-4 overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Business unit</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Pending</th>
                    <th className="text-right">On hold</th>
                    <th className="text-right">Overdue</th>
                    <th className="text-right">Completed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {byBu.map((b) => (
                    <tr key={b.id ?? "none"}>
                      <td>
                        {b.id ? (
                          <Link href={href({ bu: b.id })} className="link">
                            {b.name}
                          </Link>
                        ) : (
                          <span className="text-slate-500">{b.name}</span>
                        )}
                      </td>
                      <td className="text-right tabular-nums">{b.total}</td>
                      <td className={`text-right tabular-nums ${b.open ? "font-semibold text-amber-700" : "text-slate-400"}`}>{b.open}</td>
                      <td className="text-right tabular-nums">{b.hold}</td>
                      <td className={`text-right tabular-nums ${b.overdue ? "font-semibold text-red-600" : "text-slate-400"}`}>{b.overdue}</td>
                      <td className="text-right tabular-nums text-emerald-700">{b.completed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <div className="card overflow-x-auto">
        {shown.length === 0 ? (
          <Empty>
            No {status === "OPEN" ? "pending " : ""}vendor registrations
            {status && status !== "OPEN" ? ` with status ${VENDOR_REG_LABEL[status as VendorRegStatus]}` : ""}
            {stage ? ` (${VENDOR_REG_STAGES.find((g) => g.key === stage)!.label.toLowerCase()})` : ""}
            {scopeWord}
            {bu ? ` in ${bu.name}` : ""}.
          </Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Registration</th>
                <th>Status</th>
                <th>Assigned to</th>
                <th>Due</th>
                <th>Vendor code</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/clients/${r.clientId}?tab=vendor`} className="link">
                      {r.client}
                    </Link>
                  </td>
                  <td>{r.title}</td>
                  <td>
                    <Badge tone={VENDOR_REG_TONE[r.status]}>{VENDOR_REG_LABEL[r.status]}</Badge>
                  </td>
                  <td>{r.assignee ?? <span className="text-slate-400">Unassigned</span>}</td>
                  <td className={`whitespace-nowrap ${overdue(r) ? "font-medium text-red-600" : ""}`}>{r.dueDate ? day(r.dueDate) : "—"}</td>
                  <td>{r.vendorCode ?? "—"}</td>
                  <td className="whitespace-nowrap text-xs text-slate-500">{day(r.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
