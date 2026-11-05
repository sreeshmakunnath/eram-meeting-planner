import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ACTIVITY_LABEL, defaultRange, listLogs, logWhere, type LogFilters } from "@/lib/daily-log";
import { buildWorkbook, xlDate, xlsxResponse } from "@/lib/excel";
import { todayRiyadh } from "@/lib/meetings";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const f = Object.fromEntries(new URL(req.url).searchParams) as LogFilters;
  const range = defaultRange();
  const rows = await listLogs(logWhere(session.user, f), 10000);
  const buf = await buildWorkbook({
    sheet: "Daily log",
    title: "ERAM HOLDINGS | DAILY ACTIVITY LOG",
    subtitle: `${f.from || range.from} to ${f.to || range.to} · exported ${todayRiyadh()} by ${session.user.name}`,
    columns: [
      { header: "Date", width: 12 },
      { header: "Person", width: 22 },
      { header: "Business Unit", width: 18 },
      { header: "Type", width: 20 },
      { header: "Entry", width: 10 },
      { header: "Activity", width: 60 },
      { header: "Hours", width: 8 },
      { header: "Client", width: 24 },
      { header: "Task", width: 30 },
      { header: "Meeting", width: 30 },
    ],
    rows: rows.map((r) => [
      xlDate(r.logDate),
      r.user,
      r.businessUnit,
      ACTIVITY_LABEL[r.type],
      r.system ? "System" : "Written",
      r.description,
      r.minutes ? Math.round((r.minutes / 60) * 100) / 100 : null,
      r.client,
      r.task,
      r.meeting,
    ]),
  });
  return xlsxResponse(buf, `ERAM_Daily_Log_${todayRiyadh()}.xlsx`);
}
