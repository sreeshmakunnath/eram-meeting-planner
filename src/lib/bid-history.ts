import { inArray, ne, and } from "drizzle-orm";
import { bidVisibleTo } from "@/lib/access";
import type { SessionUser } from "@/lib/auth";
import { db, schema } from "@/db";
import type { Bid } from "@/db/schema";

/** Fewer closed bids than this in a group and its win rate isn't shown. */
export const MIN_HISTORY = 10;

export type BidHistory = { pct: number; n: number; basis: string } | { pct: null; closed: number };

/**
 * Historical win probability for a bid: won ÷ (won + lost) among closed bids like it, from the narrowest group
 * with at least MIN_HISTORY closed bids — same client and bid type, then same sector and bid type in the same
 * unit, then the same unit, then all bids. Cancelled and Declined bids say nothing about ERAM's chance, so they
 * are left out. Only bids the viewer may see count (bidVisibleTo; all for a Super Admin), so even the
 * percentage never reflects bids they can't open.
 */
export async function bidHistory(viewer: SessionUser, bid: Pick<Bid, "id" | "clientId" | "bidType" | "sector" | "businessUnitId">): Promise<BidHistory> {
  const b = schema.bids;
  const closed = await db
    .select({ stage: b.stage, clientId: b.clientId, bidType: b.bidType, sector: b.sector, businessUnitId: b.businessUnitId })
    .from(b)
    .where(and(inArray(b.stage, ["WON", "LOST"]), ne(b.id, bid.id), bidVisibleTo(viewer)));
  const sector = bid.sector?.toLowerCase();
  const tiers: [string, (r: (typeof closed)[number]) => boolean][] = [
    ["same client and bid type", (r) => r.clientId === bid.clientId && r.bidType === bid.bidType],
    ...(sector ? [["same sector and bid type in this unit", (r: (typeof closed)[number]) => r.sector?.toLowerCase() === sector && r.bidType === bid.bidType && r.businessUnitId === bid.businessUnitId] as [string, (r: (typeof closed)[number]) => boolean]] : []),
    ["this business unit", (r) => r.businessUnitId === bid.businessUnitId],
    [viewer.role === "SUPER_ADMIN" ? "all bids" : "all bids you can see", () => true],
  ];
  for (const [basis, match] of tiers) {
    const group = closed.filter(match);
    if (group.length >= MIN_HISTORY) return { pct: Math.round((group.filter((r) => r.stage === "WON").length / group.length) * 100), n: group.length, basis };
  }
  return { pct: null, closed: closed.length };
}
