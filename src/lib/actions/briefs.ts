"use server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { syncBriefTasks } from "@/lib/brief-tasks";
import { notifyTaskAssigned } from "@/lib/tasks";
import { FormError, int, ints, str, toFormError } from "@/lib/form";
import { appUrl, button, esc, sendMail } from "@/lib/mail";
import { notify } from "@/lib/notifications";
import { canEditMeeting, canWriteBrief, fmtDay, fmtPlainDate, fmtTime, logActivity } from "@/lib/meetings";

export async function saveBrief(_: ActionState, fd: FormData): Promise<ActionState> {
  let meetingId: number | null = null;
  let submitted = false;
  try {
    const me = await requireUser();
    meetingId = int(fd, "meetingId");
    if (!meetingId) throw new FormError("Missing meeting.");
    const m = await canWriteBrief(me, meetingId);
    if (!m) throw new FormError("Only the organiser, an attendee or an Admin can write this brief.");
    const [existing] = await db.select().from(schema.meetingBriefs).where(eq(schema.meetingBriefs.meetingId, meetingId));
    if (existing?.status === "SUBMITTED") throw new FormError("This brief is already submitted. Reopen it to make changes.");

    submitted = fd.get("intent") === "submit";
    const data = {
      clientAttendees: str(fd, "clientAttendees"),
      discussionPoints: str(fd, "discussionPoints"),
      outcomes: str(fd, "outcomes"),
      documentsUsed: str(fd, "documentsUsed"),
      nextFollowUpDate: str(fd, "nextFollowUpDate"),
    };
    if (submitted && !data.discussionPoints) throw new FormError("Add the key discussion points before submitting.");
    if (submitted && !m.startAt) throw new FormError("Set the meeting date before submitting the brief.");

    // Agreed actions: parallel arrays from the rows
    const actions = fd.getAll("actionText").map(String);
    const owners = fd.getAll("actionOwner").map(String);
    const deadlines = fd.getAll("actionDeadline").map(String);
    const actionIds = fd.getAll("actionId").map((v) => Number(v) || null);
    const rows = actions
      .map((a, i) => ({
        id: actionIds[i] ?? null,
        action: a.trim(),
        ownerUserId: owners[i]?.startsWith("u:") ? Number(owners[i].slice(2)) : null,
        ownerGroupId: owners[i]?.startsWith("g:") ? Number(owners[i].slice(2)) : null,
        deadline: deadlines[i] || null,
        position: i,
      }))
      .filter((r) => r.action);
    if (submitted && rows.some((r) => !r.ownerUserId && !r.ownerGroupId)) throw new FormError("Every agreed action needs an owner.");

    const now = new Date();
    const values = {
      ...data,
      status: submitted ? ("SUBMITTED" as const) : ("DRAFT" as const),
      submittedAt: submitted ? now : null,
      submittedById: submitted ? me.id : null,
    };
    let briefId: number;
    if (existing) {
      await db.update(schema.meetingBriefs).set(values).where(eq(schema.meetingBriefs.id, existing.id));
      briefId = existing.id;
    } else {
      const [b] = await db.insert(schema.meetingBriefs).values({ meetingId, ...values }).returning();
      briefId = b.id;
    }
    // Keep each action's row (and id) stable so its task stays linked when the brief is edited
    const current = await db.select({ id: schema.briefActions.id }).from(schema.briefActions).where(eq(schema.briefActions.briefId, briefId));
    const keepIds = rows.map((r) => r.id).filter((x): x is number => !!x && current.some((c) => c.id === x));
    const removedIds = current.map((c) => c.id).filter((x) => !keepIds.includes(x));
    if (removedIds.length) await db.delete(schema.briefActions).where(inArray(schema.briefActions.id, removedIds));
    for (const { id: rowId, ...r } of rows) {
      if (rowId && keepIds.includes(rowId)) await db.update(schema.briefActions).set(r).where(eq(schema.briefActions.id, rowId));
      else await db.insert(schema.briefActions).values({ ...r, briefId });
    }

    // Attendance marks
    const attended = ints(fd, "attended");
    for (const a of m.attendees) {
      await db
        .update(schema.meetingAttendees)
        .set({ attended: attended.includes(a.userId) })
        .where(and(eq(schema.meetingAttendees.meetingId, meetingId), eq(schema.meetingAttendees.userId, a.userId)));
    }

    await logActivity(meetingId, me.id, submitted ? "BRIEF_SUBMITTED" : "BRIEF_SAVED", { version: existing?.version ?? 1, actions: rows.length });

    if (submitted) {
      if (m.status !== "COMPLETED") {
        await db.update(schema.meetings).set({ status: "COMPLETED" }).where(eq(schema.meetings.id, meetingId));
        await logActivity(meetingId, me.id, "STATUS_CHANGED", { from: m.status, to: "COMPLETED" });
      }
      // Next follow-up date → a follow-up meeting waiting to be scheduled
      if (data.nextFollowUpDate && !existing?.followUpMeetingId) {
        const [f] = await db
          .insert(schema.meetings)
          .values({
            title: `${m.title.replace(/ – .*$/, "")} – Follow-up`,
            priority: m.priority,
            clientId: m.clientId,
            location: m.location,
            mode: m.mode,
            type: "FOLLOW_UP",
            status: "TO_BE_SCHEDULED",
            objective: `Follow-up of the meeting on ${fmtDay(m.startAt)}.${data.outcomes ? `\nOutcomes: ${data.outcomes}` : ""}`,
            followUpDate: data.nextFollowUpDate,
            organiserId: m.organiserId,
            parentMeetingId: m.id,
          })
          .returning();
        const groups = await db.select().from(schema.meetingGroups).where(eq(schema.meetingGroups.meetingId, meetingId));
        if (m.attendees.length)
          await db.insert(schema.meetingAttendees).values(m.attendees.map((a) => ({ meetingId: f.id, userId: a.userId, viaGroupId: a.viaGroupId })));
        if (groups.length) await db.insert(schema.meetingGroups).values(groups.map((g) => ({ meetingId: f.id, groupId: g.groupId })));
        const bus = await db.select().from(schema.meetingBusinessUnits).where(eq(schema.meetingBusinessUnits.meetingId, meetingId));
        if (bus.length) await db.insert(schema.meetingBusinessUnits).values(bus.map((b) => ({ meetingId: f.id, businessUnitId: b.businessUnitId })));
        await db.update(schema.meetingBriefs).set({ followUpMeetingId: f.id }).where(eq(schema.meetingBriefs.id, briefId));
        await db.update(schema.meetings).set({ followUpDate: data.nextFollowUpDate }).where(eq(schema.meetings.id, meetingId));
        await logActivity(f.id, me.id, "CREATED", { status: "TO_BE_SCHEDULED", from: `brief of meeting #${meetingId}` });
      }
      await emailBrief(meetingId, me.id);
      // Every agreed action becomes (or updates) a task in the task planner
      const synced = await syncBriefTasks(db, briefId, me.id);
      for (const c of synced.created) await notifyTaskAssigned(c.taskId, c.userIds, me.name, me.id);
    }
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${meetingId}`);
  if (submitted) redirect(`/meetings/${meetingId}?msg=brief`);
  return { ok: "Draft saved." };
}

async function emailBrief(meetingId: number, actorId: number) {
  const m = await db.query.meetings.findFirst({
    where: eq(schema.meetings.id, meetingId),
    with: {
      client: { columns: { name: true } },
      attendees: { with: { user: { columns: { id: true, email: true, fullName: true } } } },
      brief: { with: { actions: { with: { owner: { columns: { id: true, fullName: true, email: true } }, ownerGroup: { columns: { id: true, name: true } } } } } },
    },
  });
  if (!m?.brief) return;
  const recipients = new Map<number, { email: string; fullName: string }>();
  for (const a of m.attendees) recipients.set(a.user.id, a.user);
  for (const a of m.brief.actions) if (a.owner) recipients.set(a.owner.id, a.owner);
  const groupIds = m.brief.actions.map((a) => a.ownerGroupId).filter((x): x is number => !!x);
  if (groupIds.length) {
    const members = await db
      .select({ id: schema.users.id, email: schema.users.email, fullName: schema.users.fullName })
      .from(schema.groupMembers)
      .innerJoin(schema.users, eq(schema.groupMembers.userId, schema.users.id))
      .where(inArray(schema.groupMembers.groupId, groupIds));
    for (const u of members) recipients.set(u.id, u);
  }
  const actionsHtml = m.brief.actions.length
    ? `<table style="font-size:14px;border-collapse:collapse;width:100%"><tr style="background:#eef2f9"><th align="left" style="padding:6px">Action</th><th align="left" style="padding:6px">Owner</th><th align="left" style="padding:6px">Deadline</th></tr>${m.brief.actions
        .map((a) => `<tr><td style="padding:6px;border-top:1px solid #e5e7eb">${esc(a.action)}</td><td style="padding:6px;border-top:1px solid #e5e7eb">${esc(a.owner?.fullName ?? a.ownerGroup?.name ?? "—")}</td><td style="padding:6px;border-top:1px solid #e5e7eb">${a.deadline ? fmtPlainDate(a.deadline) : "—"}</td></tr>`)
        .join("")}</table>`
    : "<p>No agreed actions.</p>";
  const body = `<p><b>${esc(m.client?.name ?? m.title)}</b> · ${fmtDay(m.startAt)} ${fmtTime(m.startAt)}</p>
    <p style="margin:12px 0 4px;color:#1F3864"><b>Key discussion points</b></p><p style="white-space:pre-wrap;margin:0">${esc(m.brief.discussionPoints ?? "—")}</p>
    <p style="margin:12px 0 4px;color:#1F3864"><b>Key outcomes / opportunities</b></p><p style="white-space:pre-wrap;margin:0">${esc(m.brief.outcomes ?? "—")}</p>
    <p style="margin:12px 0 4px;color:#1F3864"><b>Agreed actions</b></p>${actionsHtml}
    <p>Next follow-up: <b>${m.brief.nextFollowUpDate ? fmtPlainDate(m.brief.nextFollowUpDate) : "—"}</b></p>
    ${button(appUrl(`/meetings/${meetingId}/brief/print`), "Open full brief")}`;
  await notify([...recipients.keys()], {
    kind: "BRIEF_SUBMITTED",
    title: `Meeting Brief submitted: ${m.title}`,
    body: `${m.client?.name ?? m.title} · ${fmtDay(m.startAt)}${m.brief.actions.length ? ` · ${m.brief.actions.length} agreed action${m.brief.actions.length === 1 ? "" : "s"}` : ""}`,
    href: `/meetings/${meetingId}/brief`,
    actorId,
  });
  for (const r of recipients.values()) {
    await sendMail(r.email, `Meeting Brief: ${m.title}`, "Meeting Brief", `<p>Hello ${esc(r.fullName)},</p>${body}`);
  }
}

export async function reopenBrief(meetingId: number) {
  const me = await requireUser();
  const m = await db.query.meetings.findFirst({ where: eq(schema.meetings.id, meetingId) });
  if (!m || !canEditMeeting(me, m)) redirect(`/meetings/${meetingId}/brief?msg=denied`);
  const [b] = await db.select().from(schema.meetingBriefs).where(eq(schema.meetingBriefs.meetingId, meetingId));
  if (b) {
    await db.update(schema.meetingBriefs).set({ status: "DRAFT", version: b.version + 1 }).where(eq(schema.meetingBriefs.id, b.id));
    await logActivity(meetingId, me.id, "BRIEF_REOPENED", { version: b.version + 1 });
  }
  redirect(`/meetings/${meetingId}/brief`);
}
