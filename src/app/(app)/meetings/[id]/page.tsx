import { and, asc, desc, eq, gt, inArray, lt, ne, notInArray } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge, Empty, fmtDateTime, labelize, Notice, PageHeader, Tabs } from "@/components/ui";
import { db, schema } from "@/db";
import { deleteMeeting, setMeetingStatus } from "@/lib/actions/meetings";
import { isAdmin, requireUser } from "@/lib/auth";
import { TaskMiniList } from "@/components/task-mini-list";
import { listTasks } from "@/lib/task-queries";
import {
  canEditMeeting,
  canView,
  fmtDay,
  fmtPlainDate,
  fmtTime,
  MODE_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  TYPE_LABEL,
} from "@/lib/meetings";
import { changedText } from "@/lib/activity-labels";

const messages: Record<string, { tone: "ok" | "error"; text: string }> = {
  saved: { tone: "ok", text: "Meeting saved." },
  status: { tone: "ok", text: "Status updated." },
  denied: { tone: "error", text: "Only the organiser or an Admin can change this meeting." },
  brief: { tone: "ok", text: "Meeting Brief submitted and emailed to attendees." },
};

const describe = (action: string, d: Record<string, unknown> | null) => {
  if (!d) return "";
  if (action === "RESCHEDULED") return `${d.from ? fmtDateTime(d.from as string) : "not set"} → ${d.to ? fmtDateTime(d.to as string) : "not set"}`;
  if (action === "STATUS_CHANGED") return `${STATUS_LABEL[d.from as keyof typeof STATUS_LABEL]} → ${STATUS_LABEL[d.to as keyof typeof STATUS_LABEL]}`;
  if (action === "ATTENDEES_CHANGED")
    return [((d.added as string[]) ?? []).length ? `added ${(d.added as string[]).join(", ")}` : "", ((d.removed as string[]) ?? []).length ? `removed ${(d.removed as string[]).join(", ")}` : ""]
      .filter(Boolean)
      .join("; ");
  if (action === "UPDATED") return changedText(d);
  if (action === "CREATED") return d.status ? `as ${STATUS_LABEL[d.status as keyof typeof STATUS_LABEL]}` : "";
  return Object.entries(d)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
};

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2.5 text-sm">
      <dt className="text-slate-500">{k}</dt>
      <dd className="col-span-2 whitespace-pre-wrap">{children || "—"}</dd>
    </div>
  );
}

