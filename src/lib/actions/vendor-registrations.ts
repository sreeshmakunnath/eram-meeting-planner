"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { canManageClient, canSeeClient, usersWhoCanSeeClient } from "@/lib/access";
import { requireUser, type SessionUser } from "@/lib/auth";
import { FormError, int, str, toFormError } from "@/lib/form";
import { decryptSecret, encryptSecret } from "@/lib/secrets";
import { VENDOR_REG_LABEL, VENDOR_REG_STATUSES, type VendorRegStatus } from "@/lib/vendor-reg";

const isUrl = (s: string) => /^https?:\/\/\S+$/i.test(s);
const dateStr = (fd: FormData, key: string) => {
  const s = str(fd, key);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

/**
 * Who may do what with a client's vendor registrations:
 * - see them (status, portal link, username, documents): anyone who can see the client;
 * - work on one (status, portal details, password, documents): its assignee or whoever manages the client;
 * - create, reassign or delete: whoever manages the client (account owner, its BU Admins, managers, Super Admin).
 */
async function vendorRegAccess(me: SessionUser, client: { id: number; accountOwnerId: number | null }, reg?: { assigneeId: number | null }) {
  const manage = await canManageClient(me, client);
  return { manage, work: manage || (!!reg && reg.assigneeId === me.id) };
}

async function load(me: SessionUser, clientId: number, regId?: number) {
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, clientId));
  if (!client || !(await canSeeClient(me, clientId))) throw new FormError("You don't have access to this client.");
  const [reg] = regId
    ? await db
        .select()
        .from(schema.vendorRegistrations)
        .where(and(eq(schema.vendorRegistrations.id, regId), eq(schema.vendorRegistrations.clientId, clientId)))
    : [];
  if (regId && !reg) throw new FormError("Registration not found.");
  return { client, reg, ...(await vendorRegAccess(me, client, reg)) };
}

/** The assignee must be someone who can open the client, or they couldn't see the work. */
async function checkAssignee(clientId: number, assigneeId: number | null) {
  if (!assigneeId) return;
  const allowed = await usersWhoCanSeeClient(clientId);
  if (!allowed.some((u) => u.id === assigneeId)) throw new FormError("That person can't see this client, so they can't be assigned.");
}

async function tellAssignee(me: SessionUser, clientId: number, clientName: string, assigneeId: number | null, title: string) {
  if (!assigneeId) return;
  await notify([assigneeId], {
    kind: "VENDOR_REG_ASSIGNED",
    title: `Vendor registration: ${clientName}`,
    body: `${me.name} assigned you "${title}".`,
    href: `/clients/${clientId}?tab=vendor`,
    actorId: me.id,
  });
}

export async function createVendorRegistration(clientId: number, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const me = await requireUser();
    const { client, manage } = await load(me, clientId);
    if (!manage) throw new FormError("Only the account owner, Admins and managers can start a vendor registration.");
    const title = str(fd, "title") ?? "Vendor registration";
    const assigneeId = int(fd, "assigneeId");
    await checkAssignee(clientId, assigneeId);
    const [reg] = await db
      .insert(schema.vendorRegistrations)
      .values({ clientId, title, assigneeId, dueDate: dateStr(fd, "dueDate"), notes: str(fd, "notes"), createdById: me.id })
      .returning();
    await audit(me.id, "VENDOR_REG_CREATED", "client", clientId, { registrationId: reg.id, title, assigneeId });
    await tellAssignee(me, clientId, client.name, assigneeId, title);
    revalidatePath(`/clients/${clientId}`);
    return { ok: `Started "${title}".` };
  } catch (e) {
    return toFormError(e);
  }
}

