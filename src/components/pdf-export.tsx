"use client";
// PDF export for reports: the browser's print dialog ("Save as PDF") with the page laid out for paper.
// Portrait for narrow reports, landscape when a table is wide (many columns), unless the page says which.
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { Logo } from "@/components/logo";

type Orientation = "portrait" | "landscape";

/** Columns of the widest table on the page (cells of its header row, counting colspans). */
function widestTable(root: ParentNode) {
  let max = 0;
  root.querySelectorAll("table").forEach((t) => {
    const row = t.tHead?.rows[t.tHead.rows.length - 1] ?? t.rows[0];
    if (!row) return;
    const cols = [...row.cells].reduce((a, c) => a + (c.colSpan || 1), 0);
    max = Math.max(max, cols);
  });
  return max;
}

/** Wide tables (7+ columns) or anything marked data-print-wide need landscape. */
export function pickOrientation(root: ParentNode = document): Orientation {
  if (root.querySelector("[data-print-wide]")) return "landscape";
  return widestTable(root) >= 7 ? "landscape" : "portrait";
}

const pad = (n: number) => String(n).padStart(2, "0");

export function PdfButton({ title, orientation = "auto", label = "Export PDF" }: { title: string; orientation?: Orientation | "auto"; label?: string }) {
  const print = () => {
    const main = document.querySelector("main") ?? document;
    const o = orientation === "auto" ? pickOrientation(main) : orientation;
    const style = document.createElement("style");
    style.id = "pdf-page";
    style.textContent = `@page { size: A4 ${o}; margin: 10mm; }`;
    document.getElementById("pdf-page")?.remove();
    document.head.appendChild(style);
    document.documentElement.dataset.print = o;
    // The browser offers the page title as the PDF's file name
    const before = document.title;
    const d = new Date();
    document.title = `${title} ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const done = () => {
      document.title = before;
      style.remove();
      delete document.documentElement.dataset.print;
    };
    window.addEventListener("afterprint", done, { once: true });
    window.print();
  };
  return (
    <button type="button" onClick={print} className="btn-secondary print:hidden" title="Opens the print dialog: choose “Save as PDF”">
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path d="M6 2h6l4 4v12H6z" strokeLinejoin="round" />
        <path d="M12 2v4h4M9 10v5m0 0-2-2m2 2 2-2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </button>
  );
}

/** The filters in use, read from the page's filter forms (GET forms, not action forms) as "Label: value". */
function readFilters() {
  const parts: string[] = [];
  document.querySelectorAll<HTMLFormElement>("main form").forEach((f) => {
    if (f.querySelector('input[name^="$ACTION"]') || f.closest("table")) return; // a save form, not a filter
    if ((f.getAttribute("method") ?? "get").toLowerCase() !== "get") return;
    f.dataset.printFilters = "";
    f.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select").forEach((el) => {
      if (el.type === "hidden" || el.type === "submit" || !el.value) return;
      const label =
        el.closest("label")?.querySelector("span")?.textContent ??
        (el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent : null) ??
        el.getAttribute("aria-label") ??
        el.name;
      const value = el instanceof HTMLSelectElement ? el.selectedOptions[0]?.textContent : el.type === "checkbox" ? (el.checked ? "Yes" : "") : el.value;
      if (value) parts.push(`${label?.trim()}: ${value.trim()}`);
    });
  });
  return parts;
}

/**
 * Shown only on paper: who printed it, when, the filters, and a confidentiality line for bids. It renders
 * nothing until the moment of printing (beforeprint), so the server's HTML and the first client render always
 * match and the page's forms are left untouched while the page loads.
 */
export function PrintBanner({ name }: { name: string }) {
  const [info, setInfo] = useState<{ at: string; filters: string[]; confidential: boolean } | null>(null);
  useEffect(() => {
    const before = () =>
      // Render synchronously: the browser takes its print snapshot right after this event
      flushSync(() =>
        setInfo({
          at: new Date().toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
          filters: readFilters(),
          confidential: location.pathname.startsWith("/bids"),
        }),
      );
    const after = () => {
      document.querySelectorAll("form[data-print-filters]").forEach((f) => delete (f as HTMLFormElement).dataset.printFilters);
      setInfo(null);
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
  if (!info) return null;
  return (
    <div className="mb-4 hidden border-b border-slate-300 pb-2 text-[10px] text-slate-600 print:block">
      <div className="flex items-center justify-between gap-4">
        <Logo on="light" className="h-8" />
        <span>
          Printed by {name} on {info.at}
        </span>
      </div>
      {info.filters.length > 0 && <div className="mt-1">Filters: {info.filters.join(" · ")}</div>}
      {info.confidential && <div className="mt-1 font-semibold uppercase tracking-wide text-red-700">Confidential: bid information. Do not share outside the people allowed to see it.</div>}
    </div>
  );
}
