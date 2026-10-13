import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { SessionUser } from "./auth";
import { todayRiyadh, visibleTo, type MeetingStatus } from "./meetings";

export const FLAGS = {
  OVERDUE: { label: "Follow-up overdue", tone: "red" },
  BOOKED: { label: "Meeting booked", tone: "blue" },
  TO_SCHEDULE: { label: "To be scheduled", tone: "amber" },
  NO_NEXT_STEP: { label: "Met — no next step", tone: "gray" },
  NO_MEETING: { label: "No meeting yet", tone: "gray" },
} as const;
export type Flag = keyof typeof FLAGS;

type M = {
  id: number;
  clientId: number | null;
  title: string;
  status: MeetingStatus;
  priority: "HIGH" | "MEDIUM" | "LOW";
  startAt: Date | null;
  nextAction: string | null;
  followUpDate: string | null;
  createdAt: Date;
};

/** One row per client: where things stand — last and next meeting, open next action, follow-up, overall flag. */
export async function clientStatusRows(me: SessionUser) {
  const now = new Date();
  const today = todayRiyadh();
  const [clients, meetings, owners, actions] = await Promise.all([
    db
      .select({
        id: schema.clients.id,
        name: schema.clients.name,
        country: schema.clients.country,
        city: schema.clients.city,
        type: schema.clients.type,
        bdStage: schema.clients.bdStage,
        status: schema.clients.status,
        ownerId: schema.clients.accountOwnerId,
        owner: schema.users.fullName,
      })
      .from(schema.clients)
      .leftJoin(schema.users, eq(schema.clients.accountOwnerId, schema.users.id))
      .where(ne(schema.clients.status, "INACTIVE"))
      .orderBy(asc(schema.clients.name)),
    db
      .select({
        id: schema.meetings.id,
        clientId: schema.meetings.clientId,
        title: schema.meetings.title,
        status: schema.meetings.status,
        priority: schema.meetings.priority,
        startAt: schema.meetings.startAt,
        nextAction: schema.meetings.nextAction,
        followUpDate: schema.meetings.followUpDate,
        createdAt: schema.meetings.createdAt,
      })
      .from(schema.meetings)
      .where(and(ne(schema.meetings.status, "CANCELLED"), visibleTo(me))),
    db
      .select({ meetingId: schema.meetingActionOwners.meetingId, name: schema.users.fullName })
      .from(schema.meetingActionOwners)
      .innerJoin(schema.users, eq(schema.meetingActionOwners.userId, schema.users.id)),
    db
      .select({ meetingId: schema.meetingBriefs.meetingId, deadline: schema.briefActions.deadline })
      .from(schema.briefActions)
      .innerJoin(schema.meetingBriefs, eq(schema.briefActions.briefId, schema.meetingBriefs.id))
      .where(inArray(schema.meetingBriefs.status, ["SUBMITTED"])),
  ]);

  const byClient = new Map<number, M[]>();
  for (const m of meetings) if (m.clientId) byClient.set(m.clientId, [...(byClient.get(m.clientId) ?? []), m]);

  return clients.map((c) => {
    const list = byClient.get(c.id) ?? [];
    const past = list.filter((m) => m.startAt && (m.startAt <= now || m.status === "COMPLETED") && m.status !== "POSTPONED").sort((a, b) => b.startAt!.getTime() - a.startAt!.getTime());
    const upcoming = list
      .filter((m) => m.startAt && m.startAt > now && ["SCHEDULED", "CONFIRMED"].includes(m.status) && !past.includes(m))
      .sort((a, b) => a.startAt!.getTime() - b.startAt!.getTime());
    const waiting = list.filter((m) => m.status === "TO_BE_SCHEDULED" || m.status === "POSTPONED");
    const open = list.filter((m) => m.status !== "COMPLETED");
    // Current next action: the open meeting with a next action (soonest follow-up first), else the latest meeting's
    const actionSource =
      [...open].filter((m) => m.nextAction).sort((a, b) => (a.followUpDate ?? "9999").localeCompare(b.followUpDate ?? "9999"))[0] ??
      [...list].filter((m) => m.nextAction).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    const followUps = open.map((m) => m.followUpDate?.slice(0, 10)).filter((d): d is string => !!d).sort();
    const followUp = followUps[0] ?? null;
    const briefActions = actions.filter((a) => list.some((m) => m.id === a.meetingId));
    const nextDeadline = briefActions.map((a) => a.deadline?.slice(0, 10)).filter((d): d is string => !!d && d >= today).sort()[0] ?? null;

    let flag: Flag;
    if (!list.length) flag = "NO_MEETING";
    else if (followUp && followUp < today && !upcoming.length) flag = "OVERDUE";
    else if (upcoming.length) flag = "BOOKED";
    else if (waiting.length) flag = "TO_SCHEDULE";
    else flag = "NO_NEXT_STEP";

    const top: "HIGH" | "MEDIUM" | "LOW" | null = open.some((m) => m.priority === "HIGH") ? "HIGH" : open.some((m) => m.priority === "MEDIUM") ? "MEDIUM" : open.length ? "LOW" : null;
    return {
      ...c,
      location: [c.city, c.country].filter(Boolean).join(", "),
      priority: top,
      meetings: list.length,
      completed: list.filter((m) => m.status === "COMPLETED").length,
      last: past[0] ? { id: past[0].id, at: past[0].startAt!, status: past[0].status } : null,
      next: upcoming[0] ? { id: upcoming[0].id, at: upcoming[0].startAt!, status: upcoming[0].status } : null,
      waiting: waiting[0] ? { id: waiting[0].id, count: waiting.length } : null,
      nextAction: actionSource?.nextAction ?? null,
      actionOwners: actionSource ? owners.filter((o) => o.meetingId === actionSource.id).map((o) => o.name).join(", ") : "",
      actionMeetingId: actionSource?.id ?? null,
      followUp,
      agreedActions: briefActions.length,
      nextDeadline,
      flag,
    };
  });
}
export type ClientStatusRow = Awaited<ReturnType<typeof clientStatusRows>>[number];
