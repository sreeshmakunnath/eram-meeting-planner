import { and, asc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { PdfButton } from "@/components/pdf-export";
import Link from "next/link";
import { countActive, FilterBar, FilterField } from "@/components/filters";
import { Badge, Empty, Notice, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { bidVisibleTo } from "@/lib/access";
import { myBids } from "@/lib/bid-stats";
import { isAdmin, isSuperAdmin, requireUser } from "@/lib/auth";
import {
  BAND_LABEL,
  BID_STAGE_LABEL,
  BID_STAGE_TONE,
  BID_STAGES,
  BID_TYPE_LABEL,
  isOpenStage,
  OPEN_BID_STAGES,
  usd,
  usdShort,
  weighted,
  type BidStage,
  BID_STAGE_GROUPS,
} from "@/lib/bids";
import { fmtPlainDate, todayRiyadh } from "@/lib/meetings";

type Search = {
  q?: string;
  bu?: string;
  owner?: string;
  stage?: string;
  client?: string;
  project?: string;
  from?: string;
  to?: string;
  by?: string;
  mine?: string; msg?: string;
};

/** Which date the period filter applies to. */
const PERIOD_BY = {
  closing: "Closing date",
  issue: "Issue date",
  submitted: "Submission date",
} as const;
type PeriodBy = keyof typeof PERIOD_BY;
const isDay = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400_000);

export default async function BidsPage(props: { searchParams: Promise<Search> }) {
  const sp = await props.searchParams;
  const me = await requireUser();
  const b = schema.bids;
  const owner = schema.users;
  const where: (SQL | undefined)[] = [bidVisibleTo(me)];
  if (sp.q) {
    const q = `%${sp.q}%`;
    where.push(
      or(
        ilike(b.title, q),
        ilike(schema.clientProjects.name, q),
        ilike(schema.clients.name, q),
        ilike(schema.clients.clientCode, q),
        ilike(b.quotationRef, q),
        ilike(b.clientTenderNo, q),
      ),
    );
  }
  // Ids from the address bar: anything that isn't a whole number is ignored ("none" = bids without an owner)
  const idOf = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : null);
  const buId = idOf(sp.bu);
  if (buId) where.push(eq(b.businessUnitId, buId));
  if (sp.mine === "1") where.push(myBids(me.id)); // owned or on the bid team
  if (sp.owner === "none") where.push(isNull(b.ownerId));
  else if (idOf(sp.owner)) where.push(eq(b.ownerId, idOf(sp.owner)!));
  const clientId = idOf(sp.client);
  if (clientId) where.push(or(eq(b.clientId, clientId), eq(b.endClientId, clientId)));
  const projectId = idOf(sp.project);
  if (projectId) where.push(eq(b.projectId, projectId));
  // Period: from / to on the chosen date (closing by default)
  const by: PeriodBy = sp.by && sp.by in PERIOD_BY ? (sp.by as PeriodBy) : "closing";
  const dateCol = by === "issue" ? b.issueDate : by === "submitted" ? b.submittedDate : b.closingDate;
  const from = isDay(sp.from) ? sp.from! : null;
  const to = isDay(sp.to) ? sp.to! : null;
  if (from) where.push(gte(dateCol, from));
  if (to) where.push(lte(dateCol, to));
  if ((from || to) && by === "submitted") where.push(isNotNull(b.submittedDate));

  // Filter choices come only from bids the person can see
  const visible = bidVisibleTo(me);
  const [rows, owners, clientChoices, bus] = await Promise.all([
    db
      .select({
        id: b.id,
        title: b.title,
        clientId: b.clientId,
        client: schema.clients.name,
        clientCode: schema.clients.clientCode,
        unit: schema.businessUnits.code,
        owner: owner.fullName,
        bidType: b.bidType,
        stage: b.stage,
        bidValue: b.bidValue,
        band: b.probabilityBand,
        closingDate: b.closingDate,
        quotationRef: b.quotationRef,
        projectId: b.projectId,
        project: schema.clientProjects.name,
      })
      .from(b)
      .innerJoin(schema.clients, eq(b.clientId, schema.clients.id))
      .innerJoin(schema.businessUnits, eq(b.businessUnitId, schema.businessUnits.id))
      .leftJoin(owner, eq(b.ownerId, owner.id))
      .leftJoin(schema.clientProjects, eq(b.projectId, schema.clientProjects.id))
      .where(and(...where))
      .orderBy(sql`case when ${b.stage} in ('ENQUIRY','PRE_BID','SUBMITTED','UNDER_EVALUATION','NEGOTIATION') then 0 else 1 end`, asc(b.closingDate)),
    db.selectDistinct({ id: owner.id, fullName: owner.fullName }).from(b).innerJoin(owner, eq(b.ownerId, owner.id)).where(visible).orderBy(asc(owner.fullName)),
    db
      .selectDistinct({ id: schema.clients.id, name: schema.clients.name })
      .from(b)
      .innerJoin(schema.clients, eq(b.clientId, schema.clients.id))
      .where(visible)
      .orderBy(asc(schema.clients.name)),
    db
      .select({ id: schema.businessUnits.id, name: schema.businessUnits.name })
      .from(schema.businessUnits)
      .where(isSuperAdmin(me) ? undefined : inArray(schema.businessUnits.id, me.buIds.length ? me.buIds : [0]))
      .orderBy(asc(schema.businessUnits.name)),
  ]);

  const today = todayRiyadh();
  // A stage, OPEN / CLOSED / ALL, or one of the dashboards' stage groups (e.g. PREPARING)
  const group = BID_STAGE_GROUPS.find((g) => g.key === sp.stage && g.stages.length > 1);
  const stageFilter = sp.stage === "OPEN" || sp.stage === "CLOSED" || sp.stage === "ALL" || group || BID_STAGES.includes(sp.stage as BidStage) ? sp.stage! : "OPEN";
  const shown = rows.filter((r) =>
    stageFilter === "ALL"
      ? true
      : stageFilter === "OPEN"
        ? isOpenStage(r.stage)
        : stageFilter === "CLOSED"
          ? !isOpenStage(r.stage)
          : group
            ? group.stages.includes(r.stage)
            : r.stage === stageFilter,
  );
  const clientName = clientId ? (rows.find((r) => r.clientId === clientId)?.client ?? null) : null;
  const projectName = projectId ? (rows.find((r) => r.projectId === projectId)?.project ?? null) : null;
  const open = rows.filter((r) => isOpenStage(r.stage));
  const openValue = open.reduce((a, r) => a + (r.bidValue ?? 0), 0);
  const pipeline = open.reduce((a, r) => a + weighted(r.bidValue, r.band), 0);
  const closingSoon = open.filter((r) => r.closingDate >= today && daysBetween(today, r.closingDate) <= 7).length;
  const won = rows.filter((r) => r.stage === "WON").length;
  const lost = rows.filter((r) => r.stage === "LOST").length;
  const count = (s: string) => (s === "ALL" ? rows.length : s === "OPEN" ? open.length : s === "CLOSED" ? rows.length - open.length : rows.filter((r) => r.stage === s).length);
  const href = (stage: string) => {
    const p = new URLSearchParams(
      Object.entries({
        q: sp.q,
        bu: sp.bu,
        owner: sp.owner,
        mine: sp.mine === "1" ? "1" : undefined,
        client: sp.client,
        project: sp.project,
        from: from ?? undefined,
        to: to ?? undefined,
        by: from || to ? by : undefined,
      }).filter(([, v]) => v) as [string, string][],
    );
    if (stage !== "OPEN") p.set("stage", stage);
    const s = p.toString();
    return `/bids${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Bids"
        subtitle="Enquiries and tenders, from enquiry to won or lost. Values in USD."
        actions={
          <>
            {isAdmin(me) && (
              <Link href="/bids/dashboard" className="btn-secondary">
                Dashboard
              </Link>
            )}
            <PdfButton title="Bid report" />
            <Link href="/bids/new" className="btn-primary">
              New bid
            </Link>
          </>
        }
      />
      {sp.msg === "deleted" && <Notice tone="ok">Bid deleted.</Notice>}
      {sp.mine === "1" && (
        <Notice tone="info">
          Showing bids you own or are on the team of. <Link href={stageFilter === "OPEN" ? "/bids" : `/bids?stage=${stageFilter}`} className="link">Show all bids you can see</Link>
        </Notice>
      )}
      {group && (
        <Notice tone="info">
          Showing {group.label.toLowerCase()} bids ({group.stages.map((s) => BID_STAGE_LABEL[s]).join(", ")}).
        </Notice>
      )}
      {sp.msg === "handedover" && <Notice tone="ok">Saved. The bid now belongs to someone else, so it's no longer visible to you.</Notice>}
      {clientId && (
        <Notice tone="info">
          Bids for <b>{clientName ?? "this client"}</b>
          {projectId ? (
            <>
              , project <b>{projectName ?? "—"}</b>.{" "}
            </>
          ) : (
            " (as client or end client). "
          )}
          <Link href={`/clients/${clientId}?tab=bids`} className="link">
            Back to the client
          </Link>{" "}
          ·{" "}
          <Link href={`/bids${stageFilter !== "OPEN" ? `?stage=${stageFilter}` : ""}`} className="link">
            Show all clients
          </Link>
        </Notice>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          {
            label: "Open bids",
            value: String(open.length),
            note: `${rows.length} in total`,
          },
          {
            label: "Open value",
            value: usdShort(openValue),
            note: "Bid values of open bids",
          },
          {
            label: "Weighted pipeline",
            value: usdShort(pipeline),
            note: "Value × probability band",
          },
          {
            label: "Closing in 7 days",
            value: String(closingSoon),
            note: "Open bids",
            tone: closingSoon ? "text-amber-700" : "",
          },
          {
            label: "Win rate",
            value: won + lost ? `${Math.round((won / (won + lost)) * 100)}%` : "—",
            note: `${won} won · ${lost} lost`,
          },
        ].map((t) => (
          <div key={t.label} className="card p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.label}</div>
            <div className={`mt-1 text-2xl font-bold tabular-nums ${t.tone || "text-navy"}`}>{t.value}</div>
            <div className="text-xs text-slate-500">{t.note}</div>
          </div>
        ))}
      </div>

      {(from || to) && (
        <p className="-mt-2 mb-3 text-xs text-slate-500">
          Figures and list for bids with {PERIOD_BY[by].toLowerCase()}{" "}
          {from && to ? `from ${fmtPlainDate(from)} to ${fmtPlainDate(to)}` : from ? `on or after ${fmtPlainDate(from)}` : `up to ${fmtPlainDate(to)}`}.
        </p>
      )}
      <div className="mb-3 flex flex-wrap gap-1.5 text-sm">
        {["OPEN", ...OPEN_BID_STAGES, "WON", "LOST", "CANCELLED", "DECLINED", "CLOSED", "ALL"].map((s) => (
          <Link
            key={s}
            href={href(s)}
            className={`rounded-full border px-3 py-1 ${stageFilter === s ? "border-brand bg-brand-50 font-semibold text-navy" : "border-slate-200 bg-white text-slate-600 hover:border-brand/40"}`}
          >
            {s === "OPEN" ? "All open" : s === "CLOSED" ? "All closed" : s === "ALL" ? "Everything" : BID_STAGE_LABEL[s as BidStage]}
            <span className="ml-1.5 tabular-nums text-slate-400">{count(s)}</span>
          </Link>
        ))}
      </div>

      <FilterBar
        keep={{ stage: sp.stage, mine: sp.mine === "1" ? "1" : undefined }}
        clearHref={stageFilter === "OPEN" ? "/bids" : `/bids?stage=${stageFilter}`}
        active={countActive(sp, ["q", "bu", "owner", "client", "from", "to"])}
      >
        <FilterField label="Search" size="lg">
          <input name="q" defaultValue={sp.q} placeholder="Title, project, client, quotation or tender no." className="input" />
        </FilterField>
        <FilterField label="Client">
          <select name="client" defaultValue={sp.client ?? ""} className="input">
            <option value="">All</option>
            {clientChoices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Representative">
          <select name="owner" defaultValue={sp.owner ?? ""} className="input">
            <option value="">Anyone</option>
            <option value="none">No owner</option>
            {owners.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </select>
        </FilterField>
        {bus.length > 1 && (
          <FilterField label="Business unit" size="sm">
            <select name="bu" defaultValue={sp.bu ?? ""} className="input">
              <option value="">All</option>
              {bus.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </FilterField>
        )}
        <FilterField label="Period by" size="sm">
          <select name="by" defaultValue={by} className="input">
            {(Object.keys(PERIOD_BY) as PeriodBy[]).map((k) => (
              <option key={k} value={k}>
                {PERIOD_BY[k]}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="From" size="sm">
          <input type="date" name="from" defaultValue={from ?? ""} className="input" />
        </FilterField>
        <FilterField label="To" size="sm">
          <input type="date" name="to" defaultValue={to ?? ""} className="input" />
        </FilterField>
      </FilterBar>

      <div className="card overflow-x-auto">
        {shown.length === 0 ? (
          <Empty>
            No bids here yet.{" "}
            <Link href="/bids/new" className="link">
              Add a bid
            </Link>
          </Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Bid</th>
                <th>Client</th>
                <th>Unit</th>
                <th>Owner</th>
                <th>Stage</th>
                <th className="text-right">Value</th>
                <th>Probability</th>
                <th className="text-right">Weighted</th>
                <th>Closing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((r) => {
                const left = daysBetween(today, r.closingDate);
                const openBid = isOpenStage(r.stage);
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="max-w-[18rem]">
                      <Link href={`/bids/${r.id}`} className="link block truncate font-medium">
                        {r.title}
                      </Link>
                      {r.project && (
                        <Link href={`/bids?client=${r.clientId}&project=${r.projectId}&stage=ALL`} className="block truncate text-xs font-medium text-brand hover:underline">
                          {r.project}
                        </Link>
                      )}
                      <span className="text-xs text-slate-500">
                        {BID_TYPE_LABEL[r.bidType]}
                        {r.quotationRef && ` · ${r.quotationRef}`}
                      </span>
                    </td>
                    <td>
                      <Link href={`/clients/${r.clientId}`} className="hover:underline">
                        {r.client}
                      </Link>
                      {r.clientCode && <span className="block font-mono text-[11px] text-slate-400">{r.clientCode}</span>}
                    </td>
                    <td className="font-mono text-xs">{r.unit}</td>
                    <td className="whitespace-nowrap">{r.owner ?? <span className="text-slate-400">—</span>}</td>
                    <td>
                      <Badge tone={BID_STAGE_TONE[r.stage]}>{BID_STAGE_LABEL[r.stage]}</Badge>
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums">{usd(r.bidValue)}</td>
                    <td className="whitespace-nowrap">{r.band ? BAND_LABEL[r.band] : <span className="text-slate-400">—</span>}</td>
                    <td className="whitespace-nowrap text-right tabular-nums text-slate-600">{openBid && r.bidValue && r.band ? usd(weighted(r.bidValue, r.band)) : "—"}</td>
                    <td className="whitespace-nowrap">
                      {fmtPlainDate(r.closingDate)}
                      {openBid && (
                        <span className={`block text-xs ${left < 0 ? "font-semibold text-red-600" : left <= 7 ? "font-semibold text-amber-700" : "text-slate-500"}`}>
                          {left < 0 ? `${-left} day${left === -1 ? "" : "s"} past` : left === 0 ? "Today" : `in ${left} day${left === 1 ? "" : "s"}`}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
