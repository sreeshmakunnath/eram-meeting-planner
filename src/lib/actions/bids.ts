"use server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { canControlBid, canEditBid, canManageUser, canSeeBid, canSeeClient, isActiveMemberOf } from "@/lib/access";
import { isSuperAdmin, requireAdmin, requireUser, type SessionUser } from "@/lib/auth";
import {
  BID_STAGE_LABEL,
  BID_STAGES,
  BID_TYPES,
  isOpenStage,
  NEEDS_REASON,
  OPEN_BID_STAGES,
  PROBABILITY_BANDS,
  SUBMISSION_MODES,
  TENDER_CATEGORIES,
  type BidStage,
  type ProbabilityBand,
} from "@/lib/bids";
import { FormError, int, req, str, toFormError } from "@/lib/form";
import { notify } from "@/lib/notifications";
import { resolveBidProject } from "@/lib/projects";

type BidInsert = typeof schema.bids.$inferInsert;
/** Stages that need the submission date and bid value. */
const SUBMITTED_ON: BidStage[] = ["SUBMITTED", "UNDER_EVALUATION", "NEGOTIATION", "WON"];

const day = (fd: FormData, key: string) => {
  const s = str(fd, key);
  if (s && !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new FormError("Dates should be picked from the calendar.");
  return s;
};
const oneOf = <T extends string>(list: readonly T[], v: string | null, label: string, required = false): T | null => {
  if (!v) {
    if (required) throw new FormError(`${label} is required.`);
    return null;
  }
  if (!list.includes(v as T)) throw new FormError(`Choose a valid ${label.toLowerCase()}.`);
  return v as T;
};
const num = (fd: FormData, key: string, label: string, { int: whole = false, max }: { int?: boolean; max?: number } = {}) => {
  const s = str(fd, key)?.replace(/[,\s$]/g, "");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || (whole && !Number.isInteger(n)) || (max != null && n > max))
    throw new FormError(`${label} should be ${whole ? "a whole number" : "a number"}${max != null ? ` up to ${max}` : ""}.`);
  return n;
};

/**
 * A bid is in its client's business unit, which must be one of the person's own (any for a Super Admin).
 * The unit sent by the form is only checked against it.
 */
async function checkUnit(me: SessionUser, buId: number | null, clientId: number) {
  const [client] = await db.select({ buId: schema.clients.businessUnitId }).from(schema.clients).where(eq(schema.clients.id, clientId));
  if (!client) throw new FormError("Client not found.");
  if (buId && buId !== client.buId) throw new FormError("A bid is in its client's business unit.");
  if (!isSuperAdmin(me) && !me.buIds.includes(client.buId)) throw new FormError("You can only add bids for clients of your own business units.");
  return client.buId;
}

async function checkClient(me: SessionUser, clientId: number | null, label = "Client") {
  if (!clientId) return null;
  if (!(await canSeeClient(me, clientId))) throw new FormError(`You don't have access to that ${label.toLowerCase()}.`);
  return clientId;
}

/** The contact must belong to the bid's client. */
async function checkContact(contactId: number | null, clientId: number) {
  if (!contactId) return null;
  const [c] = await db
    .select({ id: schema.clientContacts.id })
    .from(schema.clientContacts)
    .where(and(eq(schema.clientContacts.id, contactId), eq(schema.clientContacts.clientId, clientId)));
  return c ? contactId : null;
}

function checkDates(d: Partial<BidInsert>) {
  if (d.issueDate && d.closingDate && d.closingDate < d.issueDate) throw new FormError("Closing date can't be before the issue date.");
  if (d.closingDate && d.expectedAwardDate && d.expectedAwardDate < d.closingDate) throw new FormError("Expected award date should be on or after the closing date.");
}

/** Every bid has an owner, who must belong to the bid's business unit (or they couldn't see the bid). */
async function checkOwner(ownerId: number | null, buId: number) {
  if (!ownerId) throw new FormError("Owner is required.");
  const [m] = await db
    .select({ id: schema.userBusinessUnits.userId })
    .from(schema.userBusinessUnits)
    .innerJoin(schema.users, eq(schema.users.id, schema.userBusinessUnits.userId))
    .where(and(eq(schema.userBusinessUnits.userId, ownerId), eq(schema.userBusinessUnits.businessUnitId, buId), eq(schema.users.status, "ACTIVE")));
  if (!m) throw new FormError("The owner must be an active member of the bid's business unit.");
  return ownerId;
}

