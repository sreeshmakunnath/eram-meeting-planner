// The business unit a new task belongs to. Pure database logic so it also runs from the migration script
// (Meeting Brief backfill). Same rule as migration 0009.
import { sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "../db/schema";

type Db = NodePgDatabase<typeof schema>;

/**
 * The client's unit (one the creator has access to first, then the creator's primary unit), else the
 * meeting's unit, else the creator's primary unit.
 */
export async function taskBuFor(db: Db, opts: { clientId?: number | null; meetingId?: number | null; userId: number | null }): Promise<number> {
  const { clientId = null, meetingId = null, userId } = opts;
  const preferMine = (bu: SQL) => sql`
    exists (select 1 from user_business_units ub where ub.user_id = ${userId}::int and ub.business_unit_id = ${bu}) desc,
    coalesce(${bu} = (select u.business_unit_id from users u where u.id = ${userId}::int), false) desc,
    ${bu}`;
  const res = await db.execute<{ bu: number | string | null }>(sql`select coalesce(
    (select cb.business_unit_id from client_business_units cb where cb.client_id = ${clientId}::int order by ${preferMine(sql.raw("cb.business_unit_id"))} limit 1),
    (select mb.business_unit_id from meeting_business_units mb where mb.meeting_id = ${meetingId}::int order by ${preferMine(sql.raw("mb.business_unit_id"))} limit 1),
    (select u.business_unit_id from users u where u.id = ${userId}::int),
    (select min(b.id) from business_units b)
  ) as bu`);
  return Number(res.rows[0].bu);
}
