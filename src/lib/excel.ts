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
