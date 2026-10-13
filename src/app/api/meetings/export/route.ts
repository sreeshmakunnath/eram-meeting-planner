import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildWorkbook, xlDate, xlsxResponse } from "@/lib/excel";
import { listMeetings, type MeetingFilters } from "@/lib/meeting-queries";
import { fmtTime, PRIORITY_LABEL, riyadhParts, STATUS_LABEL, TYPE_LABEL, todayRiyadh } from "@/lib/meetings";

/** The Client Meeting Planner as an Excel file — same columns as the ERAM Holdings sheet. */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const f = Object.fromEntries(new URL(req.url).searchParams) as MeetingFilters;
  const rows = await listMeetings(session.user, f, 5000);
  const buf = await buildWorkbook({
    sheet: "Meeting Planner",
    title: "ERAM HOLDINGS | CLIENT MEETING PLANNER",
    subtitle: `Exported ${todayRiyadh()} by ${session.user.name}`,
    columns: [
      { header: "Priority", width: 10 },
      { header: "Client / Company", width: 24 },
      { header: "Country / Location", width: 20 },
      { header: "Client Contact", width: 24 },
      { header: "ERAM Attendees", width: 26 },
      { header: "Meeting Type", width: 16 },
      { header: "Proposed Date", width: 14 },
      { header: "Proposed Time", width: 14 },
      { header: "Status", width: 16 },
      { header: "Meeting Objective / Agenda", width: 40 },
      { header: "Relevant Business Units", width: 28 },
      { header: "Presentation / Documents", width: 34 },
      { header: "Next Action", width: 34 },
      { header: "Action Owner", width: 22 },
      { header: "Follow-up Date", width: 14 },
      { header: "Notes", width: 30 },
    ],
    rows: rows.map((r) => [
      PRIORITY_LABEL[r.priority],
      r.client ?? r.title,
      r.location,
      r.clientContacts,
      r.attendees,
      TYPE_LABEL[r.type],
      r.startAt ? xlDate(riyadhParts(r.startAt).date) : null,
      r.startAt ? `${fmtTime(r.startAt)}–${fmtTime(r.endAt)}` : null,
      STATUS_LABEL[r.status],
      r.objective,
      r.businessUnits,
      r.documents,
      r.nextAction,
      r.owners,
      xlDate(r.followUpDate),
      r.notes,
    ]),
  });
  return xlsxResponse(buf, `ERAM_Meeting_Planner_${todayRiyadh()}.xlsx`);
}
