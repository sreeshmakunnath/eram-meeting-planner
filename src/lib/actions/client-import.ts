"use server";
import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { allowedBuIds, clientVisibleTo } from "@/lib/access";
import { isSuperAdmin, requireAdmin } from "@/lib/auth";
import { CLIENT_IMPORT_COLUMNS, type ClientField } from "@/lib/client-import-columns";
import { cleanClientName, looksLike } from "@/lib/client-names";
import { isEmail } from "@/lib/form";
import { BD_STAGE_LABELS, BD_STAGES, CLIENT_STATUSES, CLIENT_TYPES } from "@/lib/queries";
import { norm, text } from "@/lib/xl-read";

type Issue = { row: number; client: string; message: string };
export type ClientImportResult = {
  error?: string;
  checkOnly?: boolean;
  created?: string[];
  updated?: string[];
  contactsAdded?: number;
  skipped?: Issue[]; // clients not imported, and why
  warnings?: Issue[]; // imported, with something left out
  similar?: { row: number; client: string; existing: string }[]; // held back as possible duplicates
};

type ClientType = (typeof CLIENT_TYPES)[number];
type BdStage = (typeof BD_STAGES)[number];
type ClientStatus = (typeof CLIENT_STATUSES)[number];
type Contact = { name: string; designation: string | null; email: string | null; phone: string | null };
type Plan = {
  row: number;
  name: string;
  existingId: number | null;
  fields: Partial<{
    shortCode: string;
    type: ClientType;
    industry: string;
    country: string;
    city: string;
    website: string;
    bdStage: BdStage;
    targetBatch: string;
    accountOwnerId: number;
    status: ClientStatus;
    notes: string;
  }>;
  buIds: number[];
  contacts: Contact[];
  hasPrimary: boolean;
};

const lookup = <T extends string>(values: readonly T[], labels: Record<string, string> = {}) => {
  const map = new Map<string, T>();
  for (const v of values) {
    map.set(norm(v), v);
    if (labels[v]) map.set(norm(labels[v]), v);
  }
  return (s: string) => map.get(norm(s));
};
const parseType = lookup(CLIENT_TYPES);
const parseStage = lookup(BD_STAGES, BD_STAGE_LABELS);
const parseStatus = lookup(CLIENT_STATUSES);

