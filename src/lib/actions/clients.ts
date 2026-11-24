"use server";
import { and, eq, inArray, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { canApproveClient, canManageClient, canManageContact, canSeeClient, isActiveMemberOf, usersWhoCanSeeClient } from "@/lib/access";
import { isAdmin, isSuperAdmin, requireAdmin, requireSuperAdmin, requireUser, type SessionUser } from "@/lib/auth";
import { FormError, int, ints, isEmail, req, str, toFormError } from "@/lib/form";
import { assertClientName, clientNameMatches, type ClientNameMatches } from "@/lib/client-names";
import { BD_STAGES, CLIENT_STATUSES, CLIENT_TYPES } from "@/lib/queries";
import { systemLogClientAdded } from "@/lib/system-log";
import { notifyClientDecision, notifyClientPending } from "@/lib/client-approval";

function readClient(fd: FormData) {
  const type = str(fd, "type") as (typeof CLIENT_TYPES)[number];
  if (!CLIENT_TYPES.includes(type)) throw new FormError("Client type is required.");
  const bd = str(fd, "bdStage") as (typeof BD_STAGES)[number] | null;
  const website = str(fd, "website");
  if (website && !/^https?:\/\/\S+\.\S+/.test(website)) throw new FormError("Website should start with http:// or https://");
  return {
    name: req(fd, "name", "Client name"),
    shortCode: str(fd, "shortCode"),
    type,
    industry: str(fd, "industry"),
    country: req(fd, "country", "Country"),
    city: str(fd, "city"),
    website,
    accountOwnerId: int(fd, "accountOwnerId"),
    accountGroupId: int(fd, "accountGroupId"),
    bdStage: bd && BD_STAGES.includes(bd) ? bd : null,
    targetBatch: str(fd, "targetBatch"),
    notes: str(fd, "notes"),
  };
}

/**
 * The account owner sees every bid of the client, so they must be an active member of the client's unit.
 * Checked on every save by someone who may set the owner, and whenever the owner or the unit changes.
 */
async function checkAccountOwner(ownerId: number | null | undefined, buId: number) {
  if (ownerId && !(await isActiveMemberOf(ownerId, buId))) throw new FormError("The account owner must be an active member of the client's business unit.");
}

/** The business unit picked on the form; it must be one of the person's own (any for a Super Admin). */
async function pickedUnit(me: SessionUser, fd: FormData) {
  const id = int(fd, "businessUnitId");
  if (!id) throw new FormError("Select the client's business unit.");
  const [bu] = await db
    .select({ id: schema.businessUnits.id })
    .from(schema.businessUnits)
    .where(and(eq(schema.businessUnits.id, id), eq(schema.businessUnits.active, true)));
  if (!bu || (!isSuperAdmin(me) && !me.buIds.includes(id))) throw new FormError("Select one of your business units.");
  return id;
}

export async function saveClient(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: number | null;
  try {
    const me = await requireUser();
    id = int(fd, "id");
    const data = readClient(fd);
    const confirmed = fd.get("confirmDifferent") === "on";

    const requested = str(fd, "status") as (typeof CLIENT_STATUSES)[number] | null;
    if (id) {
      const [before] = await db.select().from(schema.clients).where(eq(schema.clients.id, id));
      if (!before) throw new FormError("Client not found.");
      // Anyone who can see the client fills in its details; the account owner (who sees private contacts) and
      // the business unit (who sees the client) stay with Admins and the owner.
      const full = await canManageClient(me, before);
      if (!full && !(await canSeeClient(me, id))) throw new FormError("You don't have access to this client.");
      if (!full) data.accountOwnerId = before.accountOwnerId;
      // The unit can be changed only by someone who manages the client and is in its current unit (a manager
      // outside the unit can't pull the client into theirs). The client's bids move with it.
      const movable = full && (isSuperAdmin(me) || me.buIds.includes(before.businessUnitId));
      const businessUnitId = movable ? await pickedUnit(me, fd) : before.businessUnitId;
      const moved = businessUnitId !== before.businessUnitId;
      // The name must be free in the client's (new) unit; other units may have their own client of that name
      data.name = await assertClientName(data.name, { buId: businessUnitId, excludeId: id, confirmed, previousName: before.name, moved });
      if (full || moved || data.accountOwnerId !== before.accountOwnerId) await checkAccountOwner(data.accountOwnerId, businessUnitId);
      const status = isAdmin(me) && requested && CLIENT_STATUSES.includes(requested) ? requested : before.status;
      const changed: string[] = (Object.keys(data) as (keyof typeof data)[]).filter((k) => (data[k] ?? null) !== (before[k] ?? null));
      if (moved) changed.push("businessUnitId");
      const clientId = id;
      await db.transaction(async (tx) => {
        await tx.update(schema.clients).set({ ...data, businessUnitId, status }).where(eq(schema.clients.id, clientId));
        if (moved) await tx.update(schema.bids).set({ businessUnitId }).where(eq(schema.bids.clientId, clientId));
      });
      await audit(me.id, "CLIENT_UPDATED", "client", id, {
        name: data.name,
        status,
        changed,
        ...(moved ? { businessUnit: { from: before.businessUnitId, to: businessUnitId } } : {}),
      });
    } else {
      const businessUnitId = await pickedUnit(me, fd);
      data.name = await assertClientName(data.name, { buId: businessUnitId, confirmed });
      await checkAccountOwner(data.accountOwnerId, businessUnitId);
      // Users' new clients wait for Admin review so duplicates don't build up.
      const status = isAdmin(me) ? (requested && CLIENT_STATUSES.includes(requested) ? requested : "ACTIVE") : "PENDING_REVIEW";
      const [c] = await db.insert(schema.clients).values({ ...data, businessUnitId, status, createdById: me.id }).returning();
      id = c.id;
      await audit(me.id, "CLIENT_CREATED", "client", id, { name: data.name, status });
      await systemLogClientAdded(id, me.id, data.name);
      if (status === "PENDING_REVIEW") await notifyClientPending(id, me);
    }
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/clients");
  redirect(`/clients/${id}?msg=saved`);
}

/** Admins of the client's business units, or managers of whoever added or owns it. Remarks go to the activity log. */
export async function approveClient(id: number, fd: FormData) {
  const me = await requireUser();
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, id));
  // Already approved (e.g. Approve clicked twice, or approved by someone else meanwhile): nothing to do.
  if (client && client.status !== "PENDING_REVIEW") redirect(`/clients/${id}?msg=${client.status === "ACTIVE" ? "approved" : "denied"}`);
  if (!client || !(await canApproveClient(me, client))) redirect(`/clients/${id}?msg=denied`);
  const asAdmin = isAdmin(me) && (await canManageClient(me, { id, accountOwnerId: null }));
  await db.update(schema.clients).set({ status: "ACTIVE" }).where(eq(schema.clients.id, id));
  const remarks = str(fd, "remarks")?.slice(0, 1000) ?? null;
  await audit(me.id, "CLIENT_APPROVED", "client", id, { as: asAdmin ? "Admin" : "Manager", remarks });
  await notifyClientDecision(client, me, { approved: true, remarks });
  revalidatePath("/clients");
  redirect(`/clients/${id}?msg=approved`);
}

