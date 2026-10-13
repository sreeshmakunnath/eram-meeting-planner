import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { fmtDateTime } from "@/components/ui";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { canView, fmtDay, fmtPlainDate, fmtTime, MODE_LABEL } from "@/lib/meetings";

export const dynamic = "force-dynamic";

/** Printable Meeting Brief in the layout of the ERAM Holdings "Meeting Brief" sheet. */
export default async function PrintBrief({ params }: { params: { id: string } }) {
  const me = await requireUser();
  const id = Number(params.id);
  if (!Number.isInteger(id)) notFound();
  if (!(await canView(me, id))) redirect("/meetings");
  const m = await db.query.meetings.findFirst({
    where: eq(schema.meetings.id, id),
    with: {
      client: { columns: { name: true } },
      contacts: { with: { contact: { columns: { name: true, designation: true } } } },
      attendees: { with: { user: { columns: { fullName: true } } } },
      businessUnits: { with: { businessUnit: { columns: { name: true } } } },
      brief: { with: { actions: { orderBy: (a, { asc }) => [asc(a.position)], with: { owner: { columns: { fullName: true } }, ownerGroup: { columns: { name: true } } } }, submittedBy: { columns: { fullName: true } } } },
    },
  });
  if (!m) notFound();
  const b = m.brief;
  const contacts = [...m.contacts.map((c) => c.contact.name + (c.contact.designation ? ` (${c.contact.designation})` : "")), m.clientContactsText].filter(Boolean).join("; ");
  const actions = b?.actions ?? [];
  const rows: [string, React.ReactNode][] = [
    ["Client / Company", m.client?.name ?? "Internal"],
    ["Meeting Date & Time", m.startAt ? `${fmtDay(m.startAt)}, ${fmtTime(m.startAt)}–${fmtTime(m.endAt)} (KSA)` : "—"],
    ["Location / Platform", [m.location, MODE_LABEL[m.mode], m.venue].filter(Boolean).join(" · ")],
    ["Client Attendees", b?.clientAttendees ?? contacts],
    ["ERAM Attendees", m.attendees.filter((a) => a.attended !== false).map((a) => a.user.fullName).join(", ")],
    ["Meeting Objective", m.objective],
    ["Key Discussion Points", b?.discussionPoints],
    ["Relevant ERAM Business Units", m.businessUnits.map((x) => x.businessUnit.name).join("; ")],
    ["Documents / Presentation Required", b?.documentsUsed ?? m.documents],
    ["Key Outcomes / Opportunities", b?.outcomes],
    ["Agreed Actions", actions.length ? <ol className="list-decimal pl-5">{actions.map((a) => <li key={a.id}>{a.action}</li>)}</ol> : null],
    [
      "Action Owner & Deadline",
      actions.length ? (
        <ol className="list-decimal pl-5">
          {actions.map((a) => (
            <li key={a.id}>
              {a.owner?.fullName ?? a.ownerGroup?.name ?? "—"} — {a.deadline ? fmtPlainDate(a.deadline) : "no deadline"}
            </li>
          ))}
        </ol>
      ) : null,
    ],
    ["Next Follow-up Date", b?.nextFollowUpDate ? fmtPlainDate(b.nextFollowUpDate) : null],
  ];

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-8 text-[13px] print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <a href={`/meetings/${id}/brief`} className="link text-sm">
          ← Back
        </a>
        <PrintButton />
      </div>
      <div className="bg-navy px-4 py-3 text-center text-lg font-bold tracking-wide text-white">ERAM HOLDINGS | MEETING BRIEF</div>
      <table className="w-full border-collapse">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th className="w-1/3 border border-slate-300 bg-navy-50 px-3 py-2 text-left align-top font-semibold text-navy">{k}</th>
              <td className="whitespace-pre-wrap border border-slate-300 px-3 py-2 align-top">{v || " "}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[11px] text-slate-500">
        {b?.status === "SUBMITTED" ? `Submitted by ${b.submittedBy?.fullName ?? "—"} on ${fmtDateTime(b.submittedAt)} · version ${b.version}` : "Draft — not yet submitted"}
      </p>
    </div>
  );
}