async function tellOwner(me: SessionUser, ownerId: number | null | undefined, bidId: number, title: string) {
  if (!ownerId) return;
  await notify([ownerId], { kind: "BID_ASSIGNED", title: `Bid: ${title}`, body: `${me.name} made you the owner of this bid.`, href: `/bids/${bidId}`, actorId: me.id });
}

/** For edits: the owner side or the bid team. */
async function loadForEdit(me: SessionUser, id: number) {
  const [bid] = await db.select().from(schema.bids).where(eq(schema.bids.id, id));
  if (!bid) throw new FormError("Bid not found.");
  if (!(await canEditBid(me, bid))) throw new FormError("Only the bid owner, the bid team, the owner's managers and the unit's Admins can change this bid.");
  return bid;
}

/** For transfer, delete and the team: the owner side only (not team members). */
async function loadForControl(me: SessionUser, id: number) {
  const [bid] = await db.select().from(schema.bids).where(eq(schema.bids.id, id));
  if (!bid) throw new FormError("Bid not found.");
  if (!(await canControlBid(me, bid))) throw new FormError("Only the bid owner, the owner's managers and the unit's Admins can do that.");
  return bid;
}

const changedKeys = (before: Record<string, unknown>, after: Record<string, unknown>) =>
  Object.keys(after).filter((k) => (after[k] ?? null) !== (before[k] ?? null));

export async function createBid(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: number;
  try {
    const me = await requireUser();
    const clientId = await checkClient(me, int(fd, "clientId"));
    if (!clientId) throw new FormError("Client is required.");
    const data: BidInsert = {
      businessUnitId: await checkUnit(me, int(fd, "businessUnitId"), clientId),
      ownerId: int(fd, "ownerId"),
      clientId,
      title: req(fd, "title", "Title"),
      bidType: oneOf(BID_TYPES, str(fd, "bidType"), "Bid type", true)!,
      issueDate: day(fd, "issueDate") ?? (() => { throw new FormError("Issue date is required."); })(),
      closingDate: day(fd, "closingDate") ?? (() => { throw new FormError("Closing date is required."); })(),
      quotationRef: str(fd, "quotationRef"),
      clientTenderNo: str(fd, "clientTenderNo"),
      sector: str(fd, "sector"),
      bidValue: num(fd, "bidValue", "Bid value"),
      probabilityBand: oneOf(PROBABILITY_BANDS, str(fd, "probabilityBand"), "Probability"),
      createdById: me.id,
    };
    data.ownerId = await checkOwner(data.ownerId ?? null, data.businessUnitId);
    checkDates(data);
    data.projectId = await resolveBidProject(me, clientId, fd);
    const [bid] = await db.insert(schema.bids).values(data).returning({ id: schema.bids.id });
    id = bid.id;
    await audit(me.id, "BID_CREATED", "bid", id, { title: data.title, clientId, stage: "ENQUIRY" });
    if (data.ownerId !== me.id) await tellOwner(me, data.ownerId, id, data.title);
    revalidatePath("/bids");
    // Created for someone else: the creator only keeps access through another rule (manager, Admin…)
    if (!(await canSeeBid(me, id))) redirect("/bids?msg=handedover");
  } catch (e) {
    return toFormError(e);
  }
  redirect(`/bids/${id}`);
}

