import Link from "next/link";
import { PdfButton } from "@/components/pdf-export";
import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { Donut, KpiTile, ValueColumns } from "@/components/dashboard-charts";
import { Badge, Empty, PageHeader, Tabs } from "@/components/ui";
import { scopeToBu, selectableBus } from "@/lib/access";
import { isSuperAdmin, requireAdmin } from "@/lib/auth";
import { bidStats, dashboardBids, type Breakdown, type DashBid } from "@/lib/bid-stats";
import { BAND_LABEL, BID_STAGE_LABEL, BID_STAGE_TONE, BID_TYPE_LABEL, TENDER_CATEGORY_LABEL, usd, usdShort, weighted, type BidType, type TenderCategory } from "@/lib/bids";
import { fmtPlainDate, todayRiyadh } from "@/lib/meetings";

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const isDay = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const TABS = ["pipeline", "results", "people"] as const;
// Stage colours for the open pipeline: one blue hue, lighter → darker as bids progress (ordinal)
const STAGE_RAMP = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281"];

function Card({ title, note, children, className = "" }: { title: string; note?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-4 ${className}`}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="font-semibold text-navy">{title}</h3>
        {note && <span className="text-right text-xs text-slate-500">{note}</span>}
      </div>
      {children}
    </section>
  );
}

/** A results table: open pipeline and won / lost record per group, with an inline win-rate bar. */
function ResultsTable({ rows, first, link, empty = "No bids in this period." }: { rows: Breakdown[]; first: string; link?: (r: Breakdown) => string; empty?: string }) {
  if (!rows.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <div className="max-h-[22rem] overflow-auto">
      <table className="w-full min-w-[34rem] text-sm">
        <thead className="sticky top-0 bg-white">
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-3">{first}</th>
            <th className="py-2 pr-3 text-right">Open</th>
            <th className="py-2 pr-3 text-right">Weighted</th>
            <th className="py-2 pr-3 text-right">Won / lost</th>
            <th className="py-2 pr-3 text-right">Won value</th>
            <th className="w-32 py-2">Win rate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.key} className="hover:bg-slate-50">
              <td className="max-w-[14rem] truncate py-1.5 pr-3 font-medium text-slate-700">
                {link ? (
                  <Link href={link(r)} className="hover:underline">
                    {r.label}
                  </Link>
                ) : (
                  r.label
                )}
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums">
                {r.open ? (
                  <>
                    {usdShort(r.openValue)} <span className="text-xs text-slate-400">({r.open})</span>
                  </>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600">{r.weighted ? usdShort(r.weighted) : "—"}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">
                <span className="text-emerald-700">{r.won}</span> / <span className="text-red-700">{r.lost}</span>
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{r.wonValue ? usdShort(r.wonValue) : "—"}</td>
              <td className="py-1.5">
                {r.winRate === null ? (
                  <span className="text-xs text-slate-400">No result yet</span>
                ) : (
                  <span className="flex items-center gap-2">
                    <span className="h-2 flex-1 rounded-full bg-slate-100">
                      <span className="block h-full rounded-full bg-emerald-600" style={{ width: `${r.winRate * 100}%` }} />
                    </span>
                    <span className="w-9 text-right text-xs font-semibold tabular-nums text-slate-700">{pct(r.winRate)}</span>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BidList({ rows, empty, detail }: { rows: DashBid[]; empty: string; detail: (r: DashBid) => React.ReactNode }) {
  if (!rows.length) return <p className="py-1 text-sm text-slate-400">{empty}</p>;
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {rows.slice(0, 6).map((r) => (
        <li key={r.id}>
          <Link href={`/bids/${r.id}`} className="flex items-start justify-between gap-3 py-1.5 hover:bg-slate-50">
            <span className="min-w-0">
              <span className="block truncate text-slate-700">{r.title}</span>
              <span className="block truncate text-xs text-slate-500">
                {r.client}
                {r.owner ? ` · ${r.owner}` : ""}
              </span>
            </span>
            <span className="shrink-0 text-right text-xs">{detail(r)}</span>
          </Link>
        </li>
      ))}
      {rows.length > 6 && <li className="pt-1.5 text-xs text-slate-500">and {rows.length - 6} more</li>}
    </ul>
  );
}

/**
 * Admin dashboard for bids: pipeline, results and people, in tabs. Business-unit rule: an Admin sees their
 * units' bids (one unit when picked); a Super Admin all. The period (issue date) applies to results; the open
 * pipeline is always as of today.
 */
export default async function BidDashboard(props: { searchParams: Promise<{ bu?: string; from?: string; to?: string; tab?: string }> }) {
  const sp = await props.searchParams;
  const me = await requireAdmin();
  const units = await selectableBus(me);
  const scoped = scopeToBu(me, Number(sp.bu));
  const viewer = scoped ?? me;
  const unit = scoped ? units.find((u) => u.id === scoped.buIds[0]) : undefined;

  const today = todayRiyadh();
  const yearAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 364 * 86400_000).toISOString().slice(0, 10);
  const from = isDay(sp.from) ? sp.from! : yearAgo;
  const to = isDay(sp.to) ? sp.to! : today;
  const tab = TABS.includes(sp.tab as (typeof TABS)[number]) ? sp.tab! : "pipeline";

  const all = await dashboardBids(viewer);
  const s = bidStats(all, { from, to }, today);
  const t = s.totals;
  const q = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ bu: scoped ? String(scoped.buIds[0]) : undefined, from: sp.from, to: sp.to, ...extra }).filter(([, v]) => v) as [string, string][]);
    return `/bids/dashboard${p.size ? `?${p}` : ""}`;
  };
  const listHref = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ ...(scoped ? { bu: String(scoped.buIds[0]) } : {}), ...extra });
    return `/bids?${p}`;
  };
  const periodLabel = `${fmtPlainDate(from)} – ${fmtPlainDate(to)}`;
  const maxStage = Math.max(1, ...s.byStage.map((x) => x.value));
  const attentionCount = s.attention.notSubmitted.length + s.attention.awaitingAward.length + s.attention.closingSoon.length;

  return (
    <>
      <PageHeader
        title="Bids dashboard"
        subtitle={unit ? `${unit.name} · values in USD` : isSuperAdmin(me) ? "All business units · values in USD" : "Your business units · values in USD"}
        actions={
          <>
            <Link href="/bids" className="btn-secondary">
              Bids list
            </Link>
            <PdfButton title="Bids dashboard" />
          </>
        }
      />

      <form className="card mb-4 flex flex-wrap items-end gap-x-4 gap-y-3 px-4 py-3">
        <input type="hidden" name="tab" value={tab} />
        {units.length > 1 && (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Business unit</span>
            <AutoSubmitSelect name="bu" defaultValue={scoped ? String(scoped.buIds[0]) : ""} className="input w-auto min-w-[14rem]">
              <option value="">{isSuperAdmin(me) ? "All business units" : "All my business units"}</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </AutoSubmitSelect>
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Results period from (issue date)</span>
          <input type="date" name="from" defaultValue={from} className="input" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">To</span>
          <input type="date" name="to" defaultValue={to} className="input" />
        </label>
        <button className="btn-primary">Apply</button>
        <p className="ml-auto max-w-sm text-xs text-slate-500">The period applies to results (win rate, won value, issued). The open pipeline is always as of today.</p>
      </form>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile label="Open pipeline (USD)" value={Math.round(t.openValue)} note={`${t.openCount} open bids`} href={listHref({})} />
        <KpiTile label="Weighted pipeline (USD)" value={Math.round(t.weighted)} note="Value × probability band" />
        <KpiTile label="Won value (USD)" value={Math.round(t.wonValue)} note={`${t.won} won · issued ${periodLabel}`} href={listHref({ stage: "WON" })} />
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Win rate</div>
          <div className="mt-1 text-3xl font-bold text-navy">{pct(t.winRate)}</div>
          <div className="mt-1 text-xs text-slate-500">
            {t.won} won / {t.lost} lost · by value {pct(t.valueWinRate)}
          </div>
        </div>
        <div className={`card p-4 ${attentionCount ? "border-amber-200 bg-amber-50/40" : ""}`}>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Needs attention</div>
          <div className={`mt-1 text-3xl font-bold ${attentionCount ? "text-amber-700" : "text-navy"}`}>{attentionCount}</div>
          <div className="mt-1 text-xs text-slate-500">Past closing, closing in 7 days, award overdue</div>
        </div>
      </div>
      <p className="-mt-2 mb-3 text-xs text-slate-500">Money tiles are in USD. Issued in the period: {t.issuedInPeriod} · submitted: {t.submittedInPeriod} · closed: {t.closedInPeriod}.</p>

      <Tabs
        active={q({ tab: tab === "pipeline" ? undefined : tab })}
        items={[
          { href: q({}), label: "Pipeline" },
          { href: q({ tab: "results" }), label: "Win / loss" },
          { href: q({ tab: "people" }), label: "People & clients" },
        ]}
      />

      {tab === "pipeline" && (
        <div className="grid gap-4 xl:grid-cols-12">
          <Card title="Open pipeline by stage" note="Bar = value; count and weighted value beside it" className="xl:col-span-4">
            <ul className="space-y-3 text-sm">
              {s.byStage.map((x, i) => (
                <li key={x.stage}>
                  <Link href={listHref({ stage: x.stage })} className="group block">
                    <div className="mb-1 flex items-baseline justify-between">
                      <span className="text-slate-700 group-hover:underline">{BID_STAGE_LABEL[x.stage]}</span>
                      <span className="text-xs text-slate-500">
                        <b className="tabular-nums text-navy">{usdShort(x.value)}</b> · {x.count} bid{x.count === 1 ? "" : "s"} · weighted {usdShort(x.weighted)}
                      </span>
                    </div>
                    <div className="h-3 rounded-r-[4px] bg-slate-100">
                      <div className="h-full rounded-r-[4px]" style={{ width: `${(x.value / maxStage) * 100}%`, minWidth: x.value ? 3 : 0, background: STAGE_RAMP[i] }} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Weighted forecast by expected award month" note="Open bids · USD" className="xl:col-span-5">
            <ValueColumns
              points={s.forecast}
              extra={[
                { key: "later", label: "Later", ...s.awardLater },
                { key: "unset", label: "No date", ...s.awardUnset },
              ]}
              format={usdShort}
              unit="weighted"
            />
            {s.awardOverdue.count > 0 && (
              <p className="mt-3 text-xs text-amber-700">
                {s.awardOverdue.count} open bid{s.awardOverdue.count === 1 ? "" : "s"} ({usdShort(s.awardOverdue.value)} weighted) had an expected award date that has passed: update the date or the stage.
              </p>
            )}
          </Card>
          <Card title="Needs attention" className="xl:col-span-3">
            <div className="max-h-[22rem] space-y-3 overflow-y-auto">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-red-700">Closing date passed, not submitted ({s.attention.notSubmitted.length})</h4>
                <BidList rows={s.attention.notSubmitted} empty="None." detail={(r) => <span className="text-red-600">closed {fmtPlainDate(r.closingDate)}</span>} />
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-700">Closing in 7 days ({s.attention.closingSoon.length})</h4>
                <BidList rows={s.attention.closingSoon} empty="None." detail={(r) => <span className="text-amber-700">{fmtPlainDate(r.closingDate)}</span>} />
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-700">Award date passed ({s.attention.awaitingAward.length})</h4>
                <BidList rows={s.attention.awaitingAward} empty="None." detail={(r) => <span className="text-slate-500">expected {fmtPlainDate(r.expectedAwardDate)}</span>} />
              </div>
              <p className="text-xs text-slate-500">
                Data gaps: {s.attention.noValue.length} open bid{s.attention.noValue.length === 1 ? "" : "s"} without a value, {s.attention.noBand.length} without a probability.
              </p>
            </div>
          </Card>
          <Card title="Top open bids" note="By weighted value" className="xl:col-span-12">
            {s.topOpen.length === 0 ? (
              <Empty>No open bids.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[48rem] text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-3">Bid</th>
                      <th className="py-2 pr-3">Client</th>
                      <th className="py-2 pr-3">Representative</th>
                      <th className="py-2 pr-3">Stage</th>
                      <th className="py-2 pr-3 text-right">Value</th>
                      <th className="py-2 pr-3">Probability</th>
                      <th className="py-2 pr-3 text-right">Weighted</th>
                      <th className="py-2">Expected award</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {s.topOpen.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="max-w-[16rem] truncate py-1.5 pr-3">
                          <Link href={`/bids/${r.id}`} className="link">
                            {r.title}
                          </Link>
                        </td>
                        <td className="max-w-[10rem] truncate py-1.5 pr-3">{r.client}</td>
                        <td className="py-1.5 pr-3">{r.owner ?? "—"}</td>
                        <td className="py-1.5 pr-3">
                          <Badge tone={BID_STAGE_TONE[r.stage]}>{BID_STAGE_LABEL[r.stage]}</Badge>
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{usd(r.value)}</td>
                        <td className="py-1.5 pr-3">{r.band ? BAND_LABEL[r.band] : <span className="text-amber-700">Not set</span>}</td>
                        <td className="py-1.5 pr-3 text-right font-semibold tabular-nums text-navy">{usd(weighted(r.value, r.band))}</td>
                        <td className={`py-1.5 ${r.expectedAwardDate && r.expectedAwardDate < today ? "text-amber-700" : ""}`}>{fmtPlainDate(r.expectedAwardDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "results" && (
        <div className="grid gap-4 xl:grid-cols-12">
          <Card title="Outcomes" note={`Issued ${periodLabel}`} className="xl:col-span-3">
            <Donut
              total={t.bids}
              centerLabel="bids"
              items={[
                { key: "open", label: "Still open", n: s.inPeriod.filter((r) => ["ENQUIRY", "PRE_BID", "SUBMITTED", "UNDER_EVALUATION", "NEGOTIATION"].includes(r.stage)).length, color: "#2a78d6", href: listHref({ stage: "OPEN" }) },
                { key: "won", label: "Won", n: t.won, color: "#0ca30c", href: listHref({ stage: "WON" }) },
                { key: "lost", label: "Lost", n: t.lost, color: "#d03b3b", href: listHref({ stage: "LOST" }) },
                {
                  key: "other",
                  label: "Cancelled / declined",
                  n: s.inPeriod.filter((r) => r.stage === "CANCELLED" || r.stage === "DECLINED").length,
                  color: "#898781",
                  href: listHref({ stage: "CLOSED" }),
                },
              ]}
            />
          </Card>
          <Card title="By sector" note="Where we win" className="xl:col-span-9">
            <ResultsTable rows={s.bySector} first="Sector" />
          </Card>
          <Card title="Probability accuracy" note="Band owners had when a bid was decided vs how often those bids were won" className="xl:col-span-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Band picked</th>
                  <th className="py-2 pr-3 text-right">Decided</th>
                  <th className="py-2 pr-3 text-right">Won</th>
                  <th className="py-2 pr-3 text-right">Actual</th>
                  <th className="py-2">Read</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {s.accuracy.map((a) => {
                  const off = a.actual === null ? null : a.actual - a.expected;
                  return (
                    <tr key={a.band}>
                      <td className="py-1.5 pr-3 font-medium text-slate-700">{BAND_LABEL[a.band]}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{a.decided}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{a.won}</td>
                      <td className="py-1.5 pr-3 text-right font-semibold tabular-nums">{pct(a.actual)}</td>
                      <td className="py-1.5 text-xs">
                        {off === null || a.decided < 3 ? (
                          <span className="text-slate-400">{a.decided ? "Too few to judge" : "No data"}</span>
                        ) : Math.abs(off) <= 0.15 ? (
                          <span className="text-emerald-700">About right</span>
                        ) : off > 0 ? (
                          <span className="text-brand">Owners are cautious</span>
                        ) : (
                          <span className="text-amber-700">Owners are optimistic</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">All decided bids, not only this period. Recorded from now on when a bid is won or lost.</p>
          </Card>
          <Card title="By bid type and tender category" className="xl:col-span-7">
            <div className="grid gap-4 lg:grid-cols-2">
              <ResultsTable rows={s.byType.map((r) => ({ ...r, label: BID_TYPE_LABEL[r.key as BidType] ?? r.label }))} first="Bid type" />
              <ResultsTable rows={s.byCategory.map((r) => ({ ...r, label: TENDER_CATEGORY_LABEL[r.key as TenderCategory] ?? r.label }))} first="Category" />
            </div>
          </Card>
          <Card title="Why we lost, or didn't bid" note={`Issued ${periodLabel}`} className="xl:col-span-12">
            {s.lostReasons.length === 0 ? (
              <p className="text-sm text-slate-500">No lost, cancelled or declined bids in this period.</p>
            ) : (
              <ul className="grid gap-x-6 divide-y divide-slate-100 text-sm md:grid-cols-2 md:divide-y-0">
                {s.lostReasons.slice(0, 12).map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-3 py-1.5 md:border-b md:border-slate-100">
                    <span className="min-w-0">
                      <Link href={`/bids/${r.id}`} className="block truncate text-slate-700 hover:underline">
                        {r.title}
                      </Link>
                      <span className="block text-xs text-slate-500">{r.reason ?? "No reason given"}</span>
                    </span>
                    <span className="shrink-0 text-right text-xs">
                      <Badge tone={BID_STAGE_TONE[r.stage]}>{BID_STAGE_LABEL[r.stage]}</Badge>
                      <span className="mt-0.5 block tabular-nums text-slate-500">{usd(r.value)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === "people" && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card title="By representative" note={`Open pipeline today · results for bids issued ${periodLabel}`}>
            <ResultsTable rows={s.byOwner} first="Representative" link={(r) => listHref({ owner: r.key === "—" ? "none" : r.key, stage: "ALL" })} empty="No bids." />
          </Card>
          <Card title="By client" note="Largest open value first">
            <ResultsTable rows={s.byClient.slice(0, 25)} first="Client" link={(r) => listHref({ client: r.key, stage: "ALL" })} empty="No bids." />
          </Card>
          {!scoped && units.length > 1 && (
            <Card title="By business unit" className="xl:col-span-2">
              <ResultsTable rows={s.byUnit} first="Business unit" link={(r) => q({ bu: r.key, tab: "people" })} empty="No bids." />
            </Card>
          )}
        </div>
      )}
    </>
  );
}
