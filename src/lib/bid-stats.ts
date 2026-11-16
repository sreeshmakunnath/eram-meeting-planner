// Figures for the Admin bids dashboard. Every bid read goes through bidVisibleTo (the business-unit rule).
import { and, eq, exists, gte, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { bidVisibleTo } from "@/lib/access";
import type { SessionUser } from "@/lib/auth";
import { BAND_MIDPOINT, BID_STAGE_GROUPS, isOpenStage, OPEN_BID_STAGES, PROBABILITY_BANDS, weighted, type BidStage, type ProbabilityBand } from "@/lib/bids";

export async function dashboardBids(viewer: SessionUser) {
  const b = schema.bids;
  return db
    .select({
      id: b.id,
      title: b.title,
      clientId: b.clientId,
      client: schema.clients.name,
      ownerId: b.ownerId,
      owner: schema.users.fullName,
      unitId: b.businessUnitId,
      unit: schema.businessUnits.name,
      stage: b.stage,
      band: b.probabilityBand,
      decisionBand: b.decisionBand,
      value: b.bidValue,
      sector: b.sector,
      bidType: b.bidType,
      category: b.tenderCategory,
      issueDate: b.issueDate,
      closingDate: b.closingDate,
      submittedDate: b.submittedDate,
      expectedAwardDate: b.expectedAwardDate,
      closedAt: b.closedAt,
      reason: b.closedReason,
    })
    .from(b)
    .innerJoin(schema.clients, eq(b.clientId, schema.clients.id))
    .innerJoin(schema.businessUnits, eq(b.businessUnitId, schema.businessUnits.id))
    .leftJoin(schema.users, eq(b.ownerId, schema.users.id))
    .where(and(bidVisibleTo(viewer)));
}
export type DashBid = Awaited<ReturnType<typeof dashboardBids>>[number];

const sum = (list: DashBid[]) => list.reduce((a, r) => a + (r.value ?? 0), 0);
const wsum = (list: DashBid[]) => list.reduce((a, r) => a + weighted(r.value, r.band), 0);
const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400_000);

/** Won / lost record of a group of bids (Cancelled and Declined don't count towards the win rate). */
export function record(list: DashBid[]) {
  const won = list.filter((r) => r.stage === "WON");
  const lost = list.filter((r) => r.stage === "LOST");
  const decided = won.length + lost.length;
  const decidedValue = sum(won) + sum(lost);
  return {
    bids: list.length,
    won: won.length,
    lost: lost.length,
    wonValue: sum(won),
    lostValue: sum(lost),
    winRate: decided ? won.length / decided : null,
    valueWinRate: decidedValue ? sum(won) / decidedValue : null,
  };
}

/** Groups bids by a key and returns each group's open pipeline and record, largest open value first. */
function breakdown(list: DashBid[], key: (r: DashBid) => string | null, label: (r: DashBid) => string) {
  const groups = new Map<string, { key: string; label: string; rows: DashBid[] }>();
  for (const r of list) {
    const k = key(r) ?? "—";
    if (!groups.has(k))
      groups.set(k, {
        key: k,
        label: key(r) === null ? "Not set" : label(r),
        rows: [],
      });
    groups.get(k)!.rows.push(r);
  }
  return [...groups.values()]
    .map((g) => {
      const open = g.rows.filter((r) => isOpenStage(r.stage));
      return {
        key: g.key,
        label: g.label,
        open: open.length,
        openValue: sum(open),
        weighted: wsum(open),
        ...record(g.rows),
      };
    })
    .sort((a, b) => b.openValue - a.openValue || b.wonValue - a.wonValue || b.bids - a.bids);
}
export type Breakdown = ReturnType<typeof breakdown>[number];

/**
 * All dashboard figures. `all` is every visible bid; `inPeriod` the ones issued in the period (used for results,
 * so a quarter's win rate is about that quarter's tenders). The open pipeline is always as of today.
 */
