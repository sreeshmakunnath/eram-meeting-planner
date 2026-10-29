// Business-unit access rules. Super Admins see everything; everyone else sees clients (and through them
// meetings) of the business units they're assigned to, plus clients they own or created.
import { and, eq, exists, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import { isAdmin, isSuperAdmin, type SessionUser } from "./auth";

const one = { one: sql`1` };

/** The client is tagged with at least one of the user's business units. */
export const clientInMyBus = (me: SessionUser, clientId: AnyPgColumn) =>
  exists(
    db
      .select(one)
      .from(schema.clientBusinessUnits)
      .where(and(eq(schema.clientBusinessUnits.clientId, clientId), inArray(schema.clientBusinessUnits.businessUnitId, me.buIds))),
  );

/** The user (by id column) shares at least one business unit with me. */
export const userInMyBus = (me: SessionUser, userId: AnyPgColumn) =>
  exists(
    db
      .select(one)
      .from(schema.userBusinessUnits)
      .where(and(eq(schema.userBusinessUnits.userId, userId), inArray(schema.userBusinessUnits.businessUnitId, me.buIds))),
  );

/**
 * Everyone under this person in the reporting lines (their reportees, their reportees' reportees…), as a
 * parenthesised id subquery. UNION stops at loops, so a wrongly circular line can't hang the query.
 */
export const teamOf = (userId: number): SQL => sql`(
  with recursive team(id) as (
    select um.user_id from user_managers um where um.manager_id = ${userId}
    union
    select um.user_id from user_managers um join team on um.manager_id = team.id
  )
  select id from team where id <> ${userId}
)`;

export async function teamIds(userId: number) {
  const res = await db.execute<{ id: number }>(sql`select id from ${teamOf(userId)} as t(id)`);
  return res.rows.map((r) => Number(r.id));
}

/** Clients the user can see: their business units' clients, clients they own or created, and those their team owns or created. */
export function clientVisibleTo(me: SessionUser): SQL | undefined {
  if (isSuperAdmin(me)) return undefined;
  const c = schema.clients;
  return or(clientInMyBus(me, c.id), eq(c.accountOwnerId, me.id), eq(c.createdById, me.id), clientOfMyTeam(me));
}

/** The client was added by, or is owned by, someone under me in the reporting lines. */
export const clientOfMyTeam = (me: SessionUser) => {
  const c = schema.clients;
  return or(sql`${c.createdById} in ${teamOf(me.id)}`, sql`${c.accountOwnerId} in ${teamOf(me.id)}`)!;
};

export async function canSeeClient(me: SessionUser, clientId: number) {
  const [row] = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(and(eq(schema.clients.id, clientId), clientVisibleTo(me)));
  return !!row;
}

/**
 * Full control of a client (account owner, business units, BD tasks): Super Admin, the account owner, an Admin of
 * one of the client's business units, or a manager (any level) of whoever added or owns it.
 */
export async function canManageClient(me: SessionUser, client: { id: number; accountOwnerId: number | null }) {
  if (isSuperAdmin(me) || client.accountOwnerId === me.id) return true;
  const [row] = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(and(eq(schema.clients.id, client.id), or(isAdmin(me) ? clientInMyBus(me, schema.clients.id) : undefined, clientOfMyTeam(me))));
  return !!row;
}

/**
 * Approve a pending client: Super Admin, an Admin of one of its business units, or a manager (at any level) of
 * the person who added it or owns it. Managers don't need an Admin role: their reach is their team.
 */
export async function canApproveClient(me: SessionUser, client: { id: number; createdById: number | null; accountOwnerId: number | null }) {
  if (isAdmin(me) && (await canManageClient(me, { id: client.id, accountOwnerId: null }))) return true;
  const team = await teamIds(me.id);
  return [client.createdById, client.accountOwnerId].some((u) => u != null && team.includes(u));
}

/**
 * Client contacts the user can see. Shared contacts: everyone who can see the client. Private contacts: only
 * the person who added them and the client's account owner — not Admins, not Super Admins.
 */
export function contactVisibleTo(me: SessionUser): SQL {
  const cc = schema.clientContacts;
  if (isSuperAdmin(me)) return isNull(cc.deletedAt);
  return and(
    isNull(cc.deletedAt),
    or(
      eq(cc.shared, true),
      eq(cc.ownerId, me.id),
      exists(db.select(one).from(schema.clients).where(and(eq(schema.clients.id, cc.clientId), eq(schema.clients.accountOwnerId, me.id)))),
      exists(db.select(one).from(schema.contactShares).where(and(eq(schema.contactShares.contactId, cc.id), eq(schema.contactShares.userId, me.id)))),
    ),
  )!;
}

/**
 * Active people who can see the client (the clientVisibleTo rule seen from the client's side): Super Admins,
 * its business units' people, its account owner and creator, and their managers at any level. Contacts can be
 * shared only with them, since nobody else could open the client.
 */
export async function usersWhoCanSeeClient(clientId: number) {
  const res = await db.execute<{ id: number; full_name: string }>(sql`
    with recursive c as (select account_owner_id, created_by_id from clients where id = ${clientId}),
    up(id) as (
      select um.manager_id from user_managers um, c where um.user_id in (c.account_owner_id, c.created_by_id)
      union
      select um.manager_id from user_managers um join up on um.user_id = up.id
    )
    select u.id, u.full_name from users u, c
    where u.status = 'ACTIVE' and (
      u.role = 'SUPER_ADMIN' or u.id = c.account_owner_id or u.id = c.created_by_id or u.id in (select id from up)
      or exists (select 1 from user_business_units ub join client_business_units cb on cb.business_unit_id = ub.business_unit_id
                 where ub.user_id = u.id and cb.client_id = ${clientId})
    )
    order by u.full_name`);
  return res.rows.map((r) => ({ id: Number(r.id), fullName: r.full_name }));
}

/**
 * Remove a contact or change its sharing: the person who added it or the client's account owner. A shared
 * contact can also be managed by whoever can edit the client.
 */
export async function canManageContact(me: SessionUser, contact: { ownerId: number | null; shared: boolean }, client: { id: number; accountOwnerId: number | null }) {
  if (isSuperAdmin(me) || contact.ownerId === me.id || client.accountOwnerId === me.id) return true;
  return contact.shared && canManageClient(me, client);
}

/** Manage a user account: Super Admins manage everyone; BU Admins manage non-Super users who share one of their units. */
export async function canManageUser(me: SessionUser, userId: number) {
  if (isSuperAdmin(me)) return true;
  if (!isAdmin(me)) return false;
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.id, userId), ne(schema.users.role, "SUPER_ADMIN"), userInMyBus(me, schema.users.id)));
  return !!row;
}

