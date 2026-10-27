"use server";
import ExcelJS from "exceljs";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireSuperAdmin } from "@/lib/auth";
import { logActivity, riyadh } from "@/lib/meetings";
import { cleanClientName, looksLike } from "@/lib/client-names";
import { asDate, asTime, norm, splitNames, text } from "@/lib/xl-read";

export type ImportResult = {
  error?: string;
  created?: number;
  skipped?: number;
  clientsCreated?: string[];
  clientsLinked?: string[]; // "Sabbic → SABIC": near-spellings linked to an existing client
  unmatchedPeople?: string[];
  rowsWithIssues?: string[];
};

const HEADERS: Record<string, string[]> = {
  priority: ["priority"],
  client: ["clientcompany", "client", "company"],
  location: ["countrylocation", "location", "country"],
  contact: ["clientcontact", "clientcontacts", "clientattendees"],
  attendees: ["eramattendees", "attendees"],
  type: ["meetingtype", "type"],
  date: ["proposeddate", "date", "meetingdate"],
  time: ["proposedtime", "time"],
  status: ["status"],
  objective: ["meetingobjectiveagenda", "objective", "agenda", "meetingobjective"],
  bus: ["relevantbusinessunits", "businessunits"],
  documents: ["presentationdocuments", "documents"],
  nextAction: ["nextaction"],
  owner: ["actionowner"],
  followUp: ["followupdate"],
  notes: ["notes"],
};

