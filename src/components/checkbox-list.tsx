"use client";

import { useState } from "react";

/** Lists longer than this get a search box and a row of chips showing who is ticked. */
const SEARCH_FROM = 5;

/**
 * A scrollable list of checkboxes, used for multi-select (people, groups, members, business units).
 * Long lists get a search box that filters by label and hint (e.g. name or email), and the ticked
 * options show as chips above the list so they stay visible while searching. Options hidden by the
 * search stay in the form, so ticked ones are still submitted.
 *
 * Pass onChange to control it from the parent (the parent then owns `selected`); without it the list
 * keeps its own state, starting from `selected`.
 */
export function CheckboxList({
  name,
  options,
  selected,
  onChange,
  empty = "Nothing to choose yet.",
}: {
  name: string;
  options: { id: number; label: string; hint?: string }[];
  selected: number[];
  onChange?: (ids: number[]) => void;
  empty?: string;
}) {
  const [own, setOwn] = useState<number[]>(selected);
  const checked = onChange ? selected : own;
  const setChecked = (next: (c: number[]) => number[]) => (onChange ? onChange(next(selected)) : setOwn(next));
  const [query, setQuery] = useState("");
  if (!options.length) return <div className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500">{empty}</div>;

  const searchable = options.length > SEARCH_FROM;
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (o: (typeof options)[number]) => {
    const text = `${o.label} ${o.hint ?? ""}`.toLowerCase();
    return terms.every((t) => text.includes(t));
  };
  const shown = options.filter(matches).length;
  const toggle = (id: number, on: boolean) => setChecked((c) => (on ? [...c, id] : c.filter((x) => x !== id)));
  const picked = options.filter((o) => checked.includes(o.id));

  return (
    <div className="rounded-md border border-slate-300 bg-white">
      {searchable && (
        <div className="space-y-2 border-b border-slate-200 p-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
            placeholder="Search…"
            aria-label="Search the list"
            className="input py-1 text-sm"
          />
          {picked.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-xs text-slate-500">{picked.length} selected:</span>
              {picked.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggle(o.id, false)}
                  aria-label={`Remove ${o.label}`}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-200"
                >
                  {o.label}
                  <span aria-hidden>×</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="max-h-60 space-y-1 overflow-y-auto p-2">
        {options.map((o) => (
          <label key={o.id} className={`${matches(o) ? "flex" : "hidden"} cursor-pointer items-start gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50`}>
            <input
              type="checkbox"
              name={name}
              value={o.id}
              checked={checked.includes(o.id)}
              onChange={(e) => toggle(o.id, e.target.checked)}
              className="mt-0.5 accent-brand"
            />
            <span>
              {o.label}
              {o.hint && <span className="block text-xs text-slate-500">{o.hint}</span>}
            </span>
          </label>
        ))}
        {shown === 0 && <div className="px-2 py-1 text-sm text-slate-500">No matches for “{query}”.</div>}
      </div>
    </div>
  );
}
