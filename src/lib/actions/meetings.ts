"use server";
import { and, eq, inArray, like, not, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { canSeeClient, contactVisibleTo, mergeBuIds } from "@/lib/access";
import { isAdmin, isSuperAdmin, requireUser, type SessionUser } from "@/lib/auth";
import { assertClientName } from "@/lib/client-names";
import { notify } from "@/lib/notifications";
import { FormError, int, ints, req, str, toFormError } from "@/lib/form";
import { appUrl, button, esc, sendMail } from "@/lib/mail";
import {
  buildIcs,
  canEditMeeting,
  fmtDay,
  fmtTime,
  logActivity,
  MEETING_STATUSES,
  MEETING_TYPES,
  MODE_LABEL,
  MODES,
  PRIORITIES,
  riyadh,
  STATUS_LABEL,
  TYPE_LABEL,
  type MeetingStatus,
} from "@/lib/meetings";

const DATED: MeetingStatus[] = ["SCHEDULED", "CONFIRMED", "COMPLETED"];
const LIVE: MeetingStatus[] = ["SCHEDULED", "CONFIRMED"]; // statuses that carry a live calendar invite

const pick = <T extends readonly string[]>(list: T, v: string | null, fallback: T[number]): T[number] =>
  v && (list as readonly string[]).includes(v) ? (v as T[number]) : fallback;

/** Expands the selected groups to their members (snapshot) and merges direct attendees. */
async function resolveAttendees(userIds: number[], groupIds: number[]) {
  const map = new Map<number, number | null>(); // userId → viaGroupId
  if (groupIds.length) {
    const members = await db
      .select({ userId: schema.groupMembers.userId, groupId: schema.groupMembers.groupId })
      .from(schema.groupMembers)
      .innerJoin(schema.users, eq(schema.groupMembers.userId, schema.users.id))
      .where(and(inArray(schema.groupMembers.groupId, groupIds), eq(schema.users.status, "ACTIVE")));
    for (const m of members) if (!map.has(m.userId)) map.set(m.userId, m.groupId);
  }
  for (const u of userIds) map.set(u, null); // a direct pick wins over a group link
  return map;
}

type External = { name: string | null; email: string };
const EMAIL_RE = /[^\s@,;<>()"']+@[^\s@,;<>()"']+\.[a-z]{2,}/gi;
const emailKey = (e: External) => e.email.toLowerCase();

/** Client-side attendees who get the invite: ticked contacts that have an email, plus any address typed in "Other client attendees". */
async function externalAttendees(meetingId: number): Promise<External[]> {
  const [m] = await db.select({ text: schema.meetings.clientContactsText }).from(schema.meetings).where(eq(schema.meetings.id, meetingId));
  const contacts = await db
    .select({ name: schema.clientContacts.name, email: schema.clientContacts.email })
    .from(schema.meetingContacts)
    .innerJoin(schema.clientContacts, eq(schema.meetingContacts.contactId, schema.clientContacts.id))
    .where(eq(schema.meetingContacts.meetingId, meetingId));
  const map = new Map<string, External>();
  for (const c of contacts) if (c.email?.trim()) map.set(c.email.trim().toLowerCase(), { name: c.name, email: c.email.trim() });
  for (const email of m?.text?.match(EMAIL_RE) ?? []) if (!map.has(email.toLowerCase())) map.set(email.toLowerCase(), { name: null, email });
  return [...map.values()];
}

/** Sends the meeting invite / update / cancellation (with .ics) to the given users and outside attendees. */
export async function notifyMeeting(
  meetingId: number,
  userIds: number[],
  method: "REQUEST" | "CANCEL",
  reason: string,
  external: External[] = [],
  actorId: number | null = null,
) {
  if (!userIds.length && !external.length) return;
  const m = await db.query.meetings.findFirst({
    where: eq(schema.meetings.id, meetingId),
    with: { client: { columns: { name: true } }, organiser: { columns: { fullName: true, email: true } } },
  });
  if (!m || !m.startAt) return;
  const people = userIds.length
    ? await db
        .select({ id: schema.users.id, fullName: schema.users.fullName, email: schema.users.email })
        .from(schema.users)
        .where(inArray(schema.users.id, userIds))
    : [];
  const allAttendees = await db
    .select({ fullName: schema.users.fullName, email: schema.users.email })
    .from(schema.meetingAttendees)
    .innerJoin(schema.users, eq(schema.meetingAttendees.userId, schema.users.id))
    .where(eq(schema.meetingAttendees.meetingId, meetingId));
  const internalEmails = new Set([...people, ...allAttendees].map((p) => p.email.toLowerCase()));
  const outside = external.filter((e) => !internalEmails.has(emailKey(e))); // an ERAM address typed as a client contact gets the internal email only
  const allOutside = await externalAttendees(meetingId);
  const end = m.endAt ?? new Date(m.startAt.getTime() + 3600_000);
  const where = [MODE_LABEL[m.mode], m.venue].filter(Boolean).join(" · ");
  const ics = (description: string) =>
    buildIcs({
      meetingId,
      sequence: m.icsSequence,
      method,
      title: m.title,
      start: m.startAt!,
      end,
      location: where,
      description,
      organiser: { name: m.organiser.fullName, email: m.organiser.email },
      attendees: [
        ...allAttendees.map((a) => ({ name: a.fullName, email: a.email })),
        ...allOutside.filter((e) => !internalEmails.has(emailKey(e))).map((e) => ({ name: e.name ?? e.email, email: e.email })),
      ],
    });
  const when = `${fmtDay(m.startAt)}, ${fmtTime(m.startAt)}–${fmtTime(end)} (KSA time)`;
  const verb = method === "CANCEL" ? "Cancelled" : reason;
  const subject = `${verb}: ${m.title} — ${fmtDay(m.startAt)} ${fmtTime(m.startAt)}`;
  const table = (rows: string[][]) =>
    `<table style="font-size:14px;border-collapse:collapse">${rows
      .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;vertical-align:top;white-space:nowrap">${k}</td><td style="padding:4px 0">${esc(v).replace(/\n/g, "<br>")}</td></tr>`)
      .join("")}</table>`;

  // In-app notification for each ERAM recipient, whether or not email is set up.
  await notify(
    people.map((p) => p.id),
    {
      kind: method === "CANCEL" ? "MEETING_CANCELLED" : reason === "Updated" ? "MEETING_UPDATED" : reason === "Confirmed" ? "MEETING_CONFIRMED" : "MEETING_INVITE",
      title: `${verb}: ${m.title}`,
      body: `${when}${where ? ` · ${where}` : ""}`,
      href: `/meetings/${meetingId}`,
      actorId,
    },
  );

  if (people.length) {
    const rows = table([
      ["When", when],
      ["Where", where || "—"],
      ["Client", m.client?.name ?? "—"],
      ["Organiser", m.organiser.fullName],
      ["Objective / agenda", m.objective],
      ["Documents", m.documents ?? "—"],
    ]);
    const content = ics(`${m.objective}\n\n${appUrl(`/meetings/${meetingId}`)}`);
    for (const p of people) {
      await sendMail(
        p.email,
        subject,
        `${verb}: ${esc(m.title)}`,
        `<p>Hello ${esc(p.fullName)},</p>${rows}${button(appUrl(`/meetings/${meetingId}`), "Open meeting")}<p style="font-size:12px;color:#6b7280">The attached invite adds this to your Outlook calendar.</p>`,
        { ics: { method, content } },
      );
    }
  }

  // Outside attendees: no app link and no internal fields (they can't sign in).
  if (outside.length) {
    const rows = table([
      ["When", when],
      ["Where", where || "—"],
      ["Organiser", `${m.organiser.fullName}, ERAM Holdings`],
      ["Agenda", m.objective],
    ]);
    const content = ics(m.objective);
    for (const e of outside) {
      await sendMail(
        e.email,
        subject,
        `${verb}: ${esc(m.title)}`,
        `<p>${e.name ? `Dear ${esc(e.name)},` : "Hello,"}</p>${rows}<p style="font-size:12px;color:#6b7280">The attached invite adds this to your calendar. To reply, please contact ${esc(m.organiser.fullName)} at ${esc(m.organiser.email)}.</p>`,
        { ics: { method, content } },
      );
    }
  }
}

/** Picked contacts the person can see, plus contacts already on the meeting that are private to someone else (kept as they were). */
async function meetingContactIds(me: SessionUser, picked: number[], meetingId?: number) {
  const cc = schema.clientContacts;
  const visible = contactVisibleTo(me);
  const allowed = picked.length ? (await db.select({ id: cc.id }).from(cc).where(and(inArray(cc.id, picked), visible))).map((r) => r.id) : [];
  const hidden = meetingId
    ? (
        await db
          .select({ id: cc.id })
          .from(schema.meetingContacts)
          .innerJoin(cc, eq(schema.meetingContacts.contactId, cc.id))
          .where(and(eq(schema.meetingContacts.meetingId, meetingId), not(visible)))
      ).map((r) => r.id)
    : [];
  return [...new Set([...allowed, ...hidden])];
}

export async function saveMeeting(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: number | null;
  try {
    const me = await requireUser();
    id = int(fd, "id");
    const before = id ? await db.query.meetings.findFirst({ where: eq(schema.meetings.id, id), with: { attendees: true } }) : undefined;
    if (id && !before) throw new FormError("Meeting not found.");
    if (before && !(await canEditMeeting(me, before))) throw new FormError("Only the organiser or an Admin can edit this meeting.");
    const externalBefore = before ? await externalAttendees(before.id) : [];

    // Business units: people only add or remove their own; units outside their access stay as they were.
    const existingBus = before ? (await db.select().from(schema.meetingBusinessUnits).where(eq(schema.meetingBusinessUnits.meetingId, before.id))).map((b) => b.businessUnitId) : [];
    const buIds = mergeBuIds(me, ints(fd, "businessUnitIds"), existingBus, "meeting").ids; // optional on meetings

    // Client: existing, or quick-add a new one (pending review for Users).
    let clientId: number | null = null;
    const clientField = str(fd, "clientId");
    if (clientField === "new") {
      const name = await assertClientName(req(fd, "newClientName", "New client name"), { confirmed: fd.get("confirmDifferent") === "on" });
      const country = req(fd, "newClientCountry", "New client country");
      const [c] = await db
        .insert(schema.clients)
        .values({ name, country, type: "PROSPECT", status: isAdmin(me) ? "ACTIVE" : "PENDING_REVIEW", createdById: me.id })
        .returning();
      clientId = c.id;
      // The new client belongs to the meeting's business units (or the person's primary unit).
      const clientBus = isSuperAdmin(me) ? buIds : buIds.filter((b) => me.buIds.includes(b));
      if (!clientBus.length) {
        const [u] = await db.select({ bu: schema.users.businessUnitId }).from(schema.users).where(eq(schema.users.id, me.id));
        if (u) clientBus.push(u.bu);
      }
      if (clientBus.length) await db.insert(schema.clientBusinessUnits).values(clientBus.map((businessUnitId) => ({ clientId: c.id, businessUnitId })));
      await audit(me.id, "CLIENT_CREATED", "client", c.id, { name, from: "meeting form" });
    } else if (clientField) {
      clientId = Number(clientField);
      if (clientId !== before?.clientId && !(await canSeeClient(me, clientId))) throw new FormError("You don't have access to that client.");
    }

    const type = pick(MEETING_TYPES, str(fd, "type"), "CLIENT_MEETING");
    let status = pick(MEETING_STATUSES, str(fd, "status"), "TO_BE_SCHEDULED");
    const date = str(fd, "date");
    if (date && status === "TO_BE_SCHEDULED") status = "SCHEDULED";
    if (!date && DATED.includes(status)) throw new FormError(`A date is needed for status "${STATUS_LABEL[status]}".`);
    let startAt: Date | null = null;
    let endAt: Date | null = null;
    if (date) {
      startAt = riyadh(date, str(fd, "startTime") ?? "09:00");
      endAt = str(fd, "endTime") ? riyadh(date, str(fd, "endTime")!) : new Date(startAt.getTime() + 3600_000);
      if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) throw new FormError("Check the date and times.");
      if (endAt <= startAt) throw new FormError("End time must be after the start time.");
    }

    let title = str(fd, "title");
    if (!title) {
      const [c] = clientId ? await db.select({ name: schema.clients.name }).from(schema.clients).where(eq(schema.clients.id, clientId)) : [];
      title = `${c?.name ?? "Internal"} – ${TYPE_LABEL[type]}`;
    }

    const data = {
      title,
      priority: pick(PRIORITIES, str(fd, "priority"), "MEDIUM"),
      clientId,
      location: str(fd, "location"),
      mode: pick(MODES, str(fd, "mode"), "IN_PERSON"),
      venue: str(fd, "venue"),
      clientContactsText: str(fd, "clientContactsText"),
      type,
      startAt,
      endAt,
      status,
      objective: req(fd, "objective", "Meeting objective / agenda"),
      documents: str(fd, "documents"),
      nextAction: str(fd, "nextAction"),
      followUpDate: str(fd, "followUpDate"),
      notes: str(fd, "notes"),
    };

    const timeChanged =
      !!before && (before.startAt?.getTime() !== startAt?.getTime() || before.endAt?.getTime() !== endAt?.getTime() || before.venue !== data.venue || before.mode !== data.mode);
    // Anything shown in the invite: attendees get an "Updated" email and their calendar entry is updated.
    const inviteFields = ["title", "clientId", "location", "objective", "documents"] as const;
    const detailsChanged = !!before && (timeChanged || inviteFields.some((f) => String(before[f] ?? "") !== String(data[f] ?? "")));
    const sequence = before ? before.icsSequence + (detailsChanged ? 1 : 0) : 0;

    if (before) {
      await db.update(schema.meetings).set({ ...data, icsSequence: sequence }).where(eq(schema.meetings.id, before.id));
    } else {
      const [m] = await db.insert(schema.meetings).values({ ...data, organiserId: me.id }).returning();
      id = m.id;
    }
    const meetingId = id!;

    // Attendees (keep attendance marks for people who stay on the list)
    const groupIds = ints(fd, "groupIds");
    const wanted = await resolveAttendees(ints(fd, "userIds"), groupIds);
    const existing = new Map((before?.attendees ?? []).map((a) => [a.userId, a]));
    const added = [...wanted.keys()].filter((u) => !existing.has(u));
    const removed = [...existing.keys()].filter((u) => !wanted.has(u));
    if (removed.length)
      await db.delete(schema.meetingAttendees).where(and(eq(schema.meetingAttendees.meetingId, meetingId), inArray(schema.meetingAttendees.userId, removed)));
    for (const [userId, viaGroupId] of wanted) {
      if (existing.has(userId)) {
        if (existing.get(userId)!.viaGroupId !== viaGroupId)
          await db
            .update(schema.meetingAttendees)
            .set({ viaGroupId })
            .where(and(eq(schema.meetingAttendees.meetingId, meetingId), eq(schema.meetingAttendees.userId, userId)));
      } else await db.insert(schema.meetingAttendees).values({ meetingId, userId, viaGroupId });
    }

    const replace = async <T extends Record<string, unknown>>(table: Parameters<typeof db.delete>[0], col: Parameters<typeof eq>[0], rows: T[]) => {
      await db.delete(table).where(eq(col, meetingId));
      if (rows.length) await db.insert(table).values(rows as never);
    };
    await replace(schema.meetingGroups, schema.meetingGroups.meetingId, groupIds.map((groupId) => ({ meetingId, groupId })));
    await replace(schema.meetingContacts, schema.meetingContacts.meetingId, (await meetingContactIds(me, ints(fd, "contactIds"), before?.id)).map((contactId) => ({ meetingId, contactId })));
    await replace(schema.meetingBusinessUnits, schema.meetingBusinessUnits.meetingId, buIds.map((businessUnitId) => ({ meetingId, businessUnitId })));
    await replace(schema.meetingActionOwners, schema.meetingActionOwners.meetingId, ints(fd, "ownerIds").map((userId) => ({ meetingId, userId })));

    // Activity log
    if (!before) await logActivity(meetingId, me.id, "CREATED", { status, start: startAt?.toISOString() ?? null });
    else {
      const fields = ["title", "priority", "clientId", "location", "mode", "venue", "type", "objective", "documents", "nextAction", "followUpDate", "notes"] as const;
      const changed = fields.filter((f) => String(before[f] ?? "") !== String(data[f] ?? ""));
      if (timeChanged && before.startAt?.getTime() !== startAt?.getTime())
        await logActivity(meetingId, me.id, "RESCHEDULED", { from: before.startAt?.toISOString() ?? null, to: startAt?.toISOString() ?? null });
      if (before.status !== status) await logActivity(meetingId, me.id, "STATUS_CHANGED", { from: before.status, to: status });
      if (changed.length) await logActivity(meetingId, me.id, "UPDATED", { changed });
    }
    if (added.length || removed.length) {
      const names = async (ids: number[]) =>
        ids.length ? (await db.select({ n: schema.users.fullName }).from(schema.users).where(inArray(schema.users.id, ids))).map((r) => r.n) : [];
      await logActivity(meetingId, me.id, "ATTENDEES_CHANGED", { added: await names(added), removed: await names(removed) });
    }

    // Emails with calendar invites
    const live = LIVE.includes(status) && !!startAt;
    const wasLive = !!before && LIVE.includes(before.status) && !!before.startAt;
    const everyone = [...wanted.keys()];
    const external = await externalAttendees(meetingId);
    const keysBefore = new Set(externalBefore.map(emailKey));
    const keysNow = new Set(external.map(emailKey));
    const externalAdded = external.filter((e) => !keysBefore.has(emailKey(e)));
    const externalRemoved = externalBefore.filter((e) => !keysNow.has(emailKey(e)));
    if (live && (!wasLive || detailsChanged)) await notifyMeeting(meetingId, everyone, "REQUEST", wasLive ? "Updated" : "Meeting scheduled", external, me.id);
    else if (live && (added.length || externalAdded.length)) await notifyMeeting(meetingId, added, "REQUEST", "Meeting invitation", externalAdded, me.id);
    if (wasLive && (status === "CANCELLED" || status === "POSTPONED")) {
      await db.update(schema.meetings).set({ icsSequence: sequence + 1 }).where(eq(schema.meetings.id, meetingId));
      await notifyMeeting(meetingId, [...everyone, ...removed], "CANCEL", "Cancelled", [...external, ...externalRemoved], me.id);
    }
    if (live && (removed.length || externalRemoved.length)) await notifyMeeting(meetingId, removed, "CANCEL", "Cancelled", externalRemoved, me.id);
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/meetings");
  redirect(`/meetings/${id}?msg=saved`);
}

async function loadEditable(me: SessionUser, id: number) {
  const m = await db.query.meetings.findFirst({ where: eq(schema.meetings.id, id), with: { attendees: true } });
  if (!m || !(await canEditMeeting(me, m))) redirect(`/meetings/${id}?msg=denied`);
  return m;
}

/** Quick status buttons on the meeting page: Confirm, Cancel, Mark completed. */
export async function setMeetingStatus(id: number, status: MeetingStatus) {
  const me = await requireUser();
  const m = await loadEditable(me, id);
  if (DATED.includes(status) && !m.startAt) redirect(`/meetings/${id}/edit?msg=needdate`);
  await db.update(schema.meetings).set({ status, icsSequence: status === "CANCELLED" ? m.icsSequence + 1 : m.icsSequence }).where(eq(schema.meetings.id, id));
  await logActivity(id, me.id, "STATUS_CHANGED", { from: m.status, to: status });
  const everyone = m.attendees.map((a) => a.userId);
  const external = await externalAttendees(id);
  if (status === "CANCELLED" && LIVE.includes(m.status)) await notifyMeeting(id, everyone, "CANCEL", "Cancelled", external, me.id);
  if (status === "CONFIRMED" && m.status !== "CONFIRMED") await notifyMeeting(id, everyone, "REQUEST", "Confirmed", external, me.id);
  revalidatePath("/meetings");
  redirect(status === "COMPLETED" ? `/meetings/${id}/brief?msg=completed` : `/meetings/${id}?msg=status`);
}

export async function deleteMeeting(id: number) {
  const me = await requireUser();
  if (!isAdmin(me)) redirect(`/meetings/${id}?msg=denied`);
  const m = await loadEditable(me, id);
  if (LIVE.includes(m.status)) await notifyMeeting(id, m.attendees.map((a) => a.userId), "CANCEL", "Cancelled", await externalAttendees(id), me.id);
  await db.update(schema.meetingBriefs).set({ followUpMeetingId: null }).where(eq(schema.meetingBriefs.followUpMeetingId, id));
  await db.update(schema.meetings).set({ parentMeetingId: null }).where(eq(schema.meetings.parentMeetingId, id));
  await db.delete(schema.meetings).where(eq(schema.meetings.id, id));
  // Its notifications stay (they say it was cancelled) but no longer link to the deleted meeting.
  await db
    .update(schema.notifications)
    .set({ href: null })
    .where(or(eq(schema.notifications.href, `/meetings/${id}`), like(schema.notifications.href, `/meetings/${id}/%`)));
  await audit(me.id, "MEETING_DELETED", "meeting", id, { title: m.title });
  revalidatePath("/meetings");
  redirect("/meetings?msg=deleted");
}