export async function saveBidOverview(id: number, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const me = await requireUser();
    const before = await loadForEdit(me, id);
    // Team members fill in the details; the client, owner and project stay with the owner side
    const control = await canControlBid(me, before);
    const clientId = control ? ((await checkClient(me, int(fd, "clientId"))) ?? before.clientId) : before.clientId;
    const data: Partial<BidInsert> = {
      businessUnitId: control ? await checkUnit(me, int(fd, "businessUnitId"), clientId) : before.businessUnitId,
      ownerId: control ? int(fd, "ownerId") : before.ownerId,
      title: req(fd, "title", "Title"),
      clientId,
      endClientId: await checkClient(me, int(fd, "endClientId"), "End client"),
      contactId: await checkContact(int(fd, "contactId"), clientId),
      quotationRef: str(fd, "quotationRef"),
      clientTenderNo: str(fd, "clientTenderNo"),
      clientRefNo: str(fd, "clientRefNo"),
      scope: str(fd, "scope"),
      sector: str(fd, "sector"),
      tenderCategory: oneOf(TENDER_CATEGORIES, str(fd, "tenderCategory"), "Tender category"),
      bidType: oneOf(BID_TYPES, str(fd, "bidType"), "Bid type", true)!,
      submissionMode: oneOf(SUBMISSION_MODES, str(fd, "submissionMode"), "Submission mode"),
      country: str(fd, "country"),
      location: str(fd, "location"),
      site: str(fd, "site"),
      issueDate: day(fd, "issueDate") ?? before.issueDate,
      acknowledgedDate: day(fd, "acknowledgedDate"),
      tenderPurchasedDate: day(fd, "tenderPurchasedDate"),
      reviewDeadline: day(fd, "reviewDeadline"),
      clarificationDeadline: day(fd, "clarificationDeadline"),
      closingDate: day(fd, "closingDate") ?? before.closingDate,
      expectedAwardDate: day(fd, "expectedAwardDate"),
      expectedStartDate: day(fd, "expectedStartDate"),
      notes: str(fd, "notes"),
    };
    // The owner must be in the bid's unit (the picker lists only its members)
    data.ownerId = await checkOwner(data.ownerId ?? null, data.businessUnitId!);
    checkDates(data);
    data.projectId = control ? await resolveBidProject(me, clientId, fd) : before.projectId;
    const changed = changedKeys(before, data);
    if (!changed.length) return { ok: "No changes." };
    await db.update(schema.bids).set(data).where(eq(schema.bids.id, id));
    const handover = data.ownerId !== before.ownerId ? { owner: { from: before.ownerId, to: data.ownerId } } : {};
    if (data.ownerId !== before.ownerId) {
      // The new owner no longer needs a team place; the old one stays on the team only when asked
      if (data.ownerId) await db.delete(schema.bidTeam).where(and(eq(schema.bidTeam.bidId, id), eq(schema.bidTeam.userId, data.ownerId)));
      if (before.ownerId && fd.get("keepPreviousOwner") === "on" && (await isActiveMemberOf(before.ownerId, data.businessUnitId!)))
        await db.insert(schema.bidTeam).values({ bidId: id, userId: before.ownerId, addedById: me.id }).onConflictDoNothing();
    }
    await audit(me.id, "BID_UPDATED", "bid", id, { title: data.title, changed, ...handover });
    if (data.ownerId && data.ownerId !== before.ownerId) await tellOwner(me, data.ownerId, id, data.title!);
    revalidatePath(`/bids/${id}`);
    revalidatePath("/bids");
    // Handed to someone else and no other rule gives access: leave the bid
    if (!(await canSeeBid(me, id))) redirect("/bids?msg=handedover");
    return { ok: "Saved." };
  } catch (e) {
    return toFormError(e);
  }
}

/** Quoted items from the Commercial form (parallel item* fields). Lines with no description are skipped. */
function readItems(fd: FormData) {
  const col = (k: string) => fd.getAll(k).map((v) => (typeof v === "string" ? v.trim() : ""));
  const [desc, unit, qty, price] = [col("itemDescription"), col("itemUnit"), col("itemQuantity"), col("itemUnitPrice")];
  const amount = (s: string | undefined, label: string, line: number) => {
    const t = s?.replace(/[,\s$]/g, "");
    if (!t) return null;
    const v = Number(t);
    if (!Number.isFinite(v) || v < 0) throw new FormError(`Quoted item ${line}: ${label} should be a number.`);
    return v;
  };
  const items = [];
  for (let i = 0; i < desc.length; i++) {
    if (!desc[i]) {
      if (qty[i] || price[i]) throw new FormError(`Quoted item ${i + 1} needs a description.`);
      continue;
    }
    items.push({ description: desc[i].slice(0, 300), unit: unit[i] ? unit[i].slice(0, 50) : null, quantity: amount(qty[i], "quantity", i + 1), unitPrice: amount(price[i], "unit price", i + 1) });
  }
  if (items.length > 100) throw new FormError("Up to 100 quoted items.");
  return items;
}

