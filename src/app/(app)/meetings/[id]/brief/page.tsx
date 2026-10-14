import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge, fmtDateTime, Notice, PageHeader, Tabs } from "@/components/ui";
import { db, schema } from "@/db";
import { reopenBrief, saveBrief } from "@/lib/actions/briefs";
import { requireUser } from "@/lib/auth";
import { canEditMeeting, canView, canWriteBrief, fmtDay, fmtPlainDate, fmtTime, MODE_LABEL } from "@/lib/meetings";
import { activeGroups } from "@/lib/queries";
import { TASK_STATUS_LABEL, TASK_STATUS_TONE } from "@/lib/tasks";
import { BriefForm } from "./brief-form";

export default async function BriefPage({ params, searchParams }: { params: { id: string }; searchParams: { msg?: string } }) {
  const me = await requireUser();
  const id = Number(params.id);
  if (!Number.isInteger(id)) notFound();
  const m = await db.query.meetings.findFirst({
    where: eq(schema.meetings.id, id),
    with: {
      client: { columns: { name: true } },
      contacts: { with: { contact: { columns: { name: true, designation: true } } } },
      attendees: { with: { user: { columns: { id: true, fullName: true } } } },
      businessUnits: { with: { businessUnit: { columns: { name: true } } } },
      brief: { with: { actions: { orderBy: (a, { asc }) => [asc(a.position)], with: { owner: { columns: { fullName: true } }, ownerGroup: { columns: { name: true } } } }, submittedBy: { columns: { fullName: true } } } },
    },
  });
  if (!m) notFound();
  if (!(await canView(me, id))) redirect("/meetings");
  const writable = !!(await canWriteBrief(me, id));
  const b = m.brief;
  const base = `/meetings/${id}`;

  const header = [
    { k: "Client / Company", v: m.client?.name ?? "Internal" },
    { k: "Meeting date & time", v: m.startAt ? `${fmtDay(m.startAt)}, ${fmtTime(m.startAt)}–${fmtTime(m.endAt)}` : "Not set" },
    { k: "Location / Platform", v: [m.location, MODE_LABEL[m.mode], m.venue].filter(Boolean).join(" · ") },
    { k: "Meeting objective", v: m.objective },
    { k: "Relevant ERAM BUs", v: m.businessUnits.map((x) => x.businessUnit.name).join("; ") },
  ];
  const tabs = (
    <Tabs
      active={`${base}/brief`}
      items={[
        { href: `${base}?tab=details`, label: "Details" },
        { href: `${base}/brief`, label: b?.status === "SUBMITTED" ? "Meeting Brief ✓" : "Meeting Brief" },
        { href: `${base}?tab=activity`, label: "Activity" },
      ]}
    />
  );

  if (b?.status === "SUBMITTED") {
    const linked = await db
      .select({ id: schema.tasks.id, actionId: schema.tasks.sourceActionId, status: schema.tasks.status })
      .from(schema.tasks)
      .where(eq(schema.tasks.sourceBriefId, b.id));
    return (
      <>
        <PageHeader
          title={m.title}
          subtitle={`Brief submitted by ${b.submittedBy?.fullName ?? "—"} on ${fmtDateTime(b.submittedAt)} · version ${b.version}`}
          actions={
            <>
              <Link href={`/meetings-print/${id}`} target="_blank" className="btn-secondary">
                Print / Save as PDF
              </Link>
              {canEditMeeting(me, m) && (
                <form action={reopenBrief.bind(null, id)}>
                  <button className="btn-secondary">Reopen for edits</button>
                </form>
              )}
            </>
          }
        />
        {tabs}
        <div className="card divide-y divide-slate-100 px-6 py-2 text-sm">
          {[
            ...header.map((h) => [h.k, h.v] as const),
            ["Client attendees", b.clientAttendees],
            ["ERAM attendees", m.attendees.filter((a) => a.attended !== false).map((a) => a.user.fullName).join(", ")],
            ["Key discussion points", b.discussionPoints],
            ["Documents / presentation used", b.documentsUsed],
            ["Key outcomes / opportunities", b.outcomes],
          ].map(([k, v]) => (
            <div key={k} className="grid gap-2 py-3 md:grid-cols-4">
              <div className="font-semibold text-navy">{k}</div>
              <div className="whitespace-pre-wrap md:col-span-3">{v || "—"}</div>
            </div>
          ))}
          <div className="grid gap-2 py-3 md:grid-cols-4">
            <div className="font-semibold text-navy">Agreed actions</div>
            <div className="md:col-span-3">
              {b.actions.length ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-slate-500">
                      <th className="pb-1">Action</th>
                      <th className="pb-1">Owner</th>
                      <th className="pb-1">Deadline</th>
                      <th className="pb-1">Task</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.actions.map((a) => (
                      <tr key={a.id} className="border-t border-slate-100">
                        <td className="py-1.5 pr-3">{a.action}</td>
                        <td className="py-1.5 pr-3">{a.owner?.fullName ?? a.ownerGroup?.name ?? "—"}</td>
                        <td className="py-1.5 pr-3">{a.deadline ? fmtPlainDate(a.deadline) : "—"}</td>
                        <td className="py-1.5">
                          {(() => {
                            const t = linked.find((x) => x.actionId === a.id);
                            return t ? (
                              <Link href={`/tasks/${t.id}`}>
                                <Badge tone={TASK_STATUS_TONE[t.status]}>{TASK_STATUS_LABEL[t.status]}</Badge>
                              </Link>
                            ) : (
                              "—"
                            );
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                "—"
              )}
            </div>
          </div>
          <div className="grid gap-2 py-3 md:grid-cols-4">
            <div className="font-semibold text-navy">Next follow-up date</div>
            <div className="md:col-span-3">
              {b.nextFollowUpDate ? fmtPlainDate(b.nextFollowUpDate) : "—"}
              {b.followUpMeetingId && (
                <Link href={`/meetings/${b.followUpMeetingId}`} className="link ml-3">
                  Open follow-up meeting <Badge tone="amber">To Be Scheduled</Badge>
                </Link>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!writable) {
    return (
      <>
        <PageHeader title={m.title} />
        {tabs}
        <Notice tone="info">The Meeting Brief hasn&apos;t been submitted yet. The organiser or an attendee writes it after the meeting.</Notice>
      </>
    );
  }

  const [users, groups] = await Promise.all([
    db.select({ id: schema.users.id, fullName: schema.users.fullName }).from(schema.users).where(eq(schema.users.status, "ACTIVE")).orderBy(asc(schema.users.fullName)),
    activeGroups(),
  ]);
  const owners = [...users.map((u) => ({ value: `u:${u.id}`, label: u.fullName })), ...groups.map((g) => ({ value: `g:${g.id}`, label: `Group: ${g.name}` }))];
  const contacts = [...m.contacts.map((c) => c.contact.name + (c.contact.designation ? ` (${c.contact.designation})` : "")), m.clientContactsText].filter(Boolean).join("; ");

  return (
    <>
      <PageHeader title={m.title} subtitle={b ? `Draft · version ${b.version}` : "ERAM Holdings | Meeting Brief"} />
      {tabs}
      {searchParams.msg === "completed" && <Notice tone="ok">Meeting marked completed. Write the brief while it&apos;s fresh.</Notice>}
      {searchParams.msg === "denied" && <Notice tone="error">Only the organiser or an Admin can reopen a submitted brief.</Notice>}
      <BriefForm
        action={saveBrief}
        header={header}
        owners={owners}
        attendees={m.attendees.map((a) => ({ userId: a.userId, name: a.user.fullName, attended: a.attended })).sort((x, y) => x.name.localeCompare(y.name))}
        defaults={{
          meetingId: id,
          clientAttendees: b?.clientAttendees ?? contacts,
          discussionPoints: b?.discussionPoints ?? "",
          outcomes: b?.outcomes ?? "",
          documentsUsed: b?.documentsUsed ?? m.documents ?? "",
          nextFollowUpDate: b?.nextFollowUpDate?.slice(0, 10) ?? m.followUpDate?.slice(0, 10) ?? "",
          actions: (b?.actions ?? []).map((a) => ({
            id: a.id,
            action: a.action,
            owner: a.ownerUserId ? `u:${a.ownerUserId}` : a.ownerGroupId ? `g:${a.ownerGroupId}` : "",
            deadline: a.deadline?.slice(0, 10) ?? "",
          })),
        }}
      />
    </>
  );
}
