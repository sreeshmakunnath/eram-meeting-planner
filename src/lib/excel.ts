import ExcelJS from "exceljs";

const NAVY = "FF1F3864";
const BLUE = "FF2E75B6";

/** Builds a branded worksheet: title row, header row, data rows, filters, frozen header. */
export async function buildWorkbook(opts: {
  sheet: string;
  title: string;
  columns: { header: string; width: number }[];
  rows: (string | number | Date | null | undefined)[][];
  subtitle?: string;
}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ERAM Meeting Planner";
  const ws = wb.addWorksheet(opts.sheet, { views: [{ state: "frozen", ySplit: opts.subtitle ? 3 : 2 }] });
  const n = opts.columns.length;
  ws.columns = opts.columns.map((c) => ({ width: c.width }));

  ws.mergeCells(1, 1, 1, n);
  const t = ws.getCell(1, 1);
  t.value = opts.title;
  t.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" }, name: "Calibri" };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  t.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 26;

  let headerRow = 2;
  if (opts.subtitle) {
    ws.mergeCells(2, 1, 2, n);
    const s = ws.getCell(2, 1);
    s.value = opts.subtitle;
    s.font = { italic: true, size: 10, color: { argb: "FF6B7280" } };
    headerRow = 3;
  }
  const h = ws.getRow(headerRow);
  opts.columns.forEach((c, i) => {
    const cell = h.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: NAVY } } };
  });
  h.height = 30;

  for (const r of opts.rows) {
    const row = ws.addRow(r.map((v) => (v === undefined ? null : v)));
    row.alignment = { vertical: "top", wrapText: true };
    row.eachCell((cell) => {
      cell.border = { bottom: { style: "hair", color: { argb: "FFD1D5DB" } } };
      if (cell.value instanceof Date) cell.numFmt = "dd-mmm-yyyy";
    });
  }
  ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: n } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export const xlsxResponse = (buf: Buffer, filename: string) =>
  new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });

/** A plain date string (yyyy-mm-dd) as an Excel date. */
export const xlDate = (s: string | null | undefined) => (s ? new Date(`${s.slice(0, 10)}T00:00:00Z`) : null);

export type TemplateColumn = {
  header: string;
  width: number;
  help?: string; // shown as a note on the header cell
  list?: { title: string; values: string[]; strict: boolean }; // dropdown; strict = only list values allowed
  numFmt?: string; // e.g. dates and times
  required?: boolean; // darker header
};

/**
 * An empty import sheet: styled header on row 1 with hints, dropdowns fed from a "Lists" sheet,
 * and a "How to fill" sheet. Used for the client and meeting import templates.
 */
export async function buildImportTemplate(opts: { sheet: string; columns: TemplateColumn[]; howTo: string[]; rows?: number }) {
  const rows = opts.rows ?? 1000;
  const wb = new ExcelJS.Workbook();
  wb.creator = "ERAM Meeting Planner";
  const ws = wb.addWorksheet(opts.sheet, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = opts.columns.map((c) => ({ header: c.header, width: c.width }));
  const head = ws.getRow(1);
  head.height = 30;
  opts.columns.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.required ? NAVY : BLUE } };
    cell.alignment = { vertical: "middle", wrapText: true };
    if (c.help) cell.note = c.help;
    if (c.numFmt) for (let r = 2; r <= rows + 1; r++) ws.getCell(r, i + 1).numFmt = c.numFmt;
  });

  const lists = wb.addWorksheet("Lists");
  let listCol = 0;
  opts.columns.forEach((c, i) => {
    if (!c.list) return;
    listCol++;
    const letter = String.fromCharCode(64 + listCol);
    lists.getColumn(listCol).width = 30;
    const h = lists.getCell(1, listCol);
    h.value = c.list.title;
    h.font = { bold: true, color: { argb: "FFFFFFFF" } };
    h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
    c.list.values.forEach((v, r) => (lists.getCell(r + 2, listCol).value = v));
    const range = `Lists!$${letter}$2:$${letter}$${Math.max(2, c.list.values.length + 1)}`;
    for (let r = 2; r <= rows + 1; r++)
      ws.getCell(r, i + 1).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [range],
        showErrorMessage: c.list.strict,
        errorTitle: "Pick from the list",
        error: "Choose one of the values in the list.",
      };
  });

  const help = wb.addWorksheet("How to fill");
  help.getColumn(1).width = 110;
  opts.howTo.forEach((line, i) => {
    const cell = help.getCell(i + 1, 1);
    cell.value = line;
    cell.alignment = { wrapText: true, vertical: "top" };
    if (i === 0) cell.font = { bold: true, size: 14, color: { argb: NAVY } };
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
