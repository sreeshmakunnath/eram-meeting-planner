import ExcelJS from "exceljs";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { isSuperAdmin, type SessionUser } from "@/lib/auth";
import { notify } from "@/lib/notifications";
import { VENDOR_IMPORT_COLUMNS, type VendorField } from "@/lib/vendor-import-columns";
import { VENDOR_REG_LABEL, VENDOR_REG_STATUSES, type VendorRegStatus } from "@/lib/vendor-reg";
import { asDate, norm, text } from "@/lib/xl-read";

type Issue = { row: number; client: string; message: string };
export type VendorImportResult = {
  error?: string;
  checkOnly?: boolean;
  created?: string[];
  updated?: string[];
  skipped?: Issue[]; // rows not imported, and why
  warnings?: Issue[]; // imported, with something left out
};

type Reg = typeof schema.vendorRegistrations.$inferSelect;
type Plan = {
  row: number;
  label: string;
  clientId: number;
  clientName: string;
  existing: Reg | null;
  data: Partial<typeof schema.vendorRegistrations.$inferInsert>;
};

const statusOf = new Map<string, VendorRegStatus>();
for (const s of VENDOR_REG_STATUSES) {
  statusOf.set(norm(s), s);
  statusOf.set(norm(VENDOR_REG_LABEL[s]), s);
}
statusOf.set("onhold", "ON_HOLD");
statusOf.set("done", "COMPLETED");

/**
 * Imports vendor registrations from an Excel sheet: one row per registration. Admins only, for clients in their
 * own business units (any for a Super Admin). "Check file" runs every check without saving.
 * Not a server action: the caller has already checked that `admin` is an Admin.
 */
