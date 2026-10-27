import { and, asc, countDistinct, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { clientVisibleTo } from "./access";
import { isSuperAdmin, type SessionUser } from "./auth";
import { riyadh, todayRiyadh, visibleTo } from "./meetings";

const count = sql<number>`count(*)`.mapWith(Number);
const m = schema.meetings;

/** "YYYY-MM" of the month `offset` months from the given "YYYY-MM-DD". */
function monthKey(today: string, offset: number) {
  const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 + offset, 1));
  return d.toISOString().slice(0, 7);
}
const monthStart = (key: string) => riyadh(`${key}-01`, "00:00");

export type MonthPoint = { key: string; label: string; held: number };
export type BuRow = { id: number | null; name: string; users: number; held: number; clients: number };

/** Admin overview: meetings held per month, the BU breakdown, and the headline counts — limited to the Admin's business units. */
export async function orgStats(me: SessionUser) {
  const today = todayRiyadh();
  const thisMonth = monthKey(today, 0);
  const firstMonth = monthKey(today, -11);
  const since = monthStart(firstMonth);
  const until = monthStart(monthKey(today, 1));
  const held = and(eq(m.status, "COMPLETED"), gte(m.startAt, since), lt(m.startAt, until), visibleTo(me));
  const myBus = isSuperAdmin(me) ? undefined : inArray(schema.businessUnits.id, me.buIds);
  const ub = schema.userBusinessUnits;
  const activeMember = and(eq(schema.users.status, "ACTIVE"), isSuperAdmin(me) ? undefined : inArray(ub.businessUnitId, me.buIds));
  const month = sql<string>`to_char(${m.startAt} at time zone 'Asia/Riyadh', 'YYYY-MM')`;

  const [perMonth, bus, usersByBu, [users], heldByBu, clientsByBu, clientStatus, [upcoming]] = await Promise.all([
    db.select({ key: month, n: count }).from(m).where(held).groupBy(month),
    db.select({ id: schema.businessUnits.id, name: schema.businessUnits.name }).from(schema.businessUnits).where(and(eq(schema.businessUnits.active, true), myBus)).orderBy(asc(schema.businessUnits.name)),
    // People with access to several units count in each of them
    db.select({ id: ub.businessUnitId, n: count }).from(ub).innerJoin(schema.users, eq(ub.userId, schema.users.id)).where(activeMember).groupBy(ub.businessUnitId),
    isSuperAdmin(me)
      ? db.select({ n: count }).from(schema.users).where(eq(schema.users.status, "ACTIVE"))
      : db.select({ n: countDistinct(ub.userId) }).from(ub).innerJoin(schema.users, eq(ub.userId, schema.users.id)).where(activeMember),
    db
      .select({ id: schema.meetingBusinessUnits.businessUnitId, n: count })
      .from(schema.meetingBusinessUnits)
      .innerJoin(m, eq(schema.meetingBusinessUnits.meetingId, m.id))
      .where(held)
      .groupBy(schema.meetingBusinessUnits.businessUnitId),
    db
      .select({ id: schema.clientBusinessUnits.businessUnitId, n: count })
      .from(schema.clientBusinessUnits)
      .innerJoin(schema.clients, eq(schema.clientBusinessUnits.clientId, schema.clients.id))
      .where(ne(schema.clients.status, "INACTIVE"))
      .groupBy(schema.clientBusinessUnits.businessUnitId),
    db.select({ status: schema.clients.status, n: count }).from(schema.clients).where(clientVisibleTo(me)).groupBy(schema.clients.status),
    db
      .select({ n: count })
      .from(m)
      .where(and(inArray(m.status, ["SCHEDULED", "CONFIRMED"]), gte(m.startAt, new Date()), lt(m.startAt, new Date(Date.now() + 7 * 86400_000)), visibleTo(me))),
  ]);

  const months: MonthPoint[] = Array.from({ length: 12 }, (_, i) => {
    const key = monthKey(today, i - 11);
    const label = new Date(`${key}-01T00:00:00Z`).toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
    return { key, label, held: perMonth.find((p) => p.key === key)?.n ?? 0 };
  });

  const pick = (rows: { id: number | null; n: number }[], id: number | null) => rows.find((r) => r.id === id)?.n ?? 0;
  const buRows: BuRow[] = bus.map((b) => ({ id: b.id, name: b.name, users: pick(usersByBu, b.id), held: pick(heldByBu, b.id), clients: pick(clientsByBu, b.id) }));

  const clientCount = (s: string) => clientStatus.find((c) => c.status === s)?.n ?? 0;
  return {
    months,
    heldThisMonth: months[11].held,
    heldLastMonth: months[10].held,
    heldYear: months.reduce((s, p) => s + p.held, 0),
    thisMonth,
    buRows,
    activeUsers: users.n,
    clients: { active: clientCount("ACTIVE"), pending: clientCount("PENDING_REVIEW"), inactive: clientCount("INACTIVE") },
    upcoming7: upcoming.n,
  };
}
