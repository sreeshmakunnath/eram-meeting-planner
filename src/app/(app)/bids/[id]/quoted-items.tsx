"use client";
import { useState } from "react";

export type QuotedItem = { description: string; unit: string | null; quantity: number | null; unitPrice: number | null };
type Row = { key: number; description: string; unit: string; quantity: string; unitPrice: string };

const UNITS = ["Per head / month", "Per head / day", "Per hour", "Per month", "Per day", "Lump sum", "Each"];
const SUGGESTIONS = [
  "Manpower supply – skilled",
  "Manpower supply – semi-skilled",
  "Manpower supply – unskilled",
  "Engineering services",
  "Inspection / QA-QC services",
  "Maintenance services",
  "Facility management",
  "Equipment rental",
  "Mobilisation",
  "Accommodation and transport",
];

const n = (s: string) => {
  const v = Number(s.replace(/[,\s$]/g, ""));
  return s.trim() && Number.isFinite(v) ? v : null;
};
const usd = (v: number) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
let next = 1;

/**
 * Quoted items: optional lines of item / service, unit, quantity and unit price (USD). Submitted with the
 * Commercial form as parallel `item*` fields; blank lines are ignored.
 */
export function QuotedItems({ items, disabled }: { items: QuotedItem[]; disabled?: boolean }) {
  const [rows, setRows] = useState<Row[]>(() =>
    items.map((i) => ({ key: next++, description: i.description, unit: i.unit ?? "", quantity: i.quantity?.toString() ?? "", unitPrice: i.unitPrice?.toString() ?? "" })),
  );
  const set = (key: number, k: keyof Omit<Row, "key">, v: string) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [k]: v } : r)));
  const add = () => setRows((rs) => [...rs, { key: next++, description: "", unit: "", quantity: "", unitPrice: "" }]);
  const lineTotal = (r: Row) => {
    const p = n(r.unitPrice);
    return p === null ? null : p * (n(r.quantity) ?? 1);
  };
  const total = rows.reduce((a, r) => a + (lineTotal(r) ?? 0), 0);

  return (
    <section className="card p-4 xl:col-span-3">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Quoted items (optional)</h3>
        <span className="text-xs text-slate-500">Services or positions quoted, with unit prices in USD. Leave a line&apos;s quantity blank for a rate only.</span>
      </div>
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="w-8 pb-1">#</th>
                <th className="pb-1 pr-2">Item / service</th>
                <th className="w-44 pb-1 pr-2">Unit</th>
                <th className="w-24 pb-1 pr-2">Qty</th>
                <th className="w-36 pb-1 pr-2">Unit price</th>
                <th className="w-32 pb-1 text-right">Total</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const t = lineTotal(r);
                return (
                  <tr key={r.key}>
                    <td className="py-1 text-xs text-slate-400">{i + 1}</td>
                    <td className="py-1 pr-2">
                      <input name="itemDescription" className="input" list="item-suggestions" value={r.description} maxLength={300} onChange={(e) => set(r.key, "description", e.target.value)} disabled={disabled} />
                    </td>
                    <td className="py-1 pr-2">
                      <input name="itemUnit" className="input" list="item-units" value={r.unit} maxLength={50} onChange={(e) => set(r.key, "unit", e.target.value)} disabled={disabled} />
                    </td>
                    <td className="py-1 pr-2">
                      <input name="itemQuantity" className="input tabular-nums" inputMode="decimal" value={r.quantity} onChange={(e) => set(r.key, "quantity", e.target.value)} disabled={disabled} />
                    </td>
                    <td className="py-1 pr-2">
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                        <input name="itemUnitPrice" className="input pl-7 tabular-nums" inputMode="decimal" value={r.unitPrice} onChange={(e) => set(r.key, "unitPrice", e.target.value)} disabled={disabled} />
                      </div>
                    </td>
                    <td className="py-1 text-right tabular-nums text-slate-700">{t === null ? "—" : usd(t)}</td>
                    <td className="py-1 text-right">
                      {!disabled && (
                        <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="rounded px-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove line ${i + 1}`}>
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200">
                <td colSpan={5} className="pt-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Items total
                </td>
                <td className="pt-2 text-right font-semibold tabular-nums text-navy">{usd(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {rows.length === 0 && <p className="text-sm text-slate-500">No items yet.</p>}
      {!disabled && (
        <button type="button" onClick={add} className="btn-secondary mt-3">
          + Add item
        </button>
      )}
      <datalist id="item-units">
        {UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <datalist id="item-suggestions">
        {SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </section>
  );
}
