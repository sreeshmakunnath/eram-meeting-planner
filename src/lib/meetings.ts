import { and, eq, exists, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import type { SessionUser } from "./auth";

// ---------- labels ----------
export const MEETING_STATUSES = ["TO_BE_SCHEDULED", "SCHEDULED", "CONFIRMED", "COMPLETED", "POSTPONED", "CANCELLED"] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];
export const STATUS_LABEL: Record<MeetingStatus, string> = {
  TO_BE_SCHEDULED: "To Be Scheduled",
  SCHEDULED: "Scheduled",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
  POSTPONED: "Postponed",
  CANCELLED: "Cancelled",
};
export const STATUS_TONE: Record<MeetingStatus, "gray" | "blue" | "navy" | "green" | "amber" | "red"> = {
  TO_BE_SCHEDULED: "amber",
  SCHEDULED: "blue",
  CONFIRMED: "navy",
  COMPLETED: "green",
  POSTPONED: "gray",
  CANCELLED: "red",
};
/** Tailwind classes for calendar chips, by status. */
export const STATUS_CHIP: Record<MeetingStatus, string> = {
  TO_BE_SCHEDULED: "bg-amber-50 text-amber-800 border-amber-200",
  SCHEDULED: "bg-brand-50 text-brand-600 border-brand/30",
  CONFIRMED: "bg-navy text-white border-navy",
  COMPLETED: "bg-emerald-50 text-emerald-800 border-emerald-200",
  POSTPONED: "bg-slate-100 text-slate-600 border-slate-200",
  CANCELLED: "bg-red-50 text-red-700 border-red-200 line-through",
};

export const MEETING_TYPES = ["CLIENT_MEETING", "INTERNAL", "FOLLOW_UP", "PRESENTATION", "SITE_VISIT"] as const;
export const TYPE_LABEL: Record<(typeof MEETING_TYPES)[number], string> = {
  CLIENT_MEETING: "Client Meeting",
  INTERNAL: "Internal",
  FOLLOW_UP: "Follow-up",
  PRESENTATION: "Presentation",
  SITE_VISIT: "Site visit",
};
export const MODES = ["IN_PERSON", "TEAMS", "ZOOM", "PHONE"] as const;
export const MODE_LABEL: Record<(typeof MODES)[number], string> = { IN_PERSON: "In person", TEAMS: "Teams", ZOOM: "Zoom", PHONE: "Phone" };
export const PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;
export const PRIORITY_LABEL: Record<(typeof PRIORITIES)[number], string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };

// ---------- time (Saudi Arabia is UTC+3 all year, no daylight saving) ----------
export const TZ = "Asia/Riyadh";
const OFFSET = "+03:00";
/** "2026-10-20" + "10:30" in Riyadh time → Date */
export const riyadh = (date: string, time: string) => new Date(`${date}T${time}:00${OFFSET}`);
/** Date → { date: "2026-10-20", time: "10:30" } in Riyadh time */
export function riyadhParts(d: Date) {
  const shifted = new Date(d.getTime() + 3 * 3600_000).toISOString();
  return { date: shifted.slice(0, 10), time: shifted.slice(11, 16) };
}
export const todayRiyadh = () => riyadhParts(new Date()).date;
export const fmtTime = (d: Date | null | undefined) =>
  d ? new Intl.DateTimeFormat("en-GB", { timeStyle: "short", timeZone: TZ }).format(d) : "";
export const fmtDay = (d: Date | string | null | undefined) =>
  d ? new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: TZ }).format(new Date(d)) : "—";
/** Plain date column (no time zone) like "2026-10-20" → "20 Oct 2026" */
export const fmtPlainDate = (s: string | null | undefined) =>
  s ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${s.slice(0, 10)}T00:00:00Z`)) : "—";

// ---------- visibility ----------
/** Users see meetings they organise, attend (directly or via a group), own the next action of, or own an agreed action on its brief. Admins see all. */
export function visibleTo(me: SessionUser): SQL | undefined {
  if (me.role === "ADMIN") return undefined;
  const m = schema.meetings;
  return or(
    eq(m.organiserId, me.id),
    exists(
      db
        .select({ one: sql`1` })
        .from(schema.meetingAttendees)
        .where(and(eq(schema.meetingAttendees.meetingId, m.id), eq(schema.meetingAttendees.userId, me.id))),
    ),
    exists(
      db
        .select({ one: sql`1` })
        .from(schema.meetingActionOwners)
        .where(and(eq(schema.meetingActionOwners.meetingId, m.id), eq(schema.meetingActionOwners.userId, me.id))),
    ),
    // Owners of an agreed action in the meeting's brief — the person, or a member of the owning group
    exists(
      db
        .select({ one: sql`1` })
        .from(schema.briefActions)
        .innerJoin(schema.meetingBriefs, eq(schema.briefActions.briefId, schema.meetingBriefs.id))
        .where(
          and(
            eq(schema.meetingBriefs.meetingId, m.id),
            or(
              eq(schema.briefActions.ownerUserId, me.id),
              sql`${schema.briefActions.ownerGroupId} in (select gm.group_id from group_members gm where gm.user_id = ${me.id})`,
            ),
          ),
        ),
    ),
  );
}

export async function canView(me: SessionUser, meetingId: number) {
  if (me.role === "ADMIN") return true;
  const [row] = await db
    .select({ id: schema.meetings.id })
    .from(schema.meetings)
    .where(and(eq(schema.meetings.id, meetingId), visibleTo(me)));
  return !!row;
}
export const canEditMeeting = (me: SessionUser, m: { organiserId: number }) => me.role === "ADMIN" || m.organiserId === me.id;

/** Organiser, Admin, or anyone on the attendee list can write the Meeting Brief. Returns the meeting or null. */
export async function canWriteBrief(me: SessionUser, meetingId: number) {
  const m = await db.query.meetings.findFirst({ where: eq(schema.meetings.id, meetingId), with: { attendees: true } });
  if (!m) return null;
  return canEditMeeting(me, m) || m.attendees.some((a) => a.userId === me.id) ? m : null;
}

// ---------- activity log ----------
export async function logActivity(meetingId: number, userId: number | null, action: string, details?: Record<string, unknown>) {
  await db.insert(schema.meetingActivity).values({ meetingId, userId, action, details: details ?? null });
}

// ---------- calendar invite (.ics) ----------
const icsEscape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** RFC 5545 lines must be folded at 75 octets. */
function fold(line: string) {
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > 74) {
      out.push(cur);
      cur = " " + ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n");
}

export function buildIcs(opts: {
  meetingId: number;
  sequence: number;
  method: "REQUEST" | "CANCEL";
  title: string;
  start: Date;
  end: Date;
  location: string;
  description: string;
  organiser: { name: string; email: string };
  attendees: { name: string; email: string }[];
}) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ERAM Holdings//Meeting Planner//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${opts.method}`,
    "BEGIN:VEVENT",
    `UID:meeting-${opts.meetingId}@eram-meeting-planner`,
    `SEQUENCE:${opts.sequence}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(opts.start)}`,
    `DTEND:${icsDate(opts.end)}`,
    `SUMMARY:${icsEscape(opts.title)}`,
    `LOCATION:${icsEscape(opts.location)}`,
    `DESCRIPTION:${icsEscape(opts.description)}`,
    `ORGANIZER;CN=${icsEscape(opts.organiser.name)}:mailto:${opts.organiser.email}`,
    ...opts.attendees.map((a) => `ATTENDEE;CN=${icsEscape(a.name)};ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${a.email}`),
    `STATUS:${opts.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