export async function saveBidCommercial(id: number, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const me = await requireUser();
    const before = await loadForEdit(me, id);
    const data: Partial<BidInsert> = {
      bidValue: num(fd, "bidValue", "Bid value"),
      manpowerEstimate: num(fd, "manpowerEstimate", "Manpower", { int: true }),
      durationMonths: num(fd, "durationMonths", "Duration", { int: true }),
      optionMonths: num(fd, "optionMonths", "Option months", { int: true }),
      monthlyBilling: num(fd, "monthlyBilling", "Monthly billing"),
      profitPerHead: num(fd, "profitPerHead", "Profit per head"),
      retentionPct: num(fd, "retentionPct", "Retention %", { max: 100 }),
      advancePayment: str(fd, "advancePayment"),
      paymentTerms: str(fd, "paymentTerms"),
      invoicingSchedule: str(fd, "invoicingSchedule"),
      insuranceTerms: str(fd, "insuranceTerms"),
      penaltyTerms: str(fd, "penaltyTerms"),
      risks: str(fd, "risks"),
    };
    // A bid that has been submitted keeps its value
    if (!data.bidValue && SUBMITTED_ON.includes(before.stage)) throw new FormError("A submitted bid needs its bid value.");
    const items = readItems(fd);
    const oldItems = await db
      .select({ description: schema.bidItems.description, unit: schema.bidItems.unit, quantity: schema.bidItems.quantity, unitPrice: schema.bidItems.unitPrice })
      .from(schema.bidItems)
      .where(eq(schema.bidItems.bidId, id))
      .orderBy(schema.bidItems.position);
    const changed = changedKeys(before, data);
    if (JSON.stringify(oldItems) !== JSON.stringify(items)) changed.push("quotedItems");
    if (!changed.length) return { ok: "No changes." };
    await db.transaction(async (tx) => {
      await tx.update(schema.bids).set(data).where(eq(schema.bids.id, id));
      if (changed.includes("quotedItems")) {
        await tx.delete(schema.bidItems).where(eq(schema.bidItems.bidId, id));
        if (items.length) await tx.insert(schema.bidItems).values(items.map((it, position) => ({ ...it, bidId: id, position })));
      }
    });
    await audit(me.id, "BID_UPDATED", "bid", id, { title: before.title, changed });
    revalidatePath(`/bids/${id}`);
    revalidatePath("/bids");
    return { ok: "Saved." };
  } catch (e) {
    return toFormError(e);
  }
}

/**
 * Stage and probability. Submitted (and every later open stage, and Won) needs the submission date and bid
 * value; Lost, Cancelled and Declined need a reason. Won sets the probability to 100%.
 */
export async function changeBidStage(id: number, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const me = await requireUser();
    const before = await loadForEdit(me, id);
    const stage = oneOf(BID_STAGES, str(fd, "stage"), "Stage", true)! as BidStage;
    let band = oneOf(PROBABILITY_BANDS, str(fd, "probabilityBand"), "Probability") as ProbabilityBand | null;
    const submittedDate = day(fd, "submittedDate") ?? before.submittedDate;
    const reason = str(fd, "closedReason");
    const afterSubmit = SUBMITTED_ON.includes(stage);
    if (afterSubmit && !submittedDate) throw new FormError(`${BID_STAGE_LABEL[stage]} needs the submission date.`);
    if (afterSubmit && !before.bidValue) throw new FormError(`${BID_STAGE_LABEL[stage]} needs the bid value. Fill it in on the Commercial tab first.`);
    if (submittedDate && submittedDate < before.issueDate) throw new FormError("Submission date can't be before the issue date.");
    if (NEEDS_REASON.includes(stage) && !reason) throw new FormError(`Give a reason for "${BID_STAGE_LABEL[stage]}".`);
    if (stage === "WON") band = "P100";
    const closed = !isOpenStage(stage);
    const data: Partial<BidInsert> = {
      stage,
      probabilityBand: band,
      submittedDate,
      closedReason: NEEDS_REASON.includes(stage) ? reason : null,
      closedAt: closed ? (isOpenStage(before.stage) ? new Date() : before.closedAt) : null,
      // Remember the band the owner had when the bid was decided (Won overwrites it with 100%)
      decisionBand: stage === "WON" || stage === "LOST" ? (isOpenStage(before.stage) ? before.probabilityBand : before.decisionBand) : null,
    };
    await db.update(schema.bids).set(data).where(eq(schema.bids.id, id));
    if (stage !== before.stage)
      await audit(me.id, "BID_STAGE", "bid", id, { title: before.title, from: BID_STAGE_LABEL[before.stage], to: BID_STAGE_LABEL[stage], ...(reason ? { reason } : {}) });
    else if (band !== before.probabilityBand || submittedDate !== before.submittedDate || reason !== before.closedReason)
      await audit(me.id, "BID_UPDATED", "bid", id, { title: before.title, changed: changedKeys(before, data) });
    revalidatePath(`/bids/${id}`);
    revalidatePath("/bids");
    return { ok: stage !== before.stage ? `Moved to ${BID_STAGE_LABEL[stage]}.` : "Saved." };
  } catch (e) {
    return toFormError(e);
  }
}

