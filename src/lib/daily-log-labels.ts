// Daily log labels and choices. No database imports: the log form (a client component) uses these.
/** Types people pick when they write an entry. */
export const ACTIVITY_TYPES = ["CLIENT_CALL", "EMAIL_FOLLOW_UP", "SITE_VISIT", "RESEARCH", "PROPOSAL", "INTERNAL_MEETING", "ADMIN", "OTHER"] as const;
/** Types of the entries the system adds from what people do in the planner (never picked by hand). */
export const SYSTEM_ACTIVITY_TYPES = ["MEETING", "TASK", "CLIENT_ADDED"] as const;
export const ALL_ACTIVITY_TYPES = [...ACTIVITY_TYPES, ...SYSTEM_ACTIVITY_TYPES] as const;
export type ActivityType = (typeof ALL_ACTIVITY_TYPES)[number];
export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  MEETING: "Meeting",
  TASK: "Task",
  CLIENT_ADDED: "Client added",
  CLIENT_CALL: "Client call",
  EMAIL_FOLLOW_UP: "Email / follow-up",
  SITE_VISIT: "Site visit",
  RESEARCH: "Research",
  PROPOSAL: "Proposal / tender work",
  INTERNAL_MEETING: "Internal meeting",
  ADMIN: "Admin",
  OTHER: "Other",
};

/** Time-spent choices on the forms, in minutes. */
export const DURATIONS: [number, string][] = [
  [15, "15 min"],
  [30, "30 min"],
  [45, "45 min"],
  [60, "1 h"],
  [90, "1.5 h"],
  [120, "2 h"],
  [180, "3 h"],
  [240, "4 h"],
  [360, "6 h"],
  [480, "8 h"],
];
export const fmtMinutes = (m: number | null | undefined) => {
  if (!m) return "";
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h} h${r ? ` ${r} min` : ""}` : `${r} min`;
};
