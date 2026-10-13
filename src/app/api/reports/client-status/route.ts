import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { clientStatusRows, FLAGS } from "@/lib/client-status";
import { buildWorkbook, xlDate, xlsxResponse } from "@/lib/excel";
import { PRIORITY_LABEL, riyadhParts, STATUS_LABEL, todayRiyadh } from "@/lib/meetings";
import { BD_STAGE_LABELS } from "@/lib/queries";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const p = new URL(req.url).searchParams;
  const rows = (await clientStatusRows(session.user))
    .filter((r) => !p.get("flag") || r.flag === p.get("flag"))
    .filter((r) => !p.get("stage") || r.bdStage === p.get("stage"))
    .filter((r) => !p.get("owner") || String(r.ownerId) === p.get("owner"))
    .filter((r) => !p.get("q") || r.name.toLowerCase().includes(p.get("q")!.toLowerCase()));
  const buf = await buildWorkbook({
    sheet: "Client Status",
    title: "ERAM HOLDINGS | CLIENT STATUS",
    subtitle: `As of ${todayRiyadh()} · ${rows.length} clients`,
    columns: [
      { header: "Client / Company", width: 26 },
      { header: "Country / Location", width: 20 },
      { header: "Account Owner", width: 20 },
      { header: "BD Stage", width: 14 },
      { header: "Status", width: 20 },
      { header: "Priority", width: 10 },
      { header: "Last Meeting", width: 14 },
      { header: "Last Meeting Status", width: 16 },
      { header: "Next Meeting", width: 14 },
      { header: "Next Action", width: 40 },
      { header: "Action Owner", width: 22 },
      { header: "Follow-up Date", width: 14 },
      { header: "Agreed Actions", width: 10 },
      { header: "Meetings (done / total)", width: 14 },
    ],
    rows: rows.map((r) => [
      r.name,
      r.location,
      r.owner,
      r.bdStage ? BD_STAGE_LABELS[r.bdStage] : null,
      FLAGS[r.flag].label,
      r.priority ? PRIORITY_LABEL[r.priority] : null,
      r.last ? xlDate(riyadhParts(r.last.at).date) : null,
      r.last ? STATUS_LABEL[r.last.status] : null,
      r.next ? xlDate(riyadhParts(r.next.at).date) : r.waiting ? "To be scheduled" : null,
      r.nextAction,
      r.actionOwners,
      xlDate(r.followUp),
      r.agreedActions,
      `${r.completed} / ${r.meetings}`,
    ]),
  });
  return xlsxResponse(buf, `ERAM_Client_Status_${todayRiyadh()}.xlsx`);
}
