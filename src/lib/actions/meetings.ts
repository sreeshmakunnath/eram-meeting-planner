"use server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireUser, type SessionUser } from "@/lib/auth";
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

/** Sends the meeting invite / update / cancellation (with .ics) to the given users. */
export async function notifyMeeting(meetingId: number, userIds: number[], method: "REQUEST" | "CANCEL", reason: string) {
  if (!userIds.length) return;
  const m = await db.query.meetings.findFirst({
    where: eq(schema.meetings.id, meetingId),
    with: { client: { columns: { name: true } }, organiser: { columns: { fullName: true, email: true } } },
  });
  if (!m || !m.startAt) return;
  const people = await db
    .select({ id: schema.users.id, fullName: schema.users.fullName, email: schema.users.email })
    .from(schema.users)
    .where(inArray(schema.users.id, userIds));
  const allAttendees = await db
    .select({ fullName: schema.users.fullName, email: schema.users.email })
    .from(schema.meetingAttendees)
    .innerJoin(schema.users, eq(schema.meetingAttendees.userId, schema.users.id))
    .where(eq(schema.meetingAttendees.meetingId, meetingId));
  const end = m.endAt ?? new Date(m.startAt.getTime() + 3600_000);
  const where = [MODE_LABEL[m.mode], m.venue].filter(Boolean).join(" · ");
  const ics = buildIcs({
    meetingId,
    sequence: m.icsSequence,
    method,
    title: m.title,
    start: m.startAt,
    end,
    location: where,
    description: `${m.objective}\n\n${appUrl(`/meetings/${meetingId}`)}`,
    organiser: { name: m.organiser.fullName, email: m.organiser.email },
    attendees: allAttendees.map((a) => ({ name: a.fullName, email: a.email })),
  });
  const when = `${fmtDay(m.startAt)}, ${fmtTime(m.startAt)}–${fmtTime(end)} (KSA time)`;
  const verb = method === "CANCEL" ? "Cancelled" : reason;
  const rows = [
    ["When", when],
    ["Where", where || "—"],
    ["Client", m.client?.name ?? "—"],
    ["Organiser", m.organiser.fullName],
    ["Objective / agenda", m.objective],
    ["Documents", m.documents ?? "—"],
  ]
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;vertical-align:top;white-space:nowrap">${k}</td><td style="padding:4px 0">${esc(v).replace(/\n/g, "<br>")}</td></tr>`)
    .join("");
  for (const p of people) {
    await sendMail(
      p.email,
      `${verb}: ${m.title} — ${fmtDay(m.startAt)} ${fmtTime(m.startAt)}`,
      `${verb}: ${esc(m.title)}`,
      `<p>Hello ${esc(p.fullName)},</p><table style="font-size:14px;border-collapse:collapse">${rows}</table>${button(appUrl(`/meetings/${meetingId}`), "Open meeting")}<p style="font-size:12px;color:#6b7280">The attached invite adds this to your Outlook calendar.</p>`,
      { ics: { method, content: ics } },
    );
  }
}

export async function saveMeeting(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: number | null;
  try {
    const me = await requireUser();
    id = int(fd, "id");
    const before = id ? await db.query.meetings.findFirst({ where: eq(schema.meetings.id, id), with: { attendees: true } }) : undefined;
    if (id && !before) throw new FormError("Meeting not found.");
    if (before && !canEditMeeting(me, before)) throw new FormError("Only the organiser or an Admin can edit this meeting.");

    // Client: existing, or quick-add a new one (pending review for Users).
    let clientId: number | null = null;
    const clientField = str(fd, "clientId");
    if (clientField === "new") {
      const name = req(fd, "newClientName", "New client name");
      const country = req(fd, "newClientCountry", "New client country");
      const [c] = await db
        .insert(schema.clients)
        .values({ name, country, type: "PROSPECT", status: me.role === "ADMIN" ? "ACTIVE" : "PENDING_REVIEW", createdById: me.id })
        .returning();
      clientId = c.id;
      await audit(me.id, "CLIENT_CREATED", "client", c.id, { name, from: "meeting form" });
    } else if (clientField) clientId = Number(clientField);

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
    const sequence = before ? before.icsSequence + (timeChanged ? 1 : 0) : 0;

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
    await replace(schema.meetingContacts, schema.meetingContacts.meetingId, ints(fd, "contactIds").map((contactId) => ({ meetingId, contactId })));
    await replace(schema.meetingBusinessUnits, schema.meetingBusinessUnits.meetingId, ints(fd, "businessUnitIds").map((businessUnitId) => ({ meetingId, businessUnitId })));
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
    if (live && (!wasLive || timeChanged)) await notifyMeeting(meetingId, everyone, "REQUEST", wasLive ? "Updated" : "Meeting scheduled");
    else if (live && added.length) await notifyMeeting(meetingId, added, "REQUEST", "Meeting invitation");
    if (wasLive && (status === "CANCELLED" || status === "POSTPONED")) {
      await db.update(schema.meetings).set({ icsSequence: sequence + 1 }).where(eq(schema.meetings.id, meetingId));
      await notifyMeeting(meetingId, everyone, "CANCEL", "Cancelled");
    }
    if (live && removed.length) await notifyMeeting(meetingId, removed, "CANCEL", "Cancelled");
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/meetings");
  redirect(`/meetings/${id}?msg=saved`);
}

async function loadEditable(me: SessionUser, id: number) {
  const m = await db.query.meetings.findFirst({ where: eq(schema.meetings.id, id), with: { attendees: true } });
  if (!m || !canEditMeeting(me, m)) redirect(`/meetings/${id}?msg=denied`);
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
  if (status === "CANCELLED" && LIVE.includes(m.status)) await notifyMeeting(id, everyone, "CANCEL", "Cancelled");
  if (status === "CONFIRMED" && m.status !== "CONFIRMED") await notifyMeeting(id, everyone, "REQUEST", "Confirmed");
  revalidatePath("/meetings");
  redirect(status === "COMPLETED" ? `/meetings/${id}/brief?msg=completed` : `/meetings/${id}?msg=status`);
}

export async function deleteMeeting(id: number) {
  const me = await requireUser();
  if (me.role !== "ADMIN") redirect(`/meetings/${id}?msg=denied`);
  const m = await loadEditable(me, id);
  if (LIVE.includes(m.status)) await notifyMeeting(id, m.attendees.map((a) => a.userId), "CANCEL", "Cancelled");
  await db.update(schema.meetingBriefs).set({ followUpMeetingId: null }).where(eq(schema.meetingBriefs.followUpMeetingId, id));
  await db.update(schema.meetings).set({ parentMeetingId: null }).where(eq(schema.meetings.parentMeetingId, id));
  await db.delete(schema.meetings).where(eq(schema.meetings.id, id));
  await audit(me.id, "MEETING_DELETED", "meeting", id, { title: m.title });
  revalidatePath("/meetings");
  redirect("/meetings?msg=deleted");
}
