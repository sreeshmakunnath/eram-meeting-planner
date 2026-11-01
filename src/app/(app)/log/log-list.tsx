import { Badge, Empty } from "@/components/ui";
import { ACTIVITY_LABEL, fmtMinutes, type LogRow } from "@/lib/daily-log";
import { fmtPlainDate } from "@/lib/meetings";

/** Compact list of daily log entries for a client or task page. */
export function LogList({ rows, empty }: { rows: LogRow[]; empty: string }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((r) => (
        <li key={r.id} className="px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{fmtPlainDate(r.logDate)}</span>
            <span>{r.user}</span>
            <Badge tone="blue">{ACTIVITY_LABEL[r.type]}</Badge>
            {r.minutes ? <span>{fmtMinutes(r.minutes)}</span> : null}
          </div>
          <p className="mt-1 whitespace-pre-wrap text-slate-800">{r.description}</p>
        </li>
      ))}
    </ul>
  );
}