/** Moves contacts from a duplicate (pending) client into the target, then removes the duplicate. */
export async function mergeClient(id: number, fd: FormData) {
  const admin = await requireAdmin();
  const targetId = int(fd, "targetId");
  if (!targetId || targetId === id) redirect(`/clients/${id}?msg=mergefail`);
  const [from] = await db.select().from(schema.clients).where(eq(schema.clients.id, id));
  const [to] = await db.select().from(schema.clients).where(eq(schema.clients.id, targetId));
  if (!from || !to) redirect(`/clients/${id}?msg=mergefail`);
  if (!(await canManageClient(admin, { id, accountOwnerId: null })) || !(await canManageClient(admin, { id: targetId, accountOwnerId: null })))
    redirect(`/clients/${id}?msg=denied`);
  // The merged client keeps its own business unit. A duplicate that already has bids or meetings isn't merged:
  // bids would change unit (and audience) without anyone reviewing them, and deleting it would fail anyway.
  const [hasBid] = await db.select({ id: schema.bids.id }).from(schema.bids).where(or(eq(schema.bids.clientId, id), eq(schema.bids.endClientId, id))).limit(1);
  const [hasMeeting] = await db.select({ id: schema.meetings.id }).from(schema.meetings).where(eq(schema.meetings.clientId, id)).limit(1);
  if (hasBid || hasMeeting) redirect(`/clients/${id}?msg=mergehas`);
  await db.update(schema.clientContacts).set({ clientId: targetId, isPrimary: false }).where(eq(schema.clientContacts.clientId, id));
  await db.delete(schema.clients).where(eq(schema.clients.id, id));
  await audit(admin.id, "CLIENT_MERGED", "client", targetId, { mergedFrom: id, mergedName: from.name });
  if (from.status === "PENDING_REVIEW") await notifyClientDecision(from, admin, { approved: false, mergedInto: { id: to.id, name: to.name } });
  revalidatePath("/clients");
  redirect(`/clients/${targetId}?msg=merged`);
}

