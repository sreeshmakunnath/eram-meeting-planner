/** A scrollable list of checkboxes, used for multi-select (groups, members, business units). */
export function CheckboxList({
  name,
  options,
  selected,
  empty = "Nothing to choose yet.",
}: {
  name: string;
  options: { id: number; label: string; hint?: string }[];
  selected: number[];
  empty?: string;
}) {
  if (!options.length) return <div className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500">{empty}</div>;
  return (
    <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border border-slate-300 bg-white p-2">
      {options.map((o) => (
        <label key={o.id} className="flex cursor-pointer items-start gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
          <input type="checkbox" name={name} value={o.id} defaultChecked={selected.includes(o.id)} className="mt-0.5 accent-brand" />
          <span>
            {o.label}
            {o.hint && <span className="block text-xs text-slate-500">{o.hint}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}