export async function runVendorImport(admin: SessionUser, file: File | null, checkOnly: boolean): Promise<VendorImportResult> {
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an .xlsx file." };
  if (file.size > 5 * 1024 * 1024) return { error: "File is larger than 5 MB." };

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as unknown as ArrayBuffer);
  } catch {
    return { error: "Couldn't read that file. Save it as .xlsx (Excel Workbook) and try again." };
  }

  // The sheet and header row with a Client column (the template has it on row 1)
  let ws: ExcelJS.Worksheet | undefined;
  let headerRow = 0;
  let col: Partial<Record<VendorField, number>> = {};
  let passwordColumn = false;
  for (const sheet of wb.worksheets) {
    for (let r = 1; r <= Math.min(sheet.rowCount, 10) && !ws; r++) {
      const found: Partial<Record<VendorField, number>> = {};
      let pw = false;
      sheet.getRow(r).eachCell((cell, c) => {
        const h = norm(text(cell.value));
        if (h.includes("password")) pw = true;
        const spec = VENDOR_IMPORT_COLUMNS.find((s) => s.aliases.includes(h));
        if (spec && !found[spec.key]) found[spec.key] = c;
      });
      if (found.client) {
        ws = sheet;
        headerRow = r;
        col = found;
        passwordColumn = pw;
      }
    }
    if (ws) break;
  }
  if (!ws) return { error: 'No "Client" column found in the first 10 rows. Use the template, or name the column "Client".' };

  // Clients this Admin may import for: those in their own units
  const c = schema.clients;
  const clients = await db
    .select({ id: c.id, name: c.name, code: c.clientCode, buId: c.businessUnitId })
    .from(c)
    .where(isSuperAdmin(admin) ? undefined : admin.buIds.length ? inArray(c.businessUnitId, admin.buIds) : eq(c.id, -1));
  const byCode = new Map(clients.filter((x) => x.code).map((x) => [x.code!.toLowerCase(), x]));
  const byName = new Map(clients.map((x) => [x.name.toLowerCase(), x]));
  const [users, members, regs] = await Promise.all([
    db.select({ id: schema.users.id, email: schema.users.email, username: schema.users.username, fullName: schema.users.fullName }).from(schema.users).where(eq(schema.users.status, "ACTIVE")),
    db.select({ userId: schema.userBusinessUnits.userId, buId: schema.userBusinessUnits.businessUnitId }).from(schema.userBusinessUnits),
    clients.length
      ? db
          .select()
          .from(schema.vendorRegistrations)
          .where(
            inArray(
              schema.vendorRegistrations.clientId,
              clients.map((x) => x.id),
            ),
          )
      : Promise.resolve([] as Reg[]),
  ]);

  const skipped: Issue[] = [];
  const warnings: Issue[] = [];
  if (passwordColumn) warnings.push({ row: headerRow, client: "—", message: "The password column was ignored. Add portal passwords on each registration in the planner." });
  const plans = new Map<string, Plan>(); // client id + lower-case title

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const cell = (k: VendorField) => (col[k] ? row.getCell(col[k]!).value : null);
    const values = Object.fromEntries(VENDOR_IMPORT_COLUMNS.map((s) => [s.key, text(cell(s.key)).trim()])) as Record<VendorField, string>;
    if (!Object.values(values).some(Boolean)) continue; // blank row

    const label = values.client || "—";
    if (!values.client) {
      skipped.push({ row: r, client: label, message: "Client is empty." });
      continue;
    }
    const client = byCode.get(values.client.toLowerCase()) ?? byName.get(values.client.toLowerCase());
    if (!client) {
      skipped.push({ row: r, client: label, message: isSuperAdmin(admin) ? "No client with that code or name." : "No client with that code or name in your business units." });
      continue;
    }
    const tooLong = VENDOR_IMPORT_COLUMNS.filter((s) => s.max && values[s.key].length > s.max).map((s) => `${s.header.replace(" *", "")} (max ${s.max})`);
    if (tooLong.length) {
      skipped.push({ row: r, client: client.name, message: `Too long: ${tooLong.join(", ")}.` });
      continue;
    }

    const title = values.title || "Vendor registration";
    const key = `${client.id}|${title.toLowerCase()}`;
    if (plans.has(key)) {
      skipped.push({ row: r, client: client.name, message: `"${title}" for this client is already on row ${plans.get(key)!.row}; only that row was used.` });
      continue;
    }
    const existing = regs.find((x) => x.clientId === client.id && x.title.toLowerCase() === title.toLowerCase()) ?? null;

    const problems: string[] = [];
    const data: Plan["data"] = {};
    if (!existing) data.title = title;
    if (values.status) {
      const s = statusOf.get(norm(values.status));
      if (s) data.status = s;
      else problems.push(`Status "${values.status}" isn't one of: ${VENDOR_REG_STATUSES.map((x) => VENDOR_REG_LABEL[x]).join(", ")}`);
    }
    if (values.dueDate) {
      const d = asDate(cell("dueDate"));
      if (d) data.dueDate = d;
      else problems.push(`Due date "${values.dueDate}" isn't a date`);
    }
    if (values.portalUrl) {
      const u = /^https?:\/\//i.test(values.portalUrl) ? values.portalUrl : `https://${values.portalUrl}`;
      if (/^https?:\/\/\S+\.\S+$/i.test(u) && u.length <= 500) data.portalUrl = u;
      else problems.push(`Portal URL "${values.portalUrl}" doesn't look like a web address`);
    }
    if (problems.length) {
      skipped.push({ row: r, client: client.name, message: `${problems.join("; ")}.` });
      continue;
    }
    if (values.portalUsername) data.portalUsername = values.portalUsername;
    if (values.vendorCode) data.vendorCode = values.vendorCode;
    if (values.notes) data.notes = values.notes;

    // The assignee must belong to the client's unit, so they can see the client
    if (values.assignee) {
      const a = values.assignee.toLowerCase();
      const u = users.find((x) => x.email.toLowerCase() === a || x.username.toLowerCase() === a || x.fullName.toLowerCase() === a);
      if (!u) warnings.push({ row: r, client: client.name, message: `"${values.assignee}" isn't an active user, so the assignee was left ${existing ? "unchanged" : "empty"}.` });
      else if (!members.some((m) => m.userId === u.id && m.buId === client.buId))
        warnings.push({ row: r, client: client.name, message: `${u.fullName} isn't a member of the client's business unit, so the assignee was left ${existing ? "unchanged" : "empty"}.` });
      else data.assigneeId = u.id;
    }

    const status = data.status ?? existing?.status ?? "NOT_STARTED";
    if (data.status) data.completedAt = status === "COMPLETED" ? (existing?.completedAt ?? new Date()) : null;
    if (existing) {
      // Only cells that change something count
      for (const k of Object.keys(data) as (keyof Plan["data"])[]) if (k !== "completedAt" && (data[k] ?? null) === ((existing as Record<string, unknown>)[k] ?? null)) delete data[k];
      if (!data.status) delete data.completedAt;
      if (!Object.keys(data).length) {
        warnings.push({ row: r, client: client.name, message: `"${title}" already has these values; nothing to change.` });
        plans.set(key, { row: r, label: `${client.name}: ${title}`, clientId: client.id, clientName: client.name, existing, data });
        continue;
      }
    }
    plans.set(key, { row: r, label: `${client.name}: ${title}`, clientId: client.id, clientName: client.name, existing, data });
  }

  const toCreate = [...plans.values()].filter((p) => !p.existing);
  const toUpdate = [...plans.values()].filter((p) => p.existing && Object.keys(p.data).length);
  const result: VendorImportResult = {
    checkOnly,
    created: toCreate.map((p) => p.label),
    updated: toUpdate.map((p) => p.label),
    skipped: skipped.sort((a, b) => a.row - b.row),
    warnings: warnings.sort((a, b) => a.row - b.row),
  };
  if (checkOnly) return result;

  const assigned: { userId: number; clientId: number; clientName: string; title: string }[] = [];
  for (const p of toCreate) {
    const [reg] = await db
      .insert(schema.vendorRegistrations)
      .values({ ...p.data, clientId: p.clientId, createdById: admin.id })
      .returning();
    await audit(admin.id, "VENDOR_REG_CREATED", "client", p.clientId, { registrationId: reg.id, title: reg.title, assigneeId: reg.assigneeId, imported: true });
    if (reg.assigneeId && reg.assigneeId !== admin.id) assigned.push({ userId: reg.assigneeId, clientId: p.clientId, clientName: p.clientName, title: reg.title });
  }
  for (const p of toUpdate) {
    const reg = p.existing!;
    await db.update(schema.vendorRegistrations).set(p.data).where(and(eq(schema.vendorRegistrations.id, reg.id), eq(schema.vendorRegistrations.clientId, p.clientId)));
    const changed = Object.keys(p.data).filter((k) => k !== "completedAt");
    await audit(admin.id, p.data.status ? "VENDOR_REG_STATUS" : "VENDOR_REG_UPDATED", "client", p.clientId, {
      registrationId: reg.id,
      title: reg.title,
      ...(p.data.status ? { from: VENDOR_REG_LABEL[reg.status], to: VENDOR_REG_LABEL[p.data.status as VendorRegStatus] } : {}),
      changed,
      imported: true,
    });
    if (p.data.assigneeId && p.data.assigneeId !== admin.id) assigned.push({ userId: p.data.assigneeId, clientId: p.clientId, clientName: p.clientName, title: reg.title });
  }
  // In-app notices for new assignments (no emails)
  for (const a of assigned)
    await notify([a.userId], {
      kind: "VENDOR_REG_ASSIGNED",
      title: `Vendor registration: ${a.clientName}`,
      body: `${admin.name} assigned you "${a.title}".`,
      href: `/clients/${a.clientId}?tab=vendor`,
      actorId: admin.id,
    });
  await audit(admin.id, "VENDOR_REGS_IMPORTED", "client", null, { file: file.name, created: toCreate.length, updated: toUpdate.length, skipped: skipped.length });
  return result;
}