export async function addContact(clientId: number, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const me = await requireUser();
    if (!(await canSeeClient(me, clientId))) throw new FormError("You don't have access to this client.");
    const email = str(fd, "email");
    if (email && !isEmail(email)) throw new FormError("Enter a valid email.");
    const isPrimary = fd.get("isPrimary") === "on";
    if (isPrimary) await db.update(schema.clientContacts).set({ isPrimary: false }).where(eq(schema.clientContacts.clientId, clientId));
    const sharing = await readSharing(fd, clientId, me.id);
    const [c] = await db
      .insert(schema.clientContacts)
      .values({ clientId, name: req(fd, "name", "Contact name"), designation: str(fd, "designation"), email, phone: str(fd, "phone"), isPrimary, ownerId: me.id, shared: sharing.shared })
      .returning();
    await saveShares(c.id, sharing.userIds, me, clientId, c.name);
    await audit(me.id, "CONTACT_ADDED", "client", clientId, { contactId: c.id, name: c.name, visibility: sharing.visibility, users: sharing.userIds });
    revalidatePath(`/clients/${clientId}`);
    return { ok: `Added ${c.name}.` };
  } catch (e) {
    return toFormError(e);
  }
}

export async function setPrimaryContact(clientId: number, contactId: number) {
  const me = await requireUser();
  if (!(await canSeeClient(me, clientId))) redirect(`/clients?msg=denied`);
  const [contact] = await db
    .select({ id: schema.clientContacts.id })
    .from(schema.clientContacts)
    .where(and(eq(schema.clientContacts.id, contactId), eq(schema.clientContacts.clientId, clientId)));
  if (!contact) redirect(`/clients/${clientId}?msg=denied`);
  await db.update(schema.clientContacts).set({ isPrimary: false }).where(eq(schema.clientContacts.clientId, clientId));
  await db.update(schema.clientContacts).set({ isPrimary: true }).where(eq(schema.clientContacts.id, contactId));
  await audit(me.id, "CONTACT_PRIMARY_SET", "client", clientId, { contactId });
  revalidatePath(`/clients/${clientId}`);
}

async function loadContact(me: SessionUser, clientId: number, contactId: number) {
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, clientId));
  const [contact] = await db
    .select()
    .from(schema.clientContacts)
    .where(and(eq(schema.clientContacts.id, contactId), eq(schema.clientContacts.clientId, clientId)));
  if (!client || !contact || !(await canManageContact(me, contact, client))) redirect(`/clients/${clientId}?msg=denied`);
  return contact;
}

type Visibility = "private" | "selected" | "everyone";

/**
 * The sharing picked on a contact form: private, selected people (only people who can see the client; the person
 * adding it doesn't need listing) or everyone who can see the client.
 */
async function readSharing(fd: FormData, clientId: number, ownerId: number | null) {
  const v = str(fd, "visibility");
  const visibility: Visibility = v === "selected" || v === "everyone" ? v : "private";
  if (visibility !== "selected") return { visibility, shared: visibility === "everyone", userIds: [] as number[] };
  const eligible = new Set((await usersWhoCanSeeClient(clientId)).map((u) => u.id));
  const userIds = [...new Set(ints(fd, "shareUserIds"))].filter((id) => id !== ownerId && eligible.has(id));
  if (!userIds.length) throw new FormError("Tick at least one person to share with, or choose Private.");
  return { visibility, shared: false, userIds };
}

