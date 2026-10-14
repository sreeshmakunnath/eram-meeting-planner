import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildWorkbook, xlDate, xlsxResponse } from "@/lib/excel";
import { PRIORITY_LABEL, todayRiyadh } from "@/lib/meetings";
import { listTasks, type TaskFilters } from "@/lib/task-queries";
import { CATEGORY_LABEL, TASK_STATUS_LABEL } from "@/lib/tasks";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const f = Object.fromEntries(new URL(req.url).searchParams) as TaskFilters;
  const rows = await listTasks(session.user, f, 5000);
  const buf = await buildWorkbook({
    sheet: "Tasks",
    title: "ERAM HOLDINGS | TASKS",
    subtitle: `Exported ${todayRiyadh()} by ${session.user.name}`,
    columns: [
      { header: "Task", width: 40 },
      { header: "Category", width: 16 },
      { header: "Client", width: 22 },
      { header: "Assigned To", width: 28 },
      { header: "Group", width: 18 },
      { header: "Priority", width: 10 },
      { header: "Start", width: 12 },
      { header: "Due", width: 12 },
      { header: "Status", width: 14 },
      { header: "% Complete", width: 10 },
      { header: "Overdue", width: 9 },
      { header: "From Meeting Brief", width: 12 },
    ],
    rows: rows.map((r) => [
      r.title,
      CATEGORY_LABEL[r.category],
      r.client,
      r.assignees,
      r.groups,
      PRIORITY_LABEL[r.priority],
      xlDate(r.startDate),
      xlDate(r.dueDate),
      TASK_STATUS_LABEL[r.status],
      r.percent,
      r.overdue ? "Yes" : "",
      r.fromBrief ? "Yes" : "",
    ]),
  });
  return xlsxResponse(buf, `ERAM_Tasks_${todayRiyadh()}.xlsx`);
}
