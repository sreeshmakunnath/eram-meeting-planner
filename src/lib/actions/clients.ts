"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { canManageClient, canManageContact, canSeeClient, mergeBuIds } from "@/lib/access";
import { isAdmin, requireAdmin, requireUser, type SessionUser } from "@/lib/auth";
import { FormError, int, ints, isEmail, req, str, toFormError } from "@/lib/form";
import { assertClientName, clientNameMatches, type ClientNameMatches } from "@/lib/client-names";
import { BD_STAGES, CLIENT_STATUSES, CLIENT_TYPES } from "@/lib/queries";

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

async function clientBuIds(clientId: number) {
  const rows = await db.select().from(schema.clientBusinessUnits).where(eq(schema.clientBusinessUnits.clientId, clientId));
  return rows.map((r) => r.businessUnitId);
}

async function setBusinessUnits(clientId: number, ids: number[]) {
  await db.delete(schema.clientBusinessUnits).where(eq(schema.clientBusinessUnits.clientId, clientId));
  if (ids.length) await db.insert(schema.clientBusinessUnits).values(ids.map((businessUnitId) => ({ clientId, businessUnitId })));
}

export async function saveClient(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: number | null;
  try {
    const me = await requireUser();
    id = int(fd, "id");
    const data = readClient(fd);
    const [previous] = id ? await db.select({ name: schema.clients.name }).from(schema.clients).where(eq(schema.clients.id, id)) : [];
    data.name = await assertClientName(data.name, { excludeId: id, confirmed: fd.get("confirmDifferent") === "on", previousName: previous?.name });

    const requested = str(fd, "status") as (typeof CLIENT_STATUSES)[number] | null;
    const bus = mergeBuIds(me, ints(fd, "businessUnitIds"), id ? await clientBuIds(id) : [], "client");
    if (bus.error) throw new FormError(bus.error);
    if (id) {
      const [before] = await db.select().from(schema.clients).where(eq(schema.clients.id, id));
      if (!before) throw new FormError("Client not found.");
      if (!(await canManageClient(me, before))) throw new FormError("Only an Admin of this client's business units or the account owner can edit this client.");
      const status = isAdmin(me) && requested && CLIENT_STATUSES.includes(requested) ? requested : before.status;
      await db.update(schema.clients).set({ ...data, status }).where(eq(schema.clients.id, id));
      await audit(me.id, "CLIENT_UPDATED", "client", id, { name: data.name, status });
    } else {
      // Users' new clients wait for Admin review so duplicates don't build up.
      const status = isAdmin(me) ? (requested && CLIENT_STATUSES.includes(requested) ? requested : "ACTIVE") : "PENDING_REVIEW";
      const [c] = await db.insert(schema.clients).values({ ...data, status, createdById: me.id }).returning();
      id = c.id;
      await audit(me.id, "CLIENT_CREATED", "client", id, { name: data.name, status });
    }
    await setBusinessUnits(id, bus.ids);
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/clients");
  redirect(`/clients/${id}?msg=saved`);
}

export async function approveClient(id: number) {
  const admin = await requireAdmin();
  if (!(await canManageClient(admin, { id, accountOwnerId: null }))) redirect(`/clients/${id}?msg=denied`);
  await db.update(schema.clients).set({ status: "ACTIVE" }).where(eq(schema.clients.id, id));
  await audit(admin.id, "CLIENT_APPROVED", "client", id);
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
  // The merged client keeps the business units of both.
  await setBusinessUnits(targetId, [...new Set([...(await clientBuIds(targetId)), ...(await clientBuIds(id))])]);
  await db.update(schema.clientContacts).set({ clientId: targetId, isPrimary: false }).where(eq(schema.clientContacts.clientId, id));
  await db.delete(schema.clients).where(eq(schema.clients.id, id));
  await audit(admin.id, "CLIENT_MERGED", "client", targetId, { mergedFrom: id, mergedName: from.name });
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
    const [c] = await db
      .insert(schema.clientContacts)
      .values({ clientId, name: req(fd, "name", "Contact name"), designation: str(fd, "designation"), email, phone: str(fd, "phone"), isPrimary, ownerId: me.id, shared: fd.get("shared") === "on" })
      .returning();
    await audit(me.id, "CONTACT_ADDED", "client", clientId, { contactId: c.id, name: c.name, shared: c.shared });
    revalidatePath(`/clients/${clientId}`);
    return { ok: `Added ${c.name}.` };
  } catch (e) {
    return toFormError(e);
  }
}

export async function setPrimaryContact(clientId: number, contactId: number) {
  const me = await requireUser();
  if (!(await canSeeClient(me, clientId))) redirect(`/clients?msg=denied`);
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

/** Private ⇄ shared with everyone who can see the client. */
export async function setContactShared(clientId: number, contactId: number, shared: boolean) {
  const me = await requireUser();
  await loadContact(me, clientId, contactId);
  await db.update(schema.clientContacts).set({ shared }).where(eq(schema.clientContacts.id, contactId));
  await audit(me.id, shared ? "CONTACT_SHARED" : "CONTACT_MADE_PRIVATE", "client", clientId, { contactId });
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteContact(clientId: number, contactId: number) {
  const me = await requireUser();
  await loadContact(me, clientId, contactId);
  await db.delete(schema.clientContacts).where(and(eq(schema.clientContacts.id, contactId), eq(schema.clientContacts.clientId, clientId)));
  await audit(me.id, "CONTACT_DELETED", "client", clientId, { contactId });
  revalidatePath(`/clients/${clientId}`);
}

/** Inline BD stage change from the client status board (Admin or account owner). */
export async function updateBdStage(clientId: number, fd: FormData) {
  const me = await requireUser();
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, clientId));
  if (!client || !(await canManageClient(me, client))) return;
  const v = str(fd, "bdStage") as (typeof BD_STAGES)[number] | null;
  const bdStage = v && BD_STAGES.includes(v) ? v : null;
  await db.update(schema.clients).set({ bdStage }).where(eq(schema.clients.id, clientId));
  await audit(me.id, "CLIENT_STAGE_CHANGED", "client", clientId, { from: client.bdStage, to: bdStage });
  revalidatePath("/reports/client-status");
}

/** Live name check for the client forms: same name (any case) and similar names. */
export async function checkClientName(name: string, excludeId?: number | null): Promise<ClientNameMatches> {
  await requireUser();
  return clientNameMatches(name, excludeId);
}
