// Business-unit access rules. Super Admins see everything; everyone else sees clients (and through them
// meetings) of the business units they're assigned to, plus clients they own or created.
import { and, eq, exists, inArray, ne, or, sql, type SQL } from "drizzle-orm";
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

/** Clients the user can see: their business units' clients, and clients they own or created. */
export function clientVisibleTo(me: SessionUser): SQL | undefined {
  if (isSuperAdmin(me)) return undefined;
  const c = schema.clients;
  return or(clientInMyBus(me, c.id), eq(c.accountOwnerId, me.id), eq(c.createdById, me.id));
}

export async function canSeeClient(me: SessionUser, clientId: number) {
  const [row] = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(and(eq(schema.clients.id, clientId), clientVisibleTo(me)));
  return !!row;
}

/** Edit a client: Super Admin, the account owner, or an Admin of one of the client's business units. */
export async function canManageClient(me: SessionUser, client: { id: number; accountOwnerId: number | null }) {
  if (isSuperAdmin(me) || client.accountOwnerId === me.id) return true;
  if (!isAdmin(me)) return false;
  const [row] = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(and(eq(schema.clients.id, client.id), clientInMyBus(me, schema.clients.id)));
  return !!row;
}

/**
 * Client contacts the user can see. Shared contacts: everyone who can see the client. Private contacts: only
 * the person who added them and the client's account owner — not Admins, not Super Admins.
 */
export function contactVisibleTo(me: SessionUser): SQL {
  const cc = schema.clientContacts;
  return or(
    eq(cc.shared, true),
    eq(cc.ownerId, me.id),
    exists(db.select(one).from(schema.clients).where(and(eq(schema.clients.id, cc.clientId), eq(schema.clients.accountOwnerId, me.id)))),
  )!;
}

/**
 * Remove a contact or change its sharing: the person who added it or the client's account owner. A shared
 * contact can also be managed by whoever can edit the client.
 */
export async function canManageContact(me: SessionUser, contact: { ownerId: number | null; shared: boolean }, client: { id: number; accountOwnerId: number | null }) {
  if (contact.ownerId === me.id || client.accountOwnerId === me.id) return true;
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