/** Replaces who a contact is shared with, and tells the people newly added. */
async function saveShares(contactId: number, userIds: number[], me: SessionUser, clientId: number, contactName: string) {
  const before = (await db.select({ id: schema.contactShares.userId }).from(schema.contactShares).where(eq(schema.contactShares.contactId, contactId))).map((r) => r.id);
  const removed = before.filter((id) => !userIds.includes(id));
  if (removed.length) await db.delete(schema.contactShares).where(and(eq(schema.contactShares.contactId, contactId), inArray(schema.contactShares.userId, removed)));
  const added = userIds.filter((id) => !before.includes(id));
  if (added.length) {
    await db.insert(schema.contactShares).values(added.map((userId) => ({ contactId, userId })));
    const [client] = await db.select({ name: schema.clients.name }).from(schema.clients).where(eq(schema.clients.id, clientId));
    await notify(added, { kind: "CONTACT_SHARED", title: `${me.name} shared a contact with you: ${contactName} (${client?.name ?? "client"})`, href: `/clients/${clientId}`, actorId: me.id });
  }
}

/** Changes a contact's sharing: private, selected people, or everyone who can see the client. */
export async function setContactSharing(clientId: number, contactId: number, fd: FormData) {
  const me = await requireUser();
  const contact = await loadContact(me, clientId, contactId);
  let sharing: Awaited<ReturnType<typeof readSharing>>;
  try {
    sharing = await readSharing(fd, clientId, contact.ownerId);
  } catch {
    redirect(`/clients/${clientId}?msg=sharefail`);
  }
  await db.update(schema.clientContacts).set({ shared: sharing.shared }).where(eq(schema.clientContacts.id, contactId));
  await saveShares(contactId, sharing.userIds, me, clientId, contact.name);
  await audit(me.id, "CONTACT_SHARING_CHANGED", "client", clientId, { contactId, visibility: sharing.visibility, users: sharing.userIds });
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteContact(clientId: number, contactId: number) {
  const me = await requireUser();
  await loadContact(me, clientId, contactId);
  // Only flagged: a Super Admin can still see and restore it (e.g. when someone deletes contacts before leaving)
  await db
    .update(schema.clientContacts)
    .set({ deletedAt: new Date(), deletedById: me.id, isPrimary: false })
    .where(and(eq(schema.clientContacts.id, contactId), eq(schema.clientContacts.clientId, clientId)));
  await audit(me.id, "CONTACT_DELETED", "client", clientId, { contactId });
  revalidatePath(`/clients/${clientId}`);
}

/** Super Admin: bring back a deleted contact, as it was (private or shared). */
export async function restoreContact(clientId: number, contactId: number) {
  const me = await requireSuperAdmin();
  await db
    .update(schema.clientContacts)
    .set({ deletedAt: null, deletedById: null })
    .where(and(eq(schema.clientContacts.id, contactId), eq(schema.clientContacts.clientId, clientId)));
  await audit(me.id, "CONTACT_RESTORED", "client", clientId, { contactId });
  revalidatePath(`/clients/${clientId}`);
}

/** Inline BD stage change from the client status board (anyone who can see the client, like the edit form). */
export async function updateBdStage(clientId: number, fd: FormData) {
  const me = await requireUser();
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, clientId));
  if (!client || !(await canSeeClient(me, clientId))) return;
  const v = str(fd, "bdStage") as (typeof BD_STAGES)[number] | null;
  const bdStage = v && BD_STAGES.includes(v) ? v : null;
  await db.update(schema.clients).set({ bdStage }).where(eq(schema.clients.id, clientId));
  await audit(me.id, "CLIENT_STAGE_CHANGED", "client", clientId, { from: client.bdStage, to: bdStage });
  revalidatePath("/reports/client-status");
}

/**
 * Live name check for the client forms: same and similar names within the chosen business unit. Only for a
 * unit the person belongs to (any for a Super Admin), so it can't be used to list other units' clients.
 */
export async function checkClientName(name: string, buId: number | null, excludeId?: number | null): Promise<ClientNameMatches> {
  const me = await requireUser();
  if (!buId || (!isSuperAdmin(me) && !me.buIds.includes(buId))) return { exact: null, similar: [] };
  return clientNameMatches(name, buId, excludeId);
}