export async function deleteBid(id: number) {
  const me = await requireUser();
  let ok = false;
  try {
    const bid = await loadForControl(me, id);
    await db.delete(schema.bids).where(eq(schema.bids.id, id));
    await audit(me.id, "BID_DELETED", "bid", id, { title: bid.title, stage: bid.stage });
    ok = true;
  } catch {}
  revalidatePath("/bids");
  redirect(ok ? "/bids?msg=deleted" : `/bids/${id}?msg=denied`);
}

const isLink = (s: string) => /^https?:\/\/\S+$/i.test(s);

/** Adds a document (name + SharePoint link). Same people as editing the bid. */
export async function addBidDocument(id: number, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const me = await requireUser();
    const bid = await loadForEdit(me, id);
    const name = req(fd, "name", "Document name").slice(0, 200);
    const url = req(fd, "url", "Link");
    if (!isLink(url) || url.length > 1000) throw new FormError("Paste the SharePoint link (starting with https://).");
    await db.insert(schema.bidDocuments).values({ bidId: id, name, url, addedById: me.id });
    await audit(me.id, "BID_DOC_ADDED", "bid", id, { title: bid.title, document: name });
    revalidatePath(`/bids/${id}`);
    return { ok: `Added ${name}.` };
  } catch (e) {
    return toFormError(e);
  }
}

export async function removeBidDocument(id: number, docId: number) {
  const me = await requireUser();
  let ok = false;
  try {
    const bid = await loadForEdit(me, id);
    const [doc] = await db
      .delete(schema.bidDocuments)
      .where(and(eq(schema.bidDocuments.id, docId), eq(schema.bidDocuments.bidId, id)))
      .returning();
    if (doc) await audit(me.id, "BID_DOC_REMOVED", "bid", id, { title: bid.title, document: doc.name });
    ok = true;
  } catch {}
  revalidatePath(`/bids/${id}`);
  if (!ok) redirect(`/bids/${id}?tab=documents&msg=denied`);
}

/**
 * Hands every open bid of one person (e.g. someone leaving) to a new owner in one step. For Admins who manage
 * that person; only bids the Admin may edit (their units' bids, all for a Super Admin) are moved. The new owner
 * must be an active member of each bid's unit.
 */
