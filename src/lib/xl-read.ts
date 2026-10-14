// Helpers for reading cells from uploaded Excel sheets.
import type ExcelJS from "exceljs";

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

export const text = (v: ExcelJS.CellValue): string => {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return String(v.text);
    if ("result" in v) return String(v.result ?? "");
  }
  return String(v).trim();
};
export const asDate = (v: ExcelJS.CellValue): string | null => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = text(v);
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return null;
};
export const asTime = (v: ExcelJS.CellValue): string | null => {
  if (v instanceof Date) return v.toISOString().slice(11, 16);
  const m = text(v).match(/(\d{1,2})[:.](\d{2})\s*(am|pm)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  if (m[3]?.toLowerCase() === "pm" && h < 12) h += 12;
  if (m[3]?.toLowerCase() === "am" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
};
export const splitNames = (s: string) =>
  s
    .split(/[,;/&\n]| and /i)
    .map((x) => x.trim())
    .filter(Boolean);