/** Imports clients (and their contacts) from an Excel sheet. "Check file" runs every check without saving. */
export async function importClients(_: ClientImportResult | undefined, fd: FormData): Promise<ClientImportResult> {
  const admin = await requireAdmin();
  const checkOnly = fd.get("intent") !== "import";
  const allowSimilar = fd.get("allowSimilar") === "on";
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an .xlsx file." };
  if (file.size > 5 * 1024 * 1024) return { error: "File is larger than 5 MB." };

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as unknown as ArrayBuffer);
  } catch {
    return { error: "Couldn't read that file. Save it as .xlsx (Excel Workbook) and try again." };
  }

  // Find the sheet and header row with a Client column (the template has it on row 1).
  let ws: ExcelJS.Worksheet | undefined;
  let headerRow = 0;
  let col: Partial<Record<ClientField, number>> = {};
  for (const sheet of wb.worksheets) {
    for (let r = 1; r <= Math.min(sheet.rowCount, 10) && !ws; r++) {
      const found: Partial<Record<ClientField, number>> = {};
      sheet.getRow(r).eachCell((cell, c) => {
        const h = norm(text(cell.value));
        const spec = CLIENT_IMPORT_COLUMNS.find((s) => s.aliases.includes(h));
        if (spec && !found[spec.key]) found[spec.key] = c;
      });
      if (found.client) {
        ws = sheet;
        headerRow = r;
        col = found;
      }
    }
    if (ws) break;
  }
  if (!ws) return { error: 'No "Client" column found in the first 10 rows. Use the template, or name the column "Client".' };

  const [existing, users, allBus, visible, [me]] = await Promise.all([
    db.select({ id: schema.clients.id, name: schema.clients.name, shortCode: schema.clients.shortCode }).from(schema.clients),
    db.select({ id: schema.users.id, email: schema.users.email, username: schema.users.username, fullName: schema.users.fullName }).from(schema.users).where(eq(schema.users.status, "ACTIVE")),
    db.select({ id: schema.businessUnits.id, name: schema.businessUnits.name }).from(schema.businessUnits).where(eq(schema.businessUnits.active, true)),
    isSuperAdmin(admin) ? null : db.select({ id: schema.clients.id }).from(schema.clients).where(clientVisibleTo(admin)),
    db.select({ primaryBu: schema.users.businessUnitId }).from(schema.users).where(eq(schema.users.id, admin.id)),
  ]);
  // BU Admins: only their own business units, and only clients they can see.
  const allowed = allowedBuIds(admin, allBus.map((b) => b.id));
  const bus = allBus.filter((b) => allowed.includes(b.id));
  const visibleIds = visible && new Set(visible.map((v) => v.id));
  const existingContacts = existing.length
    ? await db
        .select({ clientId: schema.clientContacts.clientId, name: schema.clientContacts.name, email: schema.clientContacts.email, isPrimary: schema.clientContacts.isPrimary })
        .from(schema.clientContacts)
    : [];

  const skipped: Issue[] = [];
  const warnings: Issue[] = [];
  const similar: { row: number; client: string; existing: string }[] = [];
  const plans = new Map<string, Plan>(); // by lower-case client name
  const rejected = new Set<string>();

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (k: ClientField) => (col[k] ? text(row.getCell(col[k]!).value).trim() : "");
    const values = Object.fromEntries(CLIENT_IMPORT_COLUMNS.map((c) => [c.key, get(c.key)])) as Record<ClientField, string>;
    if (!Object.values(values).some(Boolean)) continue; // blank row

    const name = cleanClientName(values.client);
    if (!name) {
      skipped.push({ row: r, client: "—", message: "Client name is empty." });
      continue;
    }
    const key = name.toLowerCase();
    if (rejected.has(key)) continue;

    const tooLong = CLIENT_IMPORT_COLUMNS.filter((c) => c.max && values[c.key].length > c.max).map((c) => `${c.header.replace(" *", "")} (max ${c.max})`);
    if (tooLong.length) {
      skipped.push({ row: r, client: name, message: `Too long: ${tooLong.join(", ")}.` });
      continue;
    }

    let plan = plans.get(key);
    if (!plan) {
      const match = existing.find((e) => e.name.toLowerCase() === key);
      if (match && visibleIds && !visibleIds.has(match.id)) {
        skipped.push({ row: r, client: name, message: "This client belongs to another business unit, so it wasn't changed." });
        rejected.add(key);
        continue;
      }
      if (!match) {
        const near = existing.find((e) => looksLike(e, name)) ?? [...plans.values()].find((p) => !p.existingId && looksLike(p, name));
        if (near && !allowSimilar) {
          similar.push({ row: r, client: name, existing: near.name });
          rejected.add(key);
          continue;
        }
      }
      plan = { row: r, name, existingId: match?.id ?? null, fields: {}, buIds: [], contacts: [], hasPrimary: !!match && existingContacts.some((c) => c.clientId === match.id && c.isPrimary) };
    }

    // Client fields: the first non-empty value in the file wins.
    const problems: string[] = [];
    const f = plan.fields;
    const setText = (k: "shortCode" | "industry" | "country" | "city" | "targetBatch" | "notes", v: string) => {
      if (v && f[k] === undefined) f[k] = v;
    };
    setText("shortCode", values.shortCode);
    setText("industry", values.industry);
    setText("country", values.country);
    setText("city", values.city);
    setText("targetBatch", values.targetBatch);
    setText("notes", values.notes);
    if (values.type && !f.type) {
      const t = parseType(values.type);
      if (t) f.type = t;
      else problems.push(`Type "${values.type}" isn't Client, Prospect, Partner or Vendor`);
    }
    if (values.bdStage && !f.bdStage) {
      const s = parseStage(values.bdStage);
      if (s) f.bdStage = s;
      else problems.push(`BD stage "${values.bdStage}" isn't Research, MIR, Approach, Follow-up or Active client`);
    }
    if (values.status && !f.status) {
      const s = parseStatus(values.status);
      if (s) f.status = s;
      else problems.push(`Status "${values.status}" isn't Active, Inactive or Pending review`);
    }
    if (values.website && !f.website) {
      const w = /^https?:\/\//i.test(values.website) ? values.website : `https://${values.website}`;
      if (/^https?:\/\/\S+\.\S+$/i.test(w) && w.length <= 200) f.website = w;
      else problems.push(`Website "${values.website}" doesn't look like a web address`);
    }
    if (problems.length) {
      skipped.push({ row: r, client: name, message: `${problems.join("; ")}.` });
      rejected.add(key);
      plans.delete(key);
      continue;
    }

    if (values.owner && !f.accountOwnerId) {
      const o = values.owner.toLowerCase();
      const u = users.find((x) => x.email.toLowerCase() === o || x.username.toLowerCase() === o || x.fullName.toLowerCase() === o);
      if (u) f.accountOwnerId = u.id;
      else warnings.push({ row: r, client: name, message: `Account owner "${values.owner}" isn't an active user, so it was left empty.` });
    }
    for (const b of values.businessUnits.split(/[;,/\n]/).map((x) => x.trim()).filter(Boolean)) {
      const unit = bus.find((x) => norm(x.name) === norm(b));
      if (!unit)
        warnings.push({ row: r, client: name, message: `Business unit "${b}" isn't ${isSuperAdmin(admin) ? "in the master list" : "one of your business units"}, so it was left out.` });
      else if (!plan.buIds.includes(unit.id)) plan.buIds.push(unit.id);
    }

    // Contact on this row (skip ones the client already has, matched by email or else by name).
    if (values.contactName) {
      const email = values.email ? values.email.toLowerCase() : null;
      if (email && !isEmail(email)) {
        warnings.push({ row: r, client: name, message: `Contact "${values.contactName}" skipped: "${values.email}" isn't a valid email.` });
      } else {
        const known = [...existingContacts.filter((c) => c.clientId === plan.existingId), ...plan.contacts];
        const dup = known.some((c) => (email ? c.email?.toLowerCase() === email : !c.email && c.name.toLowerCase() === values.contactName.toLowerCase()));
        if (!dup) plan.contacts.push({ name: values.contactName, designation: values.designation || null, email, phone: values.phone || null });
      }
    } else if (values.email || values.phone || values.designation) {
      warnings.push({ row: r, client: name, message: "Contact details without a contact name were skipped." });
    }
    plans.set(key, plan);
  }

  // New clients need a country.
  for (const [key, p] of plans) {
    if (!p.existingId && !p.fields.country) {
      skipped.push({ row: p.row, client: p.name, message: "Country is required for a new client." });
      plans.delete(key);
    }
  }

  const toCreate = [...plans.values()].filter((p) => !p.existingId);
  const toUpdate = [...plans.values()].filter((p) => p.existingId);
  const contactsAdded = [...plans.values()].reduce((n, p) => n + p.contacts.length, 0);
  const result: ClientImportResult = {
    checkOnly,
    created: toCreate.map((p) => p.name),
    updated: toUpdate.map((p) => p.name),
    contactsAdded,
    skipped: skipped.sort((a, b) => a.row - b.row),
    warnings,
    similar,
  };
  if (checkOnly) return result;

  for (const p of plans.values()) {
    let id = p.existingId;
    if (id) {
      if (Object.keys(p.fields).length) await db.update(schema.clients).set(p.fields).where(eq(schema.clients.id, id));
    } else {
      const [c] = await db
        .insert(schema.clients)
        .values({ type: "PROSPECT", status: "ACTIVE", ...p.fields, name: p.name, country: p.fields.country!, createdById: admin.id })
        .returning({ id: schema.clients.id });
      id = c.id;
      // A new client without a business unit gets the importing Admin's primary unit, so it doesn't vanish from view.
      if (!p.buIds.length && me) p.buIds.push(me.primaryBu);
    }
    if (p.buIds.length)
      await db
        .insert(schema.clientBusinessUnits)
        .values(p.buIds.map((businessUnitId) => ({ clientId: id!, businessUnitId })))
        .onConflictDoNothing();
    if (p.contacts.length)
      await db.insert(schema.clientContacts).values(p.contacts.map((c, i) => ({ ...c, clientId: id!, isPrimary: !p.hasPrimary && i === 0, ownerId: admin.id })));
  }
  await audit(admin.id, "CLIENTS_IMPORTED", "client", null, {
    file: file.name,
    created: toCreate.length,
    updated: toUpdate.length,
    contactsAdded,
    skipped: skipped.length,
    heldAsSimilar: similar.length,
  });
  revalidatePath("/clients");
  return result;
}