export async function transferOpenBids(fromUserId: number, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const me = await requireAdmin();
    if (!(await canManageUser(me, fromUserId))) throw new FormError("You can't manage this user.");
    const toId = int(fd, "toUserId");
    if (!toId || toId === fromUserId) throw new FormError("Pick the new owner.");
    const b = schema.bids;
    const open = await db
      .select({ id: b.id, title: b.title, businessUnitId: b.businessUnitId, ownerId: b.ownerId })
      .from(b)
      .where(and(eq(b.ownerId, fromUserId), inArray(b.stage, OPEN_BID_STAGES)));
    const mine: typeof open = [];
    for (const bid of open) if (await canControlBid(me, bid)) mine.push(bid);
    if (!mine.length) throw new FormError("No open bids you can transfer.");
    const units = [...new Set(mine.map((x) => x.businessUnitId))];
    const member = await db
      .select({ bu: schema.userBusinessUnits.businessUnitId })
      .from(schema.userBusinessUnits)
      .innerJoin(schema.users, eq(schema.users.id, schema.userBusinessUnits.userId))
      .where(and(eq(schema.userBusinessUnits.userId, toId), inArray(schema.userBusinessUnits.businessUnitId, units), eq(schema.users.status, "ACTIVE")));
    if (member.length < units.length) throw new FormError("The new owner must be an active member of every business unit these bids are in.");
    await db.transaction(async (tx) => {
      await tx.update(b).set({ ownerId: toId }).where(inArray(b.id, mine.map((x) => x.id)));
      await tx.delete(schema.bidTeam).where(and(eq(schema.bidTeam.userId, toId), inArray(schema.bidTeam.bidId, mine.map((x) => x.id))));
    });
    for (const bid of mine) await audit(me.id, "BID_UPDATED", "bid", bid.id, { title: bid.title, changed: ["ownerId"], owner: { from: fromUserId, to: toId } });
    await audit(me.id, "BIDS_TRANSFERRED", "user", fromUserId, { to: toId, bids: mine.length });
    await notify([toId], {
      kind: "BID_ASSIGNED",
      title: mine.length === 1 ? `Bid: ${mine[0].title}` : `${mine.length} bids handed to you`,
      body: `${me.name} made you the owner of ${mine.length === 1 ? "this bid" : `${mine.length} open bids`}.`,
      href: mine.length === 1 ? `/bids/${mine[0].id}` : `/bids?owner=${toId}`,
      actorId: me.id,
    });
    revalidatePath("/bids");
    revalidatePath(`/admin/users/${fromUserId}`);
    return { ok: `${mine.length} open bid${mine.length === 1 ? "" : "s"} transferred.` };
  } catch (e) {
    return toFormError(e);
  }
}

/**
 * Adds someone to the bid team: an active member of the bid's business unit, not the owner. Owner side only.
 * They see and edit the bid; their managers get nothing through them.
 */
export async function addBidTeamMember(id: number, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const me = await requireUser();
    const bid = await loadForControl(me, id);
    const userId = int(fd, "userId");
    if (!userId) throw new FormError("Pick a person.");
    if (userId === bid.ownerId) throw new FormError("That's the bid owner.");
    if (!(await isActiveMemberOf(userId, bid.businessUnitId))) throw new FormError("Team members must be active members of the bid's business unit.");
    const [row] = await db.insert(schema.bidTeam).values({ bidId: id, userId, addedById: me.id }).onConflictDoNothing().returning();
    if (!row) return { ok: "Already on the team." };
    const [u] = await db.select({ name: schema.users.fullName }).from(schema.users).where(eq(schema.users.id, userId));
    await audit(me.id, "BID_TEAM_ADDED", "bid", id, { title: bid.title, member: u?.name, memberId: userId });
    await notify([userId], { kind: "BID_TEAM", title: `Bid: ${bid.title}`, body: `${me.name} added you to the team for this bid.`, href: `/bids/${id}`, actorId: me.id });
    revalidatePath(`/bids/${id}`);
    return { ok: `${u?.name ?? "They"} can now see and edit this bid.` };
  } catch (e) {
    return toFormError(e);
  }
}

export async function removeBidTeamMember(id: number, userId: number) {
  const me = await requireUser();
  let ok = false;
  try {
    const bid = await loadForControl(me, id);
    const [row] = await db.delete(schema.bidTeam).where(and(eq(schema.bidTeam.bidId, id), eq(schema.bidTeam.userId, userId))).returning();
    if (row) {
      const [u] = await db.select({ name: schema.users.fullName }).from(schema.users).where(eq(schema.users.id, userId));
      await audit(me.id, "BID_TEAM_REMOVED", "bid", id, { title: bid.title, member: u?.name, memberId: userId });
    }
    ok = true;
  } catch {}
  revalidatePath(`/bids/${id}`);
  if (!ok) redirect(`/bids/${id}?msg=denied`);
}
