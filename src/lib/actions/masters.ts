"use server";
import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/action-form";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireSuperAdmin } from "@/lib/auth";
import { BU_CODE_RE } from "@/lib/bu-code";
import { FormError, req, toFormError } from "@/lib/form";

type Kind = "branch" | "businessUnit";
const table = (k: Kind) => (k === "branch" ? schema.branches : schema.businessUnits);

/** A business unit's code: required, 2–6 capitals or digits, unique. Changing it doesn't touch client codes already given. */
async function buCode(fd: FormData, id?: number) {
  const code = req(fd, "code", "Code").toUpperCase();
  if (!BU_CODE_RE.test(code)) throw new FormError("Code must be 2–6 letters or digits, e.g. ENG.");
  const bu = schema.businessUnits;
  const [taken] = await db
    .select({ name: bu.name })
    .from(bu)
    .where(and(sql`upper(${bu.code}) = ${code}`, id ? ne(bu.id, id) : undefined));
  if (taken) throw new FormError(`${code} is already used by ${taken.name}.`);
  return code;
}

export async function addMaster(kind: Kind, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const admin = await requireSuperAdmin();
    const name = req(fd, "name", "Name");
    const [row] =
      kind === "businessUnit"
        ? await db.insert(schema.businessUnits).values({ name, code: await buCode(fd) }).returning()
        : await db.insert(schema.branches).values({ name }).returning();
    await audit(admin.id, "MASTER_ADDED", kind, row.id, { name, ...("code" in row ? { code: row.code } : {}) });
    revalidatePath("/admin/masters");
    return { ok: `Added "${name}".` };
  } catch (e) {
    return toFormError(e);
  }
}

export async function renameMaster(kind: Kind, id: number, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const admin = await requireSuperAdmin();
    const name = req(fd, "name", "Name");
    if (kind === "businessUnit") {
      const code = await buCode(fd, id);
      await db.update(schema.businessUnits).set({ name, code }).where(eq(schema.businessUnits.id, id));
      await audit(admin.id, "MASTER_RENAMED", kind, id, { name, code });
    } else {
      await db.update(schema.branches).set({ name }).where(eq(schema.branches.id, id));
      await audit(admin.id, "MASTER_RENAMED", kind, id, { name });
    }
    revalidatePath("/admin/masters");
    return { ok: "Saved." };
  } catch (e) {
    return toFormError(e);
  }
}

export async function toggleMaster(kind: Kind, id: number, active: boolean) {
  const admin = await requireSuperAdmin();
  const t = table(kind);
  await db.update(t).set({ active }).where(eq(t.id, id));
  await audit(admin.id, active ? "MASTER_ACTIVATED" : "MASTER_DEACTIVATED", kind, id);
  revalidatePath("/admin/masters");
}