export async function updateVendorRegistration(clientId: number, regId: number, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const me = await requireUser();
    const { client, reg, manage, work } = await load(me, clientId, regId);
    if (!work) throw new FormError("Only the assignee, the account owner, Admins and managers can update this registration.");

    const status = str(fd, "status") as VendorRegStatus | null;
    if (!status || !VENDOR_REG_STATUSES.includes(status)) throw new FormError("Choose a status.");
    const portalUrl = str(fd, "portalUrl");
    if (portalUrl && !isUrl(portalUrl)) throw new FormError("Portal URL should start with http:// or https://");
    const password = typeof fd.get("portalPassword") === "string" ? (fd.get("portalPassword") as string) : "";
    const clearPassword = fd.get("clearPassword") === "on";

    const data: Partial<typeof schema.vendorRegistrations.$inferInsert> = {
      status,
      portalUrl,
      portalUsername: str(fd, "portalUsername"),
      vendorCode: str(fd, "vendorCode"),
      notes: str(fd, "notes"),
      completedAt: status === "COMPLETED" ? (reg!.completedAt ?? new Date()) : null,
    };
    // Blank password field = keep the saved one
    if (clearPassword) data.portalPasswordEnc = null;
    else if (password) data.portalPasswordEnc = encryptSecret(password);
    // Assignment, title and due date stay with whoever manages the client
    if (manage) {
      data.title = str(fd, "title") ?? reg!.title;
      data.assigneeId = int(fd, "assigneeId");
      data.dueDate = dateStr(fd, "dueDate");
      await checkAssignee(clientId, data.assigneeId);
    }

    await db.update(schema.vendorRegistrations).set(data).where(eq(schema.vendorRegistrations.id, regId));
    const changed = (["status", "portalUrl", "portalUsername", "vendorCode", "notes", "title", "assigneeId", "dueDate"] as const).filter(
      (k) => k in data && (data[k] ?? null) !== (reg![k] ?? null),
    );
    if (clearPassword || password) changed.push("password" as never);
    await audit(me.id, status !== reg!.status ? "VENDOR_REG_STATUS" : "VENDOR_REG_UPDATED", "client", clientId, {
      registrationId: regId,
      title: data.title ?? reg!.title,
      ...(status !== reg!.status ? { from: VENDOR_REG_LABEL[reg!.status], to: VENDOR_REG_LABEL[status] } : {}),
      changed,
    });
    if (manage && data.assigneeId && data.assigneeId !== reg!.assigneeId) await tellAssignee(me, clientId, client.name, data.assigneeId, data.title ?? reg!.title);
    revalidatePath(`/clients/${clientId}`);
    revalidatePath("/reports/vendor-registrations");
    return { ok: "Saved." };
  } catch (e) {
    return toFormError(e);
  }
}

/** Shows the saved portal password to someone allowed to work on the registration. Every view is audited. */
export async function revealVendorPassword(clientId: number, regId: number): Promise<{ password?: string; error?: string }> {
  try {
    const me = await requireUser();
    const { reg, work } = await load(me, clientId, regId);
    if (!work) return { error: "Only the assignee, the account owner, Admins and managers can see the password." };
    if (!reg!.portalPasswordEnc) return { error: "No password saved." };
    const password = decryptSecret(reg!.portalPasswordEnc);
    await audit(me.id, "VENDOR_REG_PASSWORD_VIEWED", "client", clientId, { registrationId: regId, title: reg!.title });
    return { password };
  } catch (e) {
    if (e instanceof FormError) return { error: e.message };
    console.error(e);
    return { error: "The password couldn't be decrypted. Was CREDENTIALS_KEY changed?" };
  }
}

export async function addVendorDocument(clientId: number, regId: number, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const me = await requireUser();
    const { reg, work } = await load(me, clientId, regId);
    if (!work) throw new FormError("Only the assignee, the account owner, Admins and managers can add documents.");
    const name = str(fd, "name");
    const url = str(fd, "url");
    if (!name) throw new FormError("Document name is required.");
    if (!url || !isUrl(url)) throw new FormError("Paste the SharePoint link (starting with https://).");
    await db.insert(schema.vendorRegDocuments).values({ registrationId: regId, name, url, addedById: me.id });
    await audit(me.id, "VENDOR_REG_DOC_ADDED", "client", clientId, { registrationId: regId, title: reg!.title, document: name });
    revalidatePath(`/clients/${clientId}`);
    return { ok: `Added ${name}.` };
  } catch (e) {
    return toFormError(e);
  }
}

export async function removeVendorDocument(clientId: number, regId: number, docId: number) {
  const me = await requireUser();
  const back = `/clients/${clientId}?tab=vendor`;
  let ok = false;
  try {
    const { reg, work } = await load(me, clientId, regId);
    if (work) {
      const [doc] = await db
        .delete(schema.vendorRegDocuments)
        .where(and(eq(schema.vendorRegDocuments.id, docId), eq(schema.vendorRegDocuments.registrationId, regId)))
        .returning();
      if (doc) await audit(me.id, "VENDOR_REG_DOC_REMOVED", "client", clientId, { registrationId: regId, title: reg!.title, document: doc.name });
      ok = true;
    }
  } catch {}
  revalidatePath(`/clients/${clientId}`);
  if (!ok) redirect(`${back}&msg=denied`);
}

export async function deleteVendorRegistration(clientId: number, regId: number) {
  const me = await requireUser();
  let ok = false;
  try {
    const { reg, manage } = await load(me, clientId, regId);
    if (manage) {
      await db.delete(schema.vendorRegistrations).where(eq(schema.vendorRegistrations.id, regId));
      await audit(me.id, "VENDOR_REG_DELETED", "client", clientId, { registrationId: regId, title: reg!.title, status: reg!.status });
      ok = true;
    }
  } catch {}
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/reports/vendor-registrations");
  redirect(`/clients/${clientId}?tab=vendor${ok ? "" : "&msg=denied"}`);
}