/** Imports the existing "Client Meeting Planner" Excel sheet. Safe to run twice: identical rows are skipped. */
export async function importPlanner(_: ImportResult | undefined, fd: FormData): Promise<ImportResult> {
  const admin = await requireSuperAdmin();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an .xlsx file." };
  if (file.size > 5 * 1024 * 1024) return { error: "File is larger than 5 MB." };

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as unknown as ArrayBuffer);
  } catch {
    return { error: "Couldn't read that file. Save it as .xlsx and try again." };
  }

  // Find the sheet + header row that contains a Client / Company column
  let ws: ExcelJS.Worksheet | undefined;
  let headerRow = 0;
  const col: Record<string, number> = {};
  for (const sheet of wb.worksheets) {
    for (let r = 1; r <= Math.min(sheet.rowCount, 10); r++) {
      const cells = sheet.getRow(r).values as ExcelJS.CellValue[];
      const keys = cells.map((c) => norm(text(c)));
      if (keys.includes("clientcompany") || (keys.includes("client") && keys.includes("status"))) {
        ws = sheet;
        headerRow = r;
        for (const [field, names] of Object.entries(HEADERS)) {
          const idx = keys.findIndex((k) => names.includes(k));
          if (idx > 0) col[field] = idx;
        }
        break;
      }
    }
    if (ws) break;
  }
  if (!ws || !col.client) return { error: 'No "Client / Company" column found. Use the Client Meeting Planner layout.' };

  const [users, clients, bus] = await Promise.all([
    db.select({ id: schema.users.id, fullName: schema.users.fullName }).from(schema.users).where(eq(schema.users.status, "ACTIVE")),
    db.select({ id: schema.clients.id, name: schema.clients.name, shortCode: schema.clients.shortCode }).from(schema.clients),
    db.select().from(schema.businessUnits),
  ]);
  const unmatched = new Set<string>();
  const findUser = (name: string) => {
    const n = name.toLowerCase();
    const exact = users.find((u) => u.fullName.toLowerCase() === n);
    if (exact) return exact.id;
    const partial = users.filter((u) => u.fullName.toLowerCase().split(" ").includes(n) || u.fullName.toLowerCase().startsWith(n));
    if (partial.length === 1) return partial[0].id;
    unmatched.add(name);
    return null;
  };

  const result: Required<Omit<ImportResult, "error">> = { created: 0, skipped: 0, clientsCreated: [], clientsLinked: [], unmatchedPeople: [], rowsWithIssues: [] };
  const get = (row: ExcelJS.Row, f: string) => (col[f] ? row.getCell(col[f]).value : null);

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const clientName = cleanClientName(text(get(row, "client")));
    if (!clientName) continue;

    let client = clients.find((c) => c.name.toLowerCase() === clientName.toLowerCase());
    if (!client) {
      client = clients.find((c) => looksLike(c, clientName));
      const link = client && `${clientName} → ${client.name}`;
      if (link && !result.clientsLinked.includes(link)) result.clientsLinked.push(link);
    }
    if (!client) {
      const loc = text(get(row, "location"));
      const parts = loc.split(",").map((x) => x.trim()).filter(Boolean);
      const [c] = await db
        .insert(schema.clients)
        .values({ name: clientName, country: parts.at(-1) || "Saudi Arabia", city: parts.length > 1 ? parts[0] : null, type: "PROSPECT", createdById: admin.id })
        .returning({ id: schema.clients.id, name: schema.clients.name, shortCode: schema.clients.shortCode });
      clients.push(c);
      client = c;
      result.clientsCreated.push(clientName);
    }

    const statusText = norm(text(get(row, "status")));
    const statusMap: Record<string, (typeof schema.meetingStatusEnum.enumValues)[number]> = {
      tobescheduled: "TO_BE_SCHEDULED",
      scheduled: "SCHEDULED",
      confirmed: "CONFIRMED",
      completed: "COMPLETED",
      done: "COMPLETED",
      postponed: "POSTPONED",
      cancelled: "CANCELLED",
      canceled: "CANCELLED",
    };
    const date = asDate(get(row, "date"));
    let status = statusMap[statusText] ?? (date ? "SCHEDULED" : "TO_BE_SCHEDULED");
    if (!date && ["SCHEDULED", "CONFIRMED", "COMPLETED"].includes(status)) status = "TO_BE_SCHEDULED";
    const time = asTime(get(row, "time")) ?? "10:00";
    const startAt = date ? riyadh(date, time) : null;

    const typeText = norm(text(get(row, "type")));
    const type = typeText.includes("follow") ? "FOLLOW_UP" : typeText.includes("present") ? "PRESENTATION" : typeText.includes("site") ? "SITE_VISIT" : typeText.includes("internal") ? "INTERNAL" : "CLIENT_MEETING";
    const priorityText = norm(text(get(row, "priority")));
    const priority = priorityText.startsWith("low") ? "LOW" : priorityText.startsWith("med") ? "MEDIUM" : "HIGH";
    const objective = text(get(row, "objective")) || "To be defined";

    // Idempotent: skip if the same client + objective already exists
    const [dupe] = await db
      .select({ id: schema.meetings.id })
      .from(schema.meetings)
      .where(and(eq(schema.meetings.clientId, client.id), eq(schema.meetings.objective, objective)));
    if (dupe) {
      result.skipped++;
      continue;
    }

    const attendeeNames = splitNames(text(get(row, "attendees")));
    const ownerNames = splitNames(text(get(row, "owner")));
    const attendeeIds = [...new Set(attendeeNames.map(findUser).filter((x): x is number => !!x))];
    const ownerIds = [...new Set(ownerNames.map(findUser).filter((x): x is number => !!x))];
    const unmatchedHere = [...attendeeNames, ...ownerNames].filter((n) => unmatched.has(n));
    const notes = [text(get(row, "notes")), unmatchedHere.length ? `Imported names not matched to users: ${[...new Set(unmatchedHere)].join(", ")}` : ""].filter(Boolean).join("\n");

    const [mtg] = await db
      .insert(schema.meetings)
      .values({
        title: `${client.name} – ${type === "CLIENT_MEETING" ? "Client Meeting" : type.replace("_", " ").toLowerCase()}`,
        priority,
        clientId: client.id,
        location: text(get(row, "location")) || null,
        clientContactsText: text(get(row, "contact")) || null,
        type,
        startAt,
        endAt: startAt ? new Date(startAt.getTime() + 3600_000) : null,
        status,
        objective,
        documents: text(get(row, "documents")) || null,
        nextAction: text(get(row, "nextAction")) || null,
        followUpDate: asDate(get(row, "followUp")),
        notes: notes || null,
        organiserId: admin.id,
      })
      .returning();
    if (attendeeIds.length) await db.insert(schema.meetingAttendees).values(attendeeIds.map((userId) => ({ meetingId: mtg.id, userId })));
    if (ownerIds.length) await db.insert(schema.meetingActionOwners).values(ownerIds.map((userId) => ({ meetingId: mtg.id, userId })));
    const buText = text(get(row, "bus")).toLowerCase();
    const buIds = bus.filter((b) => buText.includes(b.name.toLowerCase())).map((b) => b.id);
    if (buIds.length) await db.insert(schema.meetingBusinessUnits).values(buIds.map((businessUnitId) => ({ meetingId: mtg.id, businessUnitId })));
    await logActivity(mtg.id, admin.id, "CREATED", { status, from: `Excel import (${file.name}, row ${r})` });
    result.created++;
  }

  result.unmatchedPeople = [...unmatched];
  await audit(admin.id, "PLANNER_IMPORTED", "meeting", null, { file: file.name, created: result.created, skipped: result.skipped, clientsCreated: result.clientsCreated });
  revalidatePath("/meetings");
  return result;
}
