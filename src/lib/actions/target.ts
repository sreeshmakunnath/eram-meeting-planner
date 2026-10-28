"use server";
import ExcelJS from "exceljs";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { canManageClient } from "@/lib/access";
import { requireSuperAdmin, requireUser } from "@/lib/auth";
import { isSimilar } from "@/lib/similar";
import { taskBuFor } from "@/lib/task-bu";
import type { ActionState } from "@/components/action-form";
import { FormError, int, str, toFormError } from "@/lib/form";
import { CATEGORY_LABEL, logTaskActivity, notifyTaskAssigned, type TaskCategory, type TaskStatus } from "@/lib/tasks";
import { BD_CATEGORIES } from "@/lib/target-schedule";
import { asDate, norm, text } from "@/lib/xl-read";

/**
 * Creates the BD tasks (research, MIR, approach, follow-up) picked in the target schedule popup, each with its
 * own title, person and due date. Categories the client already has are skipped.
 */
export async function createBdTasks(clientId: number, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const me = await requireUser();
    const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, clientId));
    if (!client || !(await canManageClient(me, client))) throw new FormError("Only the account owner, their managers or an Admin of this client's business units can create its BD tasks.");
    const existing = await db
      .select({ category: schema.tasks.category })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.clientId, clientId), ne(schema.tasks.status, "CANCELLED"), isNull(schema.tasks.sourceBriefId), isNull(schema.tasks.parentTaskId)));
    const picked = fd.getAll("categories").map(String);
    const cats = BD_CATEGORIES.filter((c) => picked.includes(c) && !existing.some((e) => e.category === c));
    if (!cats.length) throw new FormError("Tick at least one task to create.");

    const plan = cats.map((cat) => {
      const due = str(fd, `due_${cat}`);
      if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new FormError(`Set a due date for ${CATEGORY_LABEL[cat]}.`);
      const assigneeId = int(fd, `assignee_${cat}`);
      if (!assigneeId) throw new FormError(`Choose who does ${CATEGORY_LABEL[cat]}.`);
      return { cat, title: (str(fd, `title_${cat}`) ?? `${CATEGORY_LABEL[cat]} – ${client.name}`).slice(0, 200), due, assigneeId };
    });
    const people = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(inArray(schema.users.id, plan.map((p) => p.assigneeId)), eq(schema.users.status, "ACTIVE")));
    if (plan.some((p) => !people.some((u) => u.id === p.assigneeId))) throw new FormError("One of the people picked isn't an active user.");
    const businessUnitId = await taskBuFor(db, { clientId, userId: me.id });

    for (const p of plan) {
      const [t] = await db
        .insert(schema.tasks)
        .values({ title: p.title, category: p.cat, clientId, businessUnitId, priority: "HIGH", dueDate: p.due, createdById: me.id })
        .returning();
      await db.insert(schema.taskAssignees).values({ taskId: t.id, userId: p.assigneeId });
      await logTaskActivity(t.id, me.id, "CREATED", { from: "Target Schedule" });
      if (p.assigneeId !== me.id) await notifyTaskAssigned(t.id, [p.assigneeId], me.name, me.id);
    }
    revalidatePath("/reports/target-schedule");
    return { ok: `Created ${plan.length} BD task${plan.length === 1 ? "" : "s"} for ${client.name}.` };
  } catch (e) {
    return toFormError(e);
  }
}

export type TargetImportResult = { error?: string; clients?: number; created?: number; updated?: number; clientsCreated?: string[]; unmatched?: string[]; batch?: string };

const STATUS: Record<string, TaskStatus> = {
  notstarted: "NOT_STARTED",
  started: "STARTED",
  inprogress: "IN_PROGRESS",
  ongoing: "IN_PROGRESS",
  onhold: "ON_HOLD",
  hold: "ON_HOLD",
  completed: "COMPLETED",
  done: "COMPLETED",
  cancelled: "CANCELLED",
};