export default async function MeetingPage({ params, searchParams }: { params: { id: string }; searchParams: { tab?: string; msg?: string } }) {
  const me = await requireUser();
  const id = Number(params.id);
  if (!Number.isInteger(id)) notFound();
  const m = await db.query.meetings.findFirst({
    where: eq(schema.meetings.id, id),
    with: {
      client: { columns: { id: true, name: true } },
      organiser: { columns: { fullName: true } },
      attendees: { with: { user: { columns: { id: true, fullName: true, designation: true } }, viaGroup: { columns: { name: true } } } },
      groups: { with: { group: { columns: { id: true, name: true } } } },
      contacts: { with: { contact: true } },
      businessUnits: { with: { businessUnit: { columns: { name: true } } } },
      actionOwners: { with: { user: { columns: { fullName: true } } } },
      brief: { columns: { status: true, submittedAt: true, followUpMeetingId: true } },
    },
  });
  if (!m) notFound();
  if (!(await canView(me, id))) redirect("/meetings");
  const editable = await canEditMeeting(me, m);
  const tab = searchParams.tab ?? "details";
  const msg = searchParams.msg ? messages[searchParams.msg] : undefined;
  const base = `/meetings/${id}`;

  // Clash check: attendees with another live meeting overlapping this one
  const clashes =
    m.startAt && m.endAt && !["CANCELLED", "COMPLETED"].includes(m.status) && m.attendees.length
      ? await db
          .selectDistinct({ user: schema.users.fullName, meetingId: schema.meetings.id, title: schema.meetings.title })
          .from(schema.meetingAttendees)
          .innerJoin(schema.meetings, eq(schema.meetingAttendees.meetingId, schema.meetings.id))
          .innerJoin(schema.users, eq(schema.meetingAttendees.userId, schema.users.id))
          .where(
            and(
              inArray(schema.meetingAttendees.userId, m.attendees.map((a) => a.userId)),
              ne(schema.meetings.id, id),
              notInArray(schema.meetings.status, ["CANCELLED", "POSTPONED"]),
              lt(schema.meetings.startAt, m.endAt),
              gt(schema.meetings.endAt, m.startAt),
            ),
          )
      : [];

  const [parent, activity] = await Promise.all([
    m.parentMeetingId ? db.query.meetings.findFirst({ where: eq(schema.meetings.id, m.parentMeetingId), columns: { id: true, title: true, startAt: true } }) : undefined,
    tab === "activity"
      ? db
          .select({ id: schema.meetingActivity.id, at: schema.meetingActivity.createdAt, action: schema.meetingActivity.action, details: schema.meetingActivity.details, user: schema.users.fullName })
          .from(schema.meetingActivity)
          .leftJoin(schema.users, eq(schema.meetingActivity.userId, schema.users.id))
          .where(eq(schema.meetingActivity.meetingId, id))
          .orderBy(desc(schema.meetingActivity.createdAt))
      : [],
  ]);

  const meetingTasks = await listTasks(me, { scope: "all", bucket: "any", meeting: String(id) });
  const when = m.startAt ? `${fmtDay(m.startAt)} · ${fmtTime(m.startAt)}–${fmtTime(m.endAt)} (KSA)` : "Date not set";
  const open = !["COMPLETED", "CANCELLED"].includes(m.status);
  const attendees = [...m.attendees].sort((a, b) => a.user.fullName.localeCompare(b.user.fullName));

  return (
    <>
      <PageHeader
        title={m.title}
        subtitle={`${when} · ${TYPE_LABEL[m.type]} · organised by ${m.organiser.fullName}`}
        actions={
          <>
            <Badge tone={STATUS_TONE[m.status]}>{STATUS_LABEL[m.status]}</Badge>
            <Badge tone={m.priority === "HIGH" ? "red" : m.priority === "MEDIUM" ? "amber" : "gray"}>{PRIORITY_LABEL[m.priority]}</Badge>
          </>
        }
      />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {clashes.length > 0 && (
        <Notice tone="error">
          Clash:{" "}
          {clashes.map((c, i) => (
            <span key={i}>
              {i > 0 && "; "}
              {c.user} also has{" "}
              <Link href={`/meetings/${c.meetingId}`} className="underline">
                {c.title}
              </Link>
            </span>
          ))}{" "}
          at this time.
        </Notice>
      )}

      {editable && (
        <div className="mb-5 flex flex-wrap gap-2">
          <Link href={`${base}/edit`} className="btn-primary">
            Edit
          </Link>
          {m.status === "SCHEDULED" && (
            <form action={setMeetingStatus.bind(null, id, "CONFIRMED")}>
              <button className="btn-secondary">Mark confirmed</button>
            </form>
          )}
          {open && m.startAt && (
            <form action={setMeetingStatus.bind(null, id, "COMPLETED")}>
              <button className="btn-secondary">Mark completed & write brief</button>
            </form>
          )}
          {open && (
            <form action={setMeetingStatus.bind(null, id, "CANCELLED")}>
              <button className="btn-danger">Cancel meeting</button>
            </form>
          )}
          {isAdmin(me) && (
            <form action={deleteMeeting.bind(null, id)}>
              <button className="btn-danger">Delete</button>
            </form>
          )}
        </div>
      )}

      <Tabs
        active={`${base}?tab=${tab}`}
        items={[
          { href: `${base}?tab=details`, label: "Details" },
          { href: `${base}/brief`, label: m.brief?.status === "SUBMITTED" ? "Meeting Brief ✓" : "Meeting Brief" },
          { href: `${base}?tab=activity`, label: "Activity" },
        ]}
      />

      {tab === "details" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <dl className="card divide-y divide-slate-100 px-5 lg:col-span-2">
            <Row k="Client / Company">
              {m.client ? (
                <Link href={`/clients/${m.client.id}?tab=meetings`} className="link">
                  {m.client.name}
                </Link>
              ) : (
                "Internal"
              )}
            </Row>
            <Row k="Country / Location">{m.location}</Row>
            <Row k="Platform">{[MODE_LABEL[m.mode], m.venue].filter(Boolean).join(" · ")}</Row>
            <Row k="Client contacts">
              {[...m.contacts.map((c) => c.contact.name + (c.contact.designation ? ` (${c.contact.designation})` : "")), m.clientContactsText].filter(Boolean).join("; ")}
            </Row>
            <Row k="Objective / agenda">{m.objective}</Row>
            <Row k="Relevant business units">{m.businessUnits.map((b) => b.businessUnit.name).join("; ")}</Row>
            <Row k="Presentation / documents">{m.documents}</Row>
            <Row k="Next action">{m.nextAction}</Row>
            <Row k="Action owner">{m.actionOwners.map((o) => o.user.fullName).join(", ")}</Row>
            <Row k="Follow-up date">{m.followUpDate ? fmtPlainDate(m.followUpDate) : null}</Row>
            <Row k="Notes">{m.notes}</Row>
            {parent && (
              <Row k="Follow-up of">
                <Link href={`/meetings/${parent.id}`} className="link">
                  {parent.title}
                </Link>
              </Row>
            )}
            {m.brief?.followUpMeetingId && (
              <Row k="Follow-up meeting">
                <Link href={`/meetings/${m.brief.followUpMeetingId}`} className="link">
                  Open follow-up
                </Link>
              </Row>
            )}
          </dl>
          <div className="space-y-6 self-start">
          <section className="card">
            <h2 className="border-b border-slate-200 px-4 py-3 font-semibold text-navy">ERAM attendees ({attendees.length})</h2>
            {m.groups.length > 0 && (
              <div className="flex flex-wrap gap-1 border-b border-slate-100 px-4 py-2">
                {m.groups.map((g) => (
                  <Link key={g.group.id} href={`/groups/${g.group.id}`} className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs text-navy">
                    {g.group.name}
                  </Link>
                ))}
              </div>
            )}
            {attendees.length ? (
              <ul className="divide-y divide-slate-100">
                {attendees.map((a) => (
                  <li key={a.userId} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                    <span>
                      {a.user.fullName}
                      <span className="block text-xs text-slate-500">{a.viaGroup ? `via ${a.viaGroup.name}` : (a.user.designation ?? "")}</span>
                    </span>
                    {a.attended === true && <Badge tone="green">Attended</Badge>}
                    {a.attended === false && <Badge>Absent</Badge>}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No ERAM attendees yet.</Empty>
            )}
          </section>
          <section className="card">
            <h2 className="border-b border-slate-200 px-4 py-3 font-semibold text-navy">Tasks ({meetingTasks.length})</h2>
            <TaskMiniList rows={meetingTasks} empty="No tasks yet. Agreed actions from the brief appear here." newHref={`/tasks/new?meeting=${id}`} />
          </section>
          </div>
        </div>
      )}

      {tab === "activity" && (
        <div className="card">
          {activity.length === 0 ? (
            <Empty>No activity yet.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {activity.map((a) => (
                <li key={a.id} className="flex justify-between gap-4 px-4 py-3 text-sm">
                  <span>
                    <b>{a.user ?? "System"}</b> · {labelize(a.action)}{" "}
                    <span className="text-slate-500">{describe(a.action, a.details as Record<string, unknown> | null)}</span>
                  </span>
                  <span className="whitespace-nowrap text-xs text-slate-500">{fmtDateTime(a.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
