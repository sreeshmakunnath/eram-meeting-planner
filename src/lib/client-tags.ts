import { sql } from "drizzle-orm";

// Subqueries for the outer "clients" row. They name "clients"."id" / "clients"."name" explicitly: drizzle leaves
// columns unqualified in a one-table query, and an unqualified "id" inside a subquery would bind to the
// subquery's own table. Use them only in queries whose FROM is the clients table (not aliased).
const outerId = sql.raw(`"clients"."id"`);
const outerName = sql.raw(`"clients"."name"`);

/**
 * Vendor code of the client's completed vendor registration (latest first): null when none is completed, ""
 * when completed without a code. A client belongs to one unit, so this is that unit's registration.
 */
export const vendorRegisteredSql = () =>
  sql<
    string | null
  >`(select coalesce(vr.vendor_code, '') from vendor_registrations vr where vr.client_id = ${outerId} and vr.status = 'COMPLETED' order by vr.completed_at desc nulls last limit 1)`;

/**
 * For Super Admins only: codes of the other business units that have a client of the same name (the same
 * company pursued by competing units), e.g. "NAM, SIN"; null when none.
 */
export const otherUnitsSql = () =>
  sql<
    string | null
  >`(select string_agg(distinct ob.code, ', ') from clients oc join business_units ob on ob.id = oc.business_unit_id where lower(oc.name) = lower(${outerName}) and oc.id <> ${outerId})`;
