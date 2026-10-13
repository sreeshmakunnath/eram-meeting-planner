"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/action-form";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { req, toFormError } from "@/lib/form";

type Kind = "branch" | "businessUnit";
const table = (k: Kind) => (k === "branch" ? schema.branches : schema.businessUnits);

export async function addMaster(kind: Kind, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const name = req(fd, "name", "Name");
    const [row] = await db.insert(table(kind)).values({ name }).returning();
    await audit(admin.id, "MASTER_ADDED", kind, row.id, { name });
    revalidatePath("/admin/masters");
    return { ok: `Added "${name}".` };
  } catch (e) {
    return toFormError(e);
  }
}

export async function renameMaster(kind: Kind, id: number, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const name = req(fd, "name", "Name");
    const t = table(kind);
    await db.update(t).set({ name }).where(eq(t.id, id));
    await audit(admin.id, "MASTER_RENAMED", kind, id, { name });
    revalidatePath("/admin/masters");
    return { ok: "Saved." };
  } catch (e) {
    return toFormError(e);
  }
}

export async function toggleMaster(kind: Kind, id: number, active: boolean) {
  const admin = await requireAdmin();
  const t = table(kind);
  await db.update(t).set({ active }).where(eq(t.id, id));
  await audit(admin.id, active ? "MASTER_ACTIVATED" : "MASTER_DEACTIVATED", kind, id);
  revalidatePath("/admin/masters");
}
