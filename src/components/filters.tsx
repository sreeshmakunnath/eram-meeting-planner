import Link from "next/link";

/**
 * A filter row: labelled fields side by side (wrapping on small screens), an Apply button, and a
 * "Clear" link once any filter is set. `keep` carries values that aren't fields (tab, view, month…).
 */
export function FilterBar({
  children,
  clearHref,
  active = 0,
  keep = {},
}: {
  children: React.ReactNode;
  clearHref: string;
  active?: number;
  keep?: Record<string, string | undefined | null>;
}) {
  return (
    <form className="card mb-4 px-4 py-3">
      {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        {children}
        <div className="ml-auto flex items-center gap-3">
          {active > 0 && (
            <Link href={clearHref} className="text-sm text-slate-500 hover:text-navy hover:underline">
              Clear ({active})
            </Link>
          )}
          <button className="btn-primary">Apply</button>
        </div>
      </div>
    </form>
  );
}

const WIDTH = { sm: "sm:w-36", md: "sm:w-48", lg: "sm:w-64" } as const;

/** One labelled filter. The label says what it filters, so the first option can just read "All" / "Any". */
export function FilterField({ label, children, size = "md" }: { label: string; children: React.ReactNode; size?: keyof typeof WIDTH }) {
  return (
    <label className={`flex w-full flex-col gap-1 ${WIDTH[size]}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

/** How many of these search params are set (and differ from their default). */
export const countActive = (params: Record<string, string | undefined>, keys: string[], defaults: Record<string, string> = {}) =>
  keys.filter((k) => params[k] && params[k] !== defaults[k]).length;
