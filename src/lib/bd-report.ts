import { and, count, eq, gte, inArray, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import type { SessionUser } from "./auth";
import { riyadh, riyadhParts, todayRiyadh } from "./meetings";
import { completionDelta, OPEN_STATUSES, type TaskCategory } from "./tasks";
import { targetScheduleRows, type Cell, type ReportScope } from "./target-schedule";

export const BD_STEPS: { category: TaskCategory; cell: "research" | "mir" | "approach" | "followUp" }[] = [
  { category: "MARKET_RESEARCH", cell: "research" },
  { category: "MIR_REPORT", cell: "mir" },
  { category: "APPROACH", cell: "approach" },
  { category: "FOLLOW_UP", cell: "followUp" },
];

const addMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
};

/**
 * Monthly BD progress for one business unit (Admins) or for a manager's team (clients owned by them or anyone
 * under them): what was completed (and whether on time) during the month, what is overdue, meetings held and BD
 * stage changes. `ym` is "2026-10".
 */
export async function bdMonthlyReport(me: SessionUser, scope: ReportScope, ym: string) {
  const first = `${ym}-01`;
  const next = `${addMonth(ym)}-01`;
  const lastDay = new Date(Date.parse(`${next}T00:00:00Z`) - 86400_000).toISOString().slice(0, 10);
  const today = todayRiyadh();
  const asOf = today < lastDay ? today : lastDay; // overdue is judged at the month's end, or today for the current month
  const inMonth = (d: Date | null) => !!d && riyadhParts(d).date >= first && riyadhParts(d).date < next;

  const rows = await targetScheduleRows(me, undefined, scope);
  const ids = rows.map((r) => r.id);

  const steps = rows.flatMap((r) =>
    BD_STEPS.map((s) => ({ client: r.name, clientId: r.id, category: s.category, cell: r[s.cell] as Cell })).filter((x): x is typeof x & { cell: NonNullable<Cell> } => !!x.cell),
  );
  const completed = steps
    .filter((x) => x.cell.status === "COMPLETED" && inMonth(x.cell.completedAt))
    .map((x) => ({ ...x, delta: completionDelta(x.cell.due, x.cell.completedAt) }))
    .sort((a, b) => a.cell.completedAt!.getTime() - b.cell.completedAt!.getTime());
  const overdue = steps
    .filter((x) => OPEN_STATUSES.includes(x.cell.status) && !!x.cell.due && x.cell.due < asOf)
    .map((x) => ({ ...x, daysLate: Math.round((Date.parse(asOf) - Date.parse(x.cell.due!)) / 86400_000) }))
    .sort((a, b) => b.daysLate - a.daysLate);
  const dueInMonth = steps.filter((x) => !!x.cell.due && x.cell.due >= first && x.cell.due < next);

  const m = schema.meetings;
  const [meetings, stageChanges] = ids.length
    ? await Promise.all([
        db
          .select({ clientId: m.clientId, n: count() })
          .from(m)
          .where(and(inArray(m.clientId, ids), eq(m.status, "COMPLETED"), gte(m.startAt, riyadh(first, "00:00")), lt(m.startAt, riyadh(next, "00:00"))))
          .groupBy(m.clientId),
        db
          .select({ clientId: schema.auditLogs.entityId, at: schema.auditLogs.createdAt, details: schema.auditLogs.details, by: schema.users.fullName })
          .from(schema.auditLogs)
          .leftJoin(schema.users, eq(schema.auditLogs.userId, schema.users.id))
          .where(
            and(
              eq(schema.auditLogs.entity, "client"),
              eq(schema.auditLogs.action, "CLIENT_STAGE_CHANGED"),
              inArray(schema.auditLogs.entityId, ids),
              gte(schema.auditLogs.createdAt, riyadh(first, "00:00")),
              lt(schema.auditLogs.createdAt, riyadh(next, "00:00")),
            ),
          )
          .orderBy(schema.auditLogs.createdAt),
      ])
    : [[], []];
  const meetingsBy = new Map(meetings.map((x) => [x.clientId!, x.n]));

  return {
    period: { ym, first, lastDay, asOf },
    rows: rows.map((r) => ({ ...r, meetings: meetingsBy.get(r.id) ?? 0 })),
    completed,
    overdue,
    stageChanges: stageChanges.map((s) => ({
      ...s,
      client: rows.find((r) => r.id === s.clientId)?.name ?? "—",
      ...((s.details ?? {}) as { from?: string | null; to?: string | null }),
    })),
    totals: {
      clients: rows.length,
      notStarted: rows.filter((r) => !r.hasTasks).length,
      dueInMonth: dueInMonth.length,
      dueInMonthDone: dueInMonth.filter((x) => x.cell.status === "COMPLETED").length,
      completed: completed.length,
      onTime: completed.filter((x) => x.delta !== null && x.delta <= 0).length,
      overdue: overdue.length,
      meetings: meetings.reduce((a, x) => a + x.n, 0),
      fullyDone: rows.filter((r) => BD_STEPS.every((s) => r[s.cell]?.status === "COMPLETED")).length,
    },
  };
}
