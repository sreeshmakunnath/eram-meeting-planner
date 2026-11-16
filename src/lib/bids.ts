// Bids (tenders / enquiries): stages, probability bands and the dropdown lists. Shared by server and client code.

/** Stages in the order the work goes. The last four close the bid. */
export const BID_STAGES = ["ENQUIRY", "PRE_BID", "SUBMITTED", "UNDER_EVALUATION", "NEGOTIATION", "WON", "LOST", "CANCELLED", "DECLINED"] as const;
export type BidStage = (typeof BID_STAGES)[number];

export const BID_STAGE_LABEL: Record<BidStage, string> = {
  ENQUIRY: "Enquiry",
  PRE_BID: "Pre-bid",
  SUBMITTED: "Submitted",
  UNDER_EVALUATION: "Under evaluation",
  NEGOTIATION: "Negotiation",
  WON: "Won",
  LOST: "Lost",
  CANCELLED: "Cancelled by client",
  DECLINED: "Not submitted / Declined",
};

export const BID_STAGE_TONE: Record<BidStage, "gray" | "blue" | "navy" | "amber" | "green" | "red"> = {
  ENQUIRY: "gray",
  PRE_BID: "blue",
  SUBMITTED: "navy",
  UNDER_EVALUATION: "navy",
  NEGOTIATION: "amber",
  WON: "green",
  LOST: "red",
  CANCELLED: "gray",
  DECLINED: "gray",
};

export const OPEN_BID_STAGES: BidStage[] = ["ENQUIRY", "PRE_BID", "SUBMITTED", "UNDER_EVALUATION", "NEGOTIATION"];
export const isOpenStage = (s: BidStage) => OPEN_BID_STAGES.includes(s);
/** Closing as Lost, Cancelled or Declined needs a reason. */
export const NEEDS_REASON: BidStage[] = ["LOST", "CANCELLED", "DECLINED"];

/** Probability: picked by the bid owner. Weighted value uses the midpoint. */
export const PROBABILITY_BANDS = ["P0_20", "P21_50", "P51_80", "P81_90", "P100"] as const;
export type ProbabilityBand = (typeof PROBABILITY_BANDS)[number];
export const BAND_LABEL: Record<ProbabilityBand, string> = {
  P0_20: "0–20%",
  P21_50: "21–50%",
  P51_80: "51–80%",
  P81_90: "81–90%",
  P100: "100%",
};
export const BAND_MIDPOINT: Record<ProbabilityBand, number> = {
  P0_20: 0.1,
  P21_50: 0.35,
  P51_80: 0.65,
  P81_90: 0.85,
  P100: 1,
};
/** A guide shown beside the dropdown; never filled in for the owner. */
export const TYPICAL_BAND: Partial<Record<BidStage, ProbabilityBand>> = {
  ENQUIRY: "P0_20",
  PRE_BID: "P0_20",
  SUBMITTED: "P21_50",
  UNDER_EVALUATION: "P51_80",
  NEGOTIATION: "P81_90",
  WON: "P100",
};

export const BID_TYPES = ["BID", "RFQ", "RFP"] as const;
export type BidType = (typeof BID_TYPES)[number];
export const BID_TYPE_LABEL: Record<BidType, string> = {
  BID: "Bid",
  RFQ: "RFQ",
  RFP: "RFP",
};

export const TENDER_CATEGORIES = ["GOVERNMENT", "SEMI_GOVERNMENT", "PRIVATE"] as const;
export type TenderCategory = (typeof TENDER_CATEGORIES)[number];
export const TENDER_CATEGORY_LABEL: Record<TenderCategory, string> = {
  GOVERNMENT: "Government",
  SEMI_GOVERNMENT: "Semi-government",
  PRIVATE: "Private",
};

export const SUBMISSION_MODES = ["PORTAL", "ENVELOPE", "EMAIL", "HAND"] as const;
export type SubmissionMode = (typeof SUBMISSION_MODES)[number];
export const SUBMISSION_MODE_LABEL: Record<SubmissionMode, string> = {
  PORTAL: "Vendor portal",
  ENVELOPE: "Closed envelope",
  EMAIL: "Email",
  HAND: "Hand delivery",
};

/** Sectors seen in the tender register; free text is allowed too. */
export const SECTORS = [
  "Oil & Gas",
  "Chemical",
  "Petrochemical",
  "Infrastructure",
  "Aviation",
  "Power & Utilities",
  "Marine & Offshore",
  "Construction",
  "Manufacturing",
  "Government",
];

/** Weighted value of a bid: value × the midpoint of its band (open bids only). */
export const weighted = (value: number | null, band: ProbabilityBand | null) => (value && band ? value * BAND_MIDPOINT[band] : 0);

export const usd = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
/** $1.2M / $350K for tight spaces. */
export const usdShort = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`);

/**
 * Stages grouped for small charts (home dashboards). `filter` is the bids list's stage filter for the group.
 * Colours: open stages on the blue ramp, then the reserved good / critical / neutral state colours.
 */
export const BID_STAGE_GROUPS = [
  {
    key: "PREPARING",
    label: "Preparing",
    color: "#86b6ef",
    stages: ["ENQUIRY", "PRE_BID"] as BidStage[],
  },
  {
    key: "AWAITING",
    label: "Awaiting award",
    color: "#1c5cab",
    stages: ["SUBMITTED", "UNDER_EVALUATION", "NEGOTIATION"] as BidStage[],
  },
  { key: "WON", label: "Won", color: "#0ca30c", stages: ["WON"] as BidStage[] },
  {
    key: "LOST",
    label: "Lost",
    color: "#d03b3b",
    stages: ["LOST"] as BidStage[],
  },
  {
    key: "OTHER",
    label: "Cancelled / declined",
    color: "#898781",
    stages: ["CANCELLED", "DECLINED"] as BidStage[],
  },
] as const;
export type BidStageGroup = (typeof BID_STAGE_GROUPS)[number]["key"];
