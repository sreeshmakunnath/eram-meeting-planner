/** Vendor registration statuses, in the order the work usually goes. */
export const VENDOR_REG_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "MAILED", "ON_HOLD", "SUBMITTED", "PORTAL_CREATED", "COMPLETED"] as const;
export type VendorRegStatus = (typeof VENDOR_REG_STATUSES)[number];

export const VENDOR_REG_LABEL: Record<VendorRegStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  MAILED: "Mailed",
  ON_HOLD: "Hold",
  SUBMITTED: "Submitted",
  PORTAL_CREATED: "Portal created",
  COMPLETED: "Completed",
};

export const VENDOR_REG_TONE: Record<VendorRegStatus, "gray" | "blue" | "amber" | "navy" | "green"> = {
  NOT_STARTED: "gray",
  IN_PROGRESS: "blue",
  MAILED: "blue",
  ON_HOLD: "amber",
  SUBMITTED: "navy",
  PORTAL_CREATED: "navy",
  COMPLETED: "green",
};

/** Everything that isn't completed still needs someone's work. */
export const VENDOR_REG_OPEN: VendorRegStatus[] = VENDOR_REG_STATUSES.filter((s) => s !== "COMPLETED");

/**
 * The four buckets the small charts use; seven slices is too many for a pie. State colours:
 * neutral (not started), blue (moving), amber (on hold), green (done).
 */
export const VENDOR_REG_STAGES = [
  { key: "NOT_STARTED", label: "Not started", color: "#898781", statuses: ["NOT_STARTED"] },
  { key: "ACTIVE", label: "In progress", color: "#2a78d6", statuses: ["IN_PROGRESS", "MAILED", "SUBMITTED", "PORTAL_CREATED"] },
  { key: "ON_HOLD", label: "On hold", color: "#fab219", statuses: ["ON_HOLD"] },
  { key: "COMPLETED", label: "Completed", color: "#0ca30c", statuses: ["COMPLETED"] },
] as const satisfies readonly { key: string; label: string; color: string; statuses: readonly VendorRegStatus[] }[];
export type VendorRegStage = (typeof VENDOR_REG_STAGES)[number]["key"];
export const stageOf = (s: VendorRegStatus) => VENDOR_REG_STAGES.find((g) => (g.statuses as readonly string[]).includes(s))!.key;