export function bidStats(all: DashBid[], period: { from: string; to: string }, today: string) {
  const inPeriod = all.filter((r) => r.issueDate >= period.from && r.issueDate <= period.to);
  const open = all.filter((r) => isOpenStage(r.stage));
  const closedInPeriod = inPeriod.filter((r) => !isOpenStage(r.stage));

  // Pipeline by stage (open stages, in order)
  const byStage = OPEN_BID_STAGES.map((s) => {
    const rows = open.filter((r) => r.stage === s);
    return {
      stage: s as BidStage,
      count: rows.length,
      value: sum(rows),
      weighted: wsum(rows),
    };
  });

  // Weighted forecast by expected award month: the next 6 months, plus overdue and not set
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 + i, 1));
    return {
      key: d.toISOString().slice(0, 7),
      label: d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
    };
  });
  const afterMonths = months.length ? months[months.length - 1].key : "";
  const forecast = months.map((m) => {
    const rows = open.filter((r) => r.expectedAwardDate?.slice(0, 7) === m.key);
    return { ...m, value: wsum(rows), count: rows.length };
  });
  const awardOverdue = open.filter((r) => r.expectedAwardDate && r.expectedAwardDate < today && r.expectedAwardDate.slice(0, 7) < months[0].key);
  const awardLater = open.filter((r) => r.expectedAwardDate && r.expectedAwardDate.slice(0, 7) > afterMonths);
  const awardUnset = open.filter((r) => !r.expectedAwardDate);

  // What needs a decision or a nudge
  const notSubmitted = open.filter((r) => ["ENQUIRY", "PRE_BID"].includes(r.stage) && r.closingDate < today);
  const closingSoon = open.filter((r) => ["ENQUIRY", "PRE_BID"].includes(r.stage) && r.closingDate >= today && days(today, r.closingDate) <= 7);
  const awaitingAward = open.filter((r) => ["SUBMITTED", "UNDER_EVALUATION", "NEGOTIATION"].includes(r.stage) && r.expectedAwardDate && r.expectedAwardDate < today);
  const noValue = open.filter((r) => !r.value);
  const noBand = open.filter((r) => !r.band);

  // Probability accuracy: the band owners had when bids were decided vs how often those bids were won
  const decided = all.filter((r) => (r.stage === "WON" || r.stage === "LOST") && r.decisionBand);
  const accuracy = PROBABILITY_BANDS.filter((p) => p !== "P100").map((p) => {
    const rows = decided.filter((r) => r.decisionBand === p);
    const won = rows.filter((r) => r.stage === "WON").length;
    return {
      band: p as ProbabilityBand,
      decided: rows.length,
      won,
      actual: rows.length ? won / rows.length : null,
      expected: BAND_MIDPOINT[p],
    };
  });

  // Lost reasons (most recent first)
  const lostReasons = inPeriod
    .filter((r) => r.stage === "LOST" || r.stage === "CANCELLED" || r.stage === "DECLINED")
    .sort((a, b) => (b.closedAt?.getTime() ?? 0) - (a.closedAt?.getTime() ?? 0));

  return {
    inPeriod,
    open,
    totals: {
      openCount: open.length,
      openValue: sum(open),
      weighted: wsum(open),
      submittedInPeriod: inPeriod.filter((r) => r.submittedDate).length,
      issuedInPeriod: inPeriod.length,
      closedInPeriod: closedInPeriod.length,
      ...record(inPeriod),
    },
    byStage,
    forecast,
    awardOverdue: { count: awardOverdue.length, value: wsum(awardOverdue) },
    awardLater: { count: awardLater.length, value: wsum(awardLater) },
    awardUnset: { count: awardUnset.length, value: wsum(awardUnset) },
    attention: { notSubmitted, closingSoon, awaitingAward, noValue, noBand },
    topOpen: [...open].sort((a, b) => weighted(b.value, b.band) - weighted(a.value, a.band) || (b.value ?? 0) - (a.value ?? 0)).slice(0, 10),
    bySector: breakdown(
      inPeriod,
      (r) => r.sector,
      (r) => r.sector!,
    ),
    byType: breakdown(
      inPeriod,
      (r) => r.bidType,
      (r) => r.bidType,
    ),
    byCategory: breakdown(
      inPeriod,
      (r) => r.category,
      (r) => r.category!,
    ),
    byOwner: breakdown(
      all.filter((r) => isOpenStage(r.stage) || (r.issueDate >= period.from && r.issueDate <= period.to)),
      (r) => (r.ownerId ? String(r.ownerId) : null),
      (r) => r.owner ?? "—",
    ),
    byClient: breakdown(
      all.filter((r) => isOpenStage(r.stage) || (r.issueDate >= period.from && r.issueDate <= period.to)),
      (r) => String(r.clientId),
      (r) => r.client,
    ),
    byUnit: breakdown(
      all.filter((r) => isOpenStage(r.stage) || (r.issueDate >= period.from && r.issueDate <= period.to)),
      (r) => String(r.unitId),
      (r) => r.unit,
    ),
    accuracy,
    lostReasons,
  };
}

/**
 * Small bid summary for the home dashboards: every open bid, plus closed bids issued in the last 12 months
 * (`since`), by stage group. Only bids the viewer may see (bidVisibleTo); `mineOf` narrows to the bids that
 * person owns or is on the team of.
 */
export async function bidMix(viewer: SessionUser, since: string, mineOf?: number) {
  const b = schema.bids;
  const rows = await db
    .select({
      stage: b.stage,
      band: b.probabilityBand,
      n: sql<number>`count(*)::int`,
      value: sql<number>`coalesce(sum(${b.bidValue}), 0)::float`,
    })
    .from(b)
    .where(and(bidVisibleTo(viewer), mineOf ? myBids(mineOf) : undefined, or(inArray(b.stage, OPEN_BID_STAGES), gte(b.issueDate, since))))
    .groupBy(b.stage, b.probabilityBand);
  const open = rows.filter((r) => isOpenStage(r.stage));
  return {
    total: rows.reduce((a, r) => a + r.n, 0),
    open: open.reduce((a, r) => a + r.n, 0),
    openValue: open.reduce((a, r) => a + r.value, 0),
    weighted: open.reduce((a, r) => a + weighted(r.value, r.band), 0),
    groups: BID_STAGE_GROUPS.map((g) => ({
      ...g,
      n: rows.filter((r) => g.stages.includes(r.stage)).reduce((a, r) => a + r.n, 0),
    })),
  };
}

/** Bids a person owns or works on (bid team). Combine with bidVisibleTo. */
export const myBids = (userId: number) =>
  or(
    eq(schema.bids.ownerId, userId),
    exists(db.select({ one: sql`1` }).from(schema.bidTeam).where(and(eq(schema.bidTeam.bidId, schema.bids.id), eq(schema.bidTeam.userId, userId)))),
  )!;