export async function userBuIds(userId: number) {
  const rows = await db.select().from(schema.userBusinessUnits).where(eq(schema.userBusinessUnits.userId, userId));
  return rows.map((r) => r.businessUnitId);
}

/** Business units this person can pick for overviews and filters: all active ones for a Super Admin, otherwise their own. */
export const selectableBus = (me: SessionUser) =>
  db
    .select({ id: schema.businessUnits.id, name: schema.businessUnits.name })
    .from(schema.businessUnits)
    .where(and(eq(schema.businessUnits.active, true), isSuperAdmin(me) ? undefined : inArray(schema.businessUnits.id, me.buIds)))
    .orderBy(schema.businessUnits.name);

/**
 * A viewer limited to exactly one business unit, for the BU overview: it sees that unit's clients, meetings
 * and tasks and nothing personal (id 0 owns and attends nothing). Admins only; null when they have no access to the unit.
 */
export function scopeToBu(me: SessionUser, buId: number): SessionUser | null {
  if (!buId || !isAdmin(me) || (!isSuperAdmin(me) && !me.buIds.includes(buId))) return null;
  return { ...me, id: 0, role: "ADMIN", buIds: [buId] };
}

/** Business units a person may pick on a form: all for a Super Admin, otherwise their own. */
export const allowedBuIds = (me: SessionUser, all: number[]) => (isSuperAdmin(me) ? all : all.filter((id) => me.buIds.includes(id)));

/**
 * The business units to save on a record. The person can only add or remove their own units; units
 * outside their access that were already on the record are kept. At least one of their units is required.
 */
export function mergeBuIds(me: SessionUser, picked: number[], existing: number[], what: string) {
  const mine = isSuperAdmin(me) ? picked : picked.filter((id) => me.buIds.includes(id));
  const kept = isSuperAdmin(me) ? [] : existing.filter((id) => !me.buIds.includes(id));
  const ids = [...new Set([...mine, ...kept])];
  const error = mine.length ? null : `Select at least one ${isSuperAdmin(me) ? "" : "of your "}business unit${isSuperAdmin(me) ? "" : "s"} for this ${what}.`;
  return { error, ids };
}
