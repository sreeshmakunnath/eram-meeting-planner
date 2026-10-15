import Link from "next/link";

// Chart pieces for the Admin dashboard. Plain HTML + Tailwind, rendered on the server.
// Hover/focus tooltips are CSS-only; every value is also printed as a label or in a list,
// so nothing depends on hovering.

const SERIES = "#2E75B6"; // ERAM blue: single-series bars
const GRID = "#e5e7eb";

/** Small hover/focus tooltip; the trigger must have `group relative` and tabIndex. */
function Tip({ children }: { children: React.ReactNode }) {
  return (
    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow-lg group-hover:block group-focus:block">
      {children}
    </span>
  );
}

export function KpiTile({ label, value, note, delta, href }: { label: string; value: number; note?: React.ReactNode; delta?: { value: number; vs: string }; href?: string }) {
  const body = (
    <div className="card h-full p-4 transition hover:border-brand/40">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-bold text-navy">{value.toLocaleString("en-GB")}</div>
      {delta && (
        <div className="mt-1 text-xs text-slate-500">
          <span className={delta.value > 0 ? "font-semibold text-emerald-700" : delta.value < 0 ? "font-semibold text-red-700" : "font-semibold"}>
            {delta.value > 0 ? "▲ " : delta.value < 0 ? "▼ " : ""}
            {delta.value > 0 ? "+" : ""}
            {delta.value}
          </span>{" "}
          vs {delta.vs}
        </div>
      )}
      {note && <div className="mt-1 text-xs text-slate-500">{note}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

/** Column chart: one series, one bar per month, value on the cap, current month marked. */
export function MonthColumns({ points, currentKey }: { points: { key: string; label: string; held: number }[]; currentKey: string }) {
  const max = Math.max(1, ...points.map((p) => p.held));
  const step = max <= 4 ? 1 : Math.ceil(max / 4);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  return (
    <div className="pt-5">
      <div className="flex gap-2">
        {/* y-axis ticks */}
        <div className="relative h-44 w-6 shrink-0 text-right text-[11px] tabular-nums text-slate-400">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 translate-y-1/2 leading-none" style={{ bottom: `${(t / top) * 100}%` }}>
              {t}
            </span>
          ))}
        </div>
        <div className="relative h-44 flex-1">
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t" style={{ bottom: `${(t / top) * 100}%`, borderColor: t === 0 ? "#cbd5e1" : GRID }} />
          ))}
          <div className="absolute inset-0 flex items-end">
            {points.map((p) => (
              <div key={p.key} tabIndex={0} className="group relative flex h-full flex-1 items-end justify-center px-px outline-none focus-visible:bg-brand-50">
                <Tip>
                  {p.label} {p.key.slice(0, 4)}: {p.held} meeting{p.held === 1 ? "" : "s"} held{p.key === currentKey ? " (so far)" : ""}
                </Tip>
                <div className="relative w-full max-w-[24px]" style={{ height: `${(p.held / top) * 100}%` }}>
                  {p.held > 0 && <span className="absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 text-[11px] font-semibold text-slate-600">{p.held}</span>}
                  <div className="h-full w-full rounded-t-[4px] transition-opacity group-hover:opacity-80" style={{ background: SERIES }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* x-axis labels */}
      <div className="ml-8 flex">
        {points.map((p) => (
          <div key={p.key} className={`flex-1 pt-1.5 text-center text-[11px] ${p.key === currentKey ? "font-semibold text-navy" : "text-slate-500"}`}>
            {p.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Part-to-whole: one stacked bar (2px gaps) with a legend that lists every count and links through. */
export function StackedShare({ items, total }: { items: { key: string; label: string; n: number; color: string; href: string }[]; total: number }) {
  return (
    <div>
      <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-[4px] bg-slate-100">
        {items
          .filter((i) => i.n > 0)
          .map((i) => (
            <Link key={i.key} href={i.href} tabIndex={0} className="group relative h-full outline-none" style={{ width: `${(i.n / Math.max(1, total)) * 100}%`, background: i.color }}>
              <Tip>
                {i.label}: {i.n} ({Math.round((i.n / Math.max(1, total)) * 100)}%)
              </Tip>
            </Link>
          ))}
      </div>
      <ul className="mt-4 divide-y divide-slate-100 text-sm">
        {items.map((i) => (
          <li key={i.key}>
            <Link href={i.href} className="flex items-center gap-3 py-1.5 hover:bg-slate-50">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: i.color }} aria-hidden />
              <span className="flex-1 text-slate-700">{i.label}</span>
              <span className="w-10 text-right font-semibold tabular-nums text-navy">{i.n}</span>
              <span className="w-10 text-right text-xs tabular-nums text-slate-400">{total ? Math.round((i.n / total) * 100) : 0}%</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal bars for an ordered scale (the BD funnel): one blue hue, lighter → darker by stage. */
export function OrderedBars({ items }: { items: { key: string; label: string; n: number; href: string }[] }) {
  const RAMP = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281"]; // validated ordinal ramp
  const max = Math.max(1, ...items.map((i) => i.n));
  return (
    <ul className="space-y-2.5 text-sm">
      {items.map((i, idx) => (
        <li key={i.key}>
          <Link href={i.href} tabIndex={0} className="group relative grid grid-cols-[7rem_1fr] items-center gap-3 outline-none">
            <span className="truncate text-slate-700 group-hover:underline">{i.label}</span>
            <span className="flex items-center gap-2">
              <span
                className="h-4 rounded-r-[4px] transition-opacity group-hover:opacity-80"
                style={{ width: `${(i.n / max) * 85}%`, minWidth: i.n ? 3 : 0, background: RAMP[Math.min(idx, RAMP.length - 1)] }}
              />
              <span className="font-semibold tabular-nums text-navy">{i.n}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Table with an inline bar per measure; each column is scaled to its own maximum. */
export function BuTable({ rows }: { rows: { id: number | null; name: string; users: number; held: number; clients: number }[] }) {
  const max = {
    users: Math.max(1, ...rows.map((r) => r.users)),
    held: Math.max(1, ...rows.map((r) => r.held)),
    clients: Math.max(1, ...rows.map((r) => r.clients)),
  };
  const cols = [
    { key: "users", label: "Active users", color: "#2E75B6" },
    { key: "held", label: "Meetings held · 12 mo", color: "#1F3864" },
    { key: "clients", label: "Clients", color: "#7ba7d1" },
  ] as const;
  if (!rows.length) return <p className="text-sm text-slate-500">No business units set up yet. Add them under Admin → Masters.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-4">Business unit</th>
            {cols.map((c) => (
              <th key={c.key} className="py-2 pr-4">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: c.color }} aria-hidden />
                  {c.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.id ?? "none"} className={r.id === null ? "text-slate-500" : ""}>
              <td className="py-2 pr-4 font-medium text-slate-700">{r.name}</td>
              {cols.map((c) => (
                <td key={c.key} className="w-1/4 py-2 pr-4">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 flex-1 rounded-full bg-slate-100">
                      <div className="h-full rounded-full" style={{ width: `${(r[c.key] / max[c.key]) * 100}%`, background: c.color }} />
                    </div>
                    <span className="w-8 text-right font-semibold tabular-nums text-navy">{r[c.key]}</span>
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
