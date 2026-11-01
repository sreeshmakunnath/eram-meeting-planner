// Daily log: entries people write about their own work. Visible to the person, their managers (any level),
// Admins of the entry's business unit and Super Admins. Peers don't see each other's logs.
import { and, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { teamOf } from "./access";
import { isAdmin, isSuperAdmin, type SessionUser } from "./auth";
import { ACTIVITY_TYPES, type ActivityType } from "./daily-log-labels";
import { todayRiyadh } from "./meetings";

export { ACTIVITY_LABEL, ACTIVITY_TYPES, DURATIONS, fmtMinutes, type ActivityType } from "./daily-log-labels";

/** How long the writer can still edit or delete an entry. */
export const EDIT_DAYS = 7;

const l = schema.dailyLogs;

export function logVisibleTo(me: SessionUser): SQL | undefined {
  if (isSuperAdmin(me)) return undefined;
  return or(eq(l.userId, me.id), sql`${l.userId} in ${teamOf(me.id)}`, isAdmin(me) ? inArray(l.businessUnitId, me.buIds) : undefined);
}

export const canEditLog = (me: SessionUser, entry: { userId: number; createdAt: Date }) =>
  entry.userId === me.id && Date.now() - entry.createdAt.getTime() < EDIT_DAYS * 86400_000;

export type LogFilters = {
  scope?: string; // "mine" (default) | "team" (my reportees) | "all" (everything I can see)
  user?: string;
  client?: string;
  type?: string;
  from?: string; // YYYY-MM-DD, default 6 days ago
  to?: string; // default today
  q?: string;
};

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
export const defaultRange = () => ({ from: addDays(todayRiyadh(), -6), to: todayRiyadh() });

export function logWhere(me: SessionUser, f: LogFilters, extra?: SQL): SQL | undefined {
  const range = defaultRange();
  const w: (SQL | undefined)[] = [logVisibleTo(me), extra];
  const scope = f.scope ?? "mine";
  if (scope === "mine" && !f.user) w.push(eq(l.userId, me.id)); // picking a person overrides "My log"
  if (scope === "team") w.push(sql`${l.userId} in ${teamOf(me.id)}`);
  if (f.user) w.push(eq(l.userId, Number(f.user)));
  if (f.client) w.push(eq(l.clientId, Number(f.client)));
  if (f.type && (ACTIVITY_TYPES as readonly string[]).includes(f.type)) w.push(eq(l.type, f.type as ActivityType));
  w.push(gte(l.logDate, f.from || range.from), lte(l.logDate, f.to || range.to));
  if (f.q) w.push(ilike(l.description, `%${f.q}%`));
  const list = w.filter(Boolean) as SQL[];
  return list.length ? and(...list) : undefined;
}

/** Entries with names, newest day first. `where` comes from logWhere, or a client / task filter. */
export function listLogs(where: SQL | undefined, limit = 1000) {
  return db
    .select({
      id: l.id,
      userId: l.userId,
      user: schema.users.fullName,
      logDate: l.logDate,
      type: l.type,
      description: l.description,
      minutes: l.minutes,
      clientId: l.clientId,
      client: schema.clients.name,
      taskId: l.taskId,
      task: sql<string | null>`(select t.title from tasks t where t.id = ${l.taskId})`,
      meetingId: l.meetingId,
      meeting: sql<string | null>`(select m.title from meetings m where m.id = ${l.meetingId})`,
      businessUnit: sql<string>`(select b.name from business_units b where b.id = ${l.businessUnitId})`,
      createdAt: l.createdAt,
    })
    .from(l)
    .innerJoin(schema.users, eq(l.userId, schema.users.id))
    .leftJoin(schema.clients, eq(l.clientId, schema.clients.id))
    .where(where)
    .orderBy(desc(l.logDate), desc(l.createdAt))
    .limit(limit);
}
export type LogRow = Awaited<ReturnType<typeof listLogs>>[number];

/** Entries about one client or one task that this person may see. */
export const logsFor = (me: SessionUser, on: { clientId?: number; taskId?: number }) =>
  listLogs(and(logVisibleTo(me), on.clientId ? eq(l.clientId, on.clientId) : undefined, on.taskId ? eq(l.taskId, on.taskId) : undefined), 200);