/** Imports the "BD Target Companies – Batch N Schedule" sheet into clients + BD tasks. Re-running updates instead of duplicating. */
export async function importTargetSchedule(_: TargetImportResult | undefined, fd: FormData): Promise<TargetImportResult> {
  const admin = await requireSuperAdmin();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an .xlsx file." };
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as unknown as ArrayBuffer);
  } catch {
    return { error: "Couldn't read that file. Save it as .xlsx and try again." };
  }
  const ws = wb.worksheets[0];
  let headerRow = 0;
  const col: Record<string, number> = {};
  for (let r = 1; r <= Math.min(ws.rowCount, 10); r++) {
    const keys = (ws.getRow(r).values as ExcelJS.CellValue[]).map((c) => norm(text(c)));
    if (keys.includes("company")) {
      headerRow = r;
      keys.forEach((k, i) => k && (col[k] = i));
      break;
    }
  }
  if (!headerRow) return { error: 'No "Company" column found. Use the BD Target Schedule layout.' };
  const titleText = text(ws.getRow(1).getCell(1).value);
  const batch = (fd.get("batch") as string)?.trim() || titleText.match(/batch\s*\d+/i)?.[0].replace(/^b/, "B") || "Batch 1";

  const users = await db.select({ id: schema.users.id, fullName: schema.users.fullName }).from(schema.users).where(eq(schema.users.status, "ACTIVE"));
  const unmatched = new Set<string>();
  const findUser = (name: string) => {
    const n = name.trim().toLowerCase();
    if (!n) return null;
    const hit =
      users.find((u) => u.fullName.toLowerCase() === n) ??
      users.find((u) => u.fullName.toLowerCase().split(" ")[0] === n) ??
      users.find((u) => isSimilar(u.fullName.split(" ")[0], n));
    if (!hit) unmatched.add(name.trim());
    return hit?.id ?? null;
  };
  const clients = await db.select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients);
  const res: Required<Omit<TargetImportResult, "error">> = { clients: 0, created: 0, updated: 0, clientsCreated: [], unmatched: [], batch };
  const get = (row: ExcelJS.Row, key: string) => (col[key] ? row.getCell(col[key]).value : null);

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const name = text(get(row, "company"));
    if (!name) continue;
    let client = clients.find((c) => c.name.toLowerCase() === name.toLowerCase()) ?? clients.find((c) => isSimilar(c.name, name));
    if (!client) {
      const loc = text(get(row, "location")).split(",").map((x) => x.trim()).filter(Boolean);
      const [c] = await db
        .insert(schema.clients)
        .values({ name, country: loc.at(-1) || "Saudi Arabia", city: loc.length > 1 ? loc[0] : null, type: "PROSPECT", bdStage: "RESEARCH", createdById: admin.id })
        .returning({ id: schema.clients.id, name: schema.clients.name });
      clients.push(c);
      client = c;
      res.clientsCreated.push(name);
    }
    await db.update(schema.clients).set({ targetBatch: batch }).where(eq(schema.clients.id, client.id));
    res.clients++;

    const researchOwner = findUser(text(get(row, "researchmirowner")));
    const researchStatus = STATUS[norm(text(get(row, "researchmirstatus")))] ?? "NOT_STARTED";
    const approachOwner = findUser(text(get(row, "approachowner")));
    const approachStatus = STATUS[norm(text(get(row, "approachstatus")))] ?? "NOT_STARTED";
    const notes = text(get(row, "notes"));
    const plan: { cat: TaskCategory; due: string | null; owner: number | null; ownerName: string; status: TaskStatus }[] = [
      { cat: "MARKET_RESEARCH", due: asDate(get(row, "marketresearchdeadline")), owner: researchOwner, ownerName: text(get(row, "researchmirowner")), status: researchStatus },
      { cat: "MIR_REPORT", due: asDate(get(row, "mirreportdeadline")), owner: researchOwner, ownerName: text(get(row, "researchmirowner")), status: researchStatus },
      { cat: "APPROACH", due: asDate(get(row, "approachdeadline")), owner: approachOwner, ownerName: text(get(row, "approachowner")), status: approachStatus },
      { cat: "FOLLOW_UP", due: asDate(get(row, "followupdeadline")), owner: approachOwner, ownerName: text(get(row, "approachowner")), status: "NOT_STARTED" },
    ];
    for (const p of plan) {
      const [existing] = await db
        .select()
        .from(schema.tasks)
        .where(and(eq(schema.tasks.clientId, client.id), eq(schema.tasks.category, p.cat), ne(schema.tasks.status, "CANCELLED"), isNull(schema.tasks.sourceBriefId)));
      const description = [notes, !p.owner && p.ownerName ? `Owner in sheet: ${p.ownerName} (not matched to a user)` : ""].filter(Boolean).join("\n") || null;
      let taskId: number;
      if (existing) {
        await db
          .update(schema.tasks)
          .set({ dueDate: p.due ?? existing.dueDate, status: existing.status === "COMPLETED" ? existing.status : p.status, description: description ?? existing.description })
          .where(eq(schema.tasks.id, existing.id));
        taskId = existing.id;
        res.updated++;
      } else {
        const [t] = await db
          .insert(schema.tasks)
          .values({
            title: `${CATEGORY_LABEL[p.cat]} – ${client.name}`,
            category: p.cat,
            clientId: client.id,
            businessUnitId: await taskBuFor(db, { clientId: client.id, userId: admin.id }),
            priority: "HIGH",
            dueDate: p.due,
            status: p.status,
            description,
            createdById: admin.id,
          })
          .returning();
        taskId = t.id;
        await logTaskActivity(taskId, admin.id, "CREATED", { from: `Target Schedule import (${file.name})` });
        res.created++;
      }
      if (p.owner) {
        const [has] = await db.select().from(schema.taskAssignees).where(and(eq(schema.taskAssignees.taskId, taskId), eq(schema.taskAssignees.userId, p.owner)));
        if (!has) await db.insert(schema.taskAssignees).values({ taskId, userId: p.owner });
      }
    }
  }
  res.unmatched = [...unmatched];
  await audit(admin.id, "TARGET_SCHEDULE_IMPORTED", "task", null, { file: file.name, batch, created: res.created, updated: res.updated });
  revalidatePath("/reports/target-schedule");
  revalidatePath("/tasks");
  return res;
}
