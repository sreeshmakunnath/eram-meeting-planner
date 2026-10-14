import { and, asc, desc, eq, exists, gte, ilike, inArray, lt, notInArray, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import type { SessionUser } from "./auth";
import { MEETING_STATUSES, PRIORITIES, riyadh, visibleTo, type MeetingStatus } from "./meetings";

export type MeetingFilters = {
  q?: string;
  status?: string; // a status, "OPEN" (not completed/cancelled) or "ALL" (default)
  priority?: string;
  client?: string;
  user?: string; // attendee
  group?: string;
  from?: string; // yyyy-mm-dd (Riyadh)
  to?: string;
};

const m = schema.meetings;

export function meetingWhere(me: SessionUser, f: MeetingFilters): SQL | undefined {
  const where: (SQL | undefined)[] = [visibleTo(me)];
  if (f.q) {
    const q = `%${f.q}%`;
    where.push(or(ilike(m.title, q), ilike(m.objective, q), ilike(m.location, q), ilike(schema.clients.name, q)));
  }
  const status = f.status ?? "ALL";
  if (status === "OPEN") where.push(notInArray(m.status, ["COMPLETED", "CANCELLED"]));
  else if ((MEETING_STATUSES as readonly string[]).includes(status)) where.push(eq(m.status, status as MeetingStatus));
  if (f.priority && (PRIORITIES as readonly string[]).includes(f.priority)) where.push(eq(m.priority, f.priority as (typeof PRIORITIES)[number]));
  if (f.client) where.push(eq(m.clientId, Number(f.client)));
  if (f.user)
    where.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(schema.meetingAttendees)
          .where(and(eq(schema.meetingAttendees.meetingId, m.id), eq(schema.meetingAttendees.userId, Number(f.user)))),
      ),
    );
  if (f.group)
    where.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(schema.meetingGroups)
          .where(and(eq(schema.meetingGroups.meetingId, m.id), eq(schema.meetingGroups.groupId, Number(f.group)))),
      ),
    );
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) where.push(gte(m.startAt, riyadh(f.from, "00:00")));
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) where.push(lt(m.startAt, new Date(riyadh(f.to, "00:00").getTime() + 86400_000)));
  const list = where.filter(Boolean) as SQL[];
  return list.length ? and(...list) : undefined;
}

const agg = (q: ReturnType<typeof sql>) => q.mapWith(String);

/** One row per meeting with every Client Meeting Planner column, names already joined. */
export async function listMeetings(me: SessionUser, f: MeetingFilters, limit = 500) {
  return db
    .select({
      id: m.id,
      title: m.title,
      priority: m.priority,
      client: schema.clients.name,
      clientId: m.clientId,
      location: m.location,
      mode: m.mode,
      venue: m.venue,
      type: m.type,
      startAt: m.startAt,
      endAt: m.endAt,
      status: m.status,
      objective: m.objective,
      documents: m.documents,
      nextAction: m.nextAction,
      followUpDate: m.followUpDate,
      notes: m.notes,
      organiser: schema.users.fullName,
      clientContacts: agg(sql`concat_ws('; ',
        (select string_agg(cc.name, '; ' order by cc.name) from meeting_contacts mc join client_contacts cc on cc.id = mc.contact_id where mc.meeting_id = ${m.id}),
        nullif(${m.clientContactsText}, ''))`),
      attendees: agg(sql`(select string_agg(u.full_name, ', ' order by u.full_name) from meeting_attendees ma join users u on u.id = ma.user_id where ma.meeting_id = ${m.id})`),
      groups: agg(sql`(select string_agg(g.name, ', ' order by g.name) from meeting_groups mg join groups g on g.id = mg.group_id where mg.meeting_id = ${m.id})`),
      businessUnits: agg(sql`(select string_agg(b.name, '; ' order by b.name) from meeting_business_units mb join business_units b on b.id = mb.business_unit_id where mb.meeting_id = ${m.id})`),
      owners: agg(sql`(select string_agg(u.full_name, ', ' order by u.full_name) from meeting_action_owners mo join users u on u.id = mo.user_id where mo.meeting_id = ${m.id})`),
      briefStatus: agg(sql`(select b.status from meeting_briefs b where b.meeting_id = ${m.id})`),
    })
    .from(m)
    .leftJoin(schema.clients, eq(m.clientId, schema.clients.id))
    .innerJoin(schema.users, eq(m.organiserId, schema.users.id))
    .where(meetingWhere(me, f))
    .orderBy(sql`${m.startAt} asc nulls last`, sql`case ${m.priority} when 'HIGH' then 0 when 'MEDIUM' then 1 else 2 end`, asc(m.title))
    .limit(limit);
}
export type MeetingRow = Awaited<ReturnType<typeof listMeetings>>[number];

/** Meetings in a time window (for the calendar), visible to the user. */
export async function meetingsBetween(me: SessionUser, from: Date, to: Date, extra?: SQL) {
  return db
    .select({ id: m.id, title: m.title, startAt: m.startAt, endAt: m.endAt, status: m.status, client: schema.clients.name, priority: m.priority })
    .from(m)
    .leftJoin(schema.clients, eq(m.clientId, schema.clients.id))
    .where(and(visibleTo(me), gte(m.startAt, from), lt(m.startAt, to), extra))
    .orderBy(asc(m.startAt));
}

export async function toBeScheduled(me: SessionUser, extra?: SQL) {
  return db
    .select({ id: m.id, title: m.title, client: schema.clients.name, priority: m.priority, followUpDate: m.followUpDate })
    .from(m)
    .leftJoin(schema.clients, eq(m.clientId, schema.clients.id))
    .where(and(visibleTo(me), inArray(m.status, ["TO_BE_SCHEDULED", "POSTPONED"]), extra))
    .orderBy(sql`case ${m.priority} when 'HIGH' then 0 when 'MEDIUM' then 1 else 2 end`, desc(m.createdAt));
}
