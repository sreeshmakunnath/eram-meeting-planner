import Link from "next/link";
import { Badge, Empty } from "@/components/ui";
import type { TaskRow } from "@/lib/task-queries";
import { fmtPlainDate } from "@/lib/meetings";
import { TASK_STATUS_LABEL, TASK_STATUS_TONE } from "@/lib/tasks";

/** Compact task list used on client, group, meeting pages and the dashboard. */
export function TaskMiniList({ rows, empty, newHref }: { rows: TaskRow[]; empty: string; newHref?: string }) {
  return (
    <div>
      {rows.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <ul className="divide-y divide-slate-100 text-sm">
          {rows.map((t) => (
            <li key={t.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
              <span>
                <Link href={`/tasks/${t.id}`} className="link">
                  {t.title}
                </Link>
                <span className="block text-xs text-slate-500">
                  {t.assignees || "Unassigned"}
                  {t.dueDate && (
                    <>
                      {" · "}
                      <span className={t.overdue ? "font-semibold text-red-600" : ""}>due {fmtPlainDate(t.dueDate)}</span>
                    </>
                  )}
                </span>
              </span>
              <Badge tone={TASK_STATUS_TONE[t.status]}>{TASK_STATUS_LABEL[t.status]}</Badge>
            </li>
          ))}
        </ul>
      )}
      {newHref && (
        <div className="border-t border-slate-100 px-4 py-2">
          <Link href={newHref} className="link text-sm">
            + Add task
          </Link>
        </div>
      )}
    </div>
  );
}
