import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildWorkbook, xlDate, xlsxResponse } from "@/lib/excel";
import { todayRiyadh } from "@/lib/meetings";
import { TASK_STATUS_LABEL } from "@/lib/tasks";
import { targetScheduleRows } from "@/lib/target-schedule";

/** The BD Target Schedule in the layout of the original sheet. */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const batch = new URL(req.url).searchParams.get("batch") ?? undefined;
  const rows = await targetScheduleRows(session.user, batch);
  const buf = await buildWorkbook({
    sheet: `${batch ?? "All"} Schedule`.slice(0, 31),
    title: `BD Target Companies - ${batch ?? "All Batches"} Schedule`,
    subtitle: `As of ${todayRiyadh()}`,
    columns: [
      { header: "#", width: 5 },
      { header: "Company", width: 26 },
      { header: "Location", width: 18 },
      { header: "Market Research Deadline", width: 16 },
      { header: "MIR Report Deadline", width: 16 },
      { header: "Research/MIR Owner", width: 20 },
      { header: "Research/MIR Status", width: 16 },
      { header: "Approach Deadline", width: 16 },
      { header: "Follow-up Deadline", width: 16 },
      { header: "Approach Owner", width: 20 },
      { header: "Approach Status", width: 16 },
      { header: "Notes", width: 30 },
    ],
    rows: rows.map((r, i) => [
      i + 1,
      r.name,
      r.location,
      xlDate(r.research?.due),
      xlDate(r.mir?.due),
      r.researchOwner,
      r.researchStatus ? TASK_STATUS_LABEL[r.researchStatus] : null,
      xlDate(r.approach?.due),
      xlDate(r.followUp?.due),
      r.approachOwner,
      r.approachStatus ? TASK_STATUS_LABEL[r.approachStatus] : null,
      r.notes,
    ]),
  });
  return xlsxResponse(buf, `BD_Target_Schedule_${(batch ?? "All").replace(/\s+/g, "_")}_${todayRiyadh()}.xlsx`);
}
