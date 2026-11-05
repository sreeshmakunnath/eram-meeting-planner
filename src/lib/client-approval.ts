// Clients added by Users wait for review. Who can approve one: Super Admins, Admins of its business units, and
// managers (any level) of whoever added or owns it (see canApproveClient). This file lists what's waiting for a
// person (dashboard) and tells the approvers and the person who added it. Super Admins aren't notified: they
// see everything waiting on their dashboard.
import { and, desc, eq, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { clientInMyBus, clientOfMyTeam } from "./access";
import { isAdmin, isSuperAdmin, type SessionUser } from "./auth";
import { appUrl, button, esc, sendMail } from "./mail";
import { notify } from "./notifications";

const c = schema.clients;

/** canApproveClient as a filter: pending clients this person may approve. */
export function approvableBy(me: SessionUser): SQL {
  const reach = isSuperAdmin(me) ? undefined : or(isAdmin(me) ? clientInMyBus(me, c.id) : undefined, clientOfMyTeam(me));
  return and(eq(c.status, "PENDING_REVIEW"), reach)!;
}

/** Newest first, for the dashboard. */
export async function clientsToApprove(me: SessionUser, limit = 50) {
  return db
    .select({
      id: c.id,
      name: c.name,
      country: c.country,
      createdAt: c.createdAt,
      addedBy: sql<string | null>`(select u.full_name from users u where u.id = ${c.createdById})`,
    })
    .from(c)
    .where(and(approvableBy(me), sql`${c.createdById} is distinct from ${me.id}`))
    .orderBy(desc(c.createdAt))
    .limit(limit);
}

/**
 * The people to tell about a new pending client: Admins of its business units and the direct managers of the
 * person who added it (or of its account owner). Not Super Admins, not the person who added it.
 */
async function approversOf(clientId: number, addedById: number) {
  const res = await db.execute<{ id: number; email: string; full_name: string }>(sql`
    select u.id, u.email, u.full_name from users u, clients cl
    where cl.id = ${clientId} and u.status = 'ACTIVE' and u.role <> 'SUPER_ADMIN' and u.id <> ${addedById} and (
      (u.role = 'ADMIN' and exists (select 1 from user_business_units ub join client_business_units cb on cb.business_unit_id = ub.business_unit_id
                                    where ub.user_id = u.id and cb.client_id = cl.id))
      or u.id in (select um.manager_id from user_managers um where um.user_id in (cl.created_by_id, cl.account_owner_id))
    )`);
  return res.rows.map((r) => ({ id: Number(r.id), email: r.email, fullName: r.full_name }));
}

/** A User added a client that needs review: in-app notice and email to its approvers. Never fails the action. */
export async function notifyClientPending(clientId: number, addedBy: { id: number; name: string }) {
  try {
    const [client] = await db.select({ name: c.name, country: c.country, status: c.status }).from(c).where(eq(c.id, clientId));
    if (!client || client.status !== "PENDING_REVIEW") return;
    const people = await approversOf(clientId, addedBy.id);
    if (!people.length) return;
    const href = `/clients/${clientId}`;
    await notify(
      people.map((p) => p.id),
      { kind: "CLIENT_PENDING", title: `Client waiting for review: ${client.name}`, body: `Added by ${addedBy.name}${client.country ? ` · ${client.country}` : ""}`, href, actorId: addedBy.id },
    );
    for (const p of people)
      await sendMail(
        p.email,
        `Client waiting for your review: ${client.name}`,
        "Client waiting for review",
        `<p>Hello ${esc(p.fullName)},</p><p>${esc(addedBy.name)} added a new client, <b>${esc(client.name)}</b>${client.country ? ` (${esc(client.country)})` : ""}. It can be used once it's approved.</p><p>Check it isn't a duplicate, then approve it or merge it into the existing client.</p>${button(appUrl(href), "Review client")}`,
      );
  } catch (e) {
    console.error("client pending notice failed", clientId, e);
  }
}

/** Tell the person who added the client that it was approved, or merged into another one. */
export async function notifyClientDecision(
  client: { id: number; name: string; createdById: number | null },
  by: { id: number; name: string },
  outcome: { approved: true; remarks?: string | null } | { approved: false; mergedInto: { id: number; name: string } },
) {
  if (!client.createdById || client.createdById === by.id) return;
  try {
    const [u] = await db.select({ email: schema.users.email, fullName: schema.users.fullName, status: schema.users.status }).from(schema.users).where(eq(schema.users.id, client.createdById));
    if (!u || u.status !== "ACTIVE") return;
    const href = `/clients/${outcome.approved ? client.id : outcome.mergedInto.id}`;
    const title = outcome.approved ? `Client approved: ${client.name}` : `Client merged: ${client.name} → ${outcome.mergedInto.name}`;
    const body = outcome.approved
      ? `Approved by ${by.name}${outcome.remarks ? ` · "${outcome.remarks}"` : ""}`
      : `${by.name} found it already exists as ${outcome.mergedInto.name}; your contacts were moved there.`;
    await notify([client.createdById], { kind: "CLIENT_REVIEWED", title, body, href, actorId: by.id });
    await sendMail(
      u.email,
      title,
      outcome.approved ? "Client approved" : "Client merged",
      `<p>Hello ${esc(u.fullName)},</p><p>${
        outcome.approved
          ? `${esc(by.name)} approved <b>${esc(client.name)}</b>. It's now available everywhere in the planner.${outcome.remarks ? `</p><p>Remarks: ${esc(outcome.remarks)}` : ""}`
          : `${esc(by.name)} merged <b>${esc(client.name)}</b> into the existing client <b>${esc(outcome.mergedInto.name)}</b>. The contacts you added were moved there.`
      }</p>${button(appUrl(href), "Open client")}`,
    );
  } catch (e) {
    console.error("client decision notice failed", client.id, e);
  }
}
