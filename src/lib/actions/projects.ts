"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { db, schema } from "@/db";
import { canManageClient, canSeeClient } from "@/lib/access";
import { audit } from "@/lib/audit";
import { requireUser, type SessionUser } from "@/lib/auth";
import { FormError, req, str, toFormError } from "@/lib/form";

const p = schema.clientProjects;

import { projectByName as byName } from "@/lib/projects";

/** Anyone who can see the client can add a project to it. */
export async function addProject(clientId: number, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const me = await requireUser();
    if (!(await canSeeClient(me, clientId))) throw new FormError("You don't have access to this client.");
    const name = req(fd, "name", "Project name").slice(0, 200);
    if (await byName(clientId, name)) throw new FormError(`This client already has a project called "${name}".`);
    await db.insert(p).values({ clientId, name, location: str(fd, "location"), description: str(fd, "description"), createdById: me.id });
    await audit(me.id, "PROJECT_ADDED", "client", clientId, { project: name });
    revalidatePath(`/clients/${clientId}`);
    return { ok: `Added project "${name}".` };
  } catch (e) {
    return toFormError(e);
  }
}

async function loadForEdit(me: SessionUser, clientId: number, projectId: number) {
  const [project] = await db.select().from(p).where(and(eq(p.id, projectId), eq(p.clientId, clientId)));
  if (!project) throw new FormError("Project not found.");
  const [client] = await db.select({ id: schema.clients.id, accountOwnerId: schema.clients.accountOwnerId }).from(schema.clients).where(eq(schema.clients.id, clientId));
  if (!(await canSeeClient(me, clientId))) throw new FormError("You don't have access to this client.");
  if (project.createdById !== me.id && !(await canManageClient(me, client))) throw new FormError("Only whoever added the project or manages the client can change it.");
  return project;
}

/** Rename / re-describe: whoever added the project, or whoever manages the client. */
export async function updateProject(clientId: number, projectId: number, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const me = await requireUser();
    const before = await loadForEdit(me, clientId, projectId);
    const name = req(fd, "name", "Project name").slice(0, 200);
    if (await byName(clientId, name, projectId)) throw new FormError(`This client already has a project called "${name}".`);
    await db.update(p).set({ name, location: str(fd, "location"), description: str(fd, "description") }).where(eq(p.id, projectId));
    await audit(me.id, "PROJECT_UPDATED", "client", clientId, { project: name, ...(name !== before.name ? { from: before.name } : {}) });
    revalidatePath(`/clients/${clientId}`);
    return { ok: "Saved." };
  } catch (e) {
    return toFormError(e);
  }
}

/** Deleting a project keeps its bids; they just lose the project. */
export async function deleteProject(clientId: number, projectId: number) {
  const me = await requireUser();
  let problem: string | null = null;
  try {
    const project = await loadForEdit(me, clientId, projectId);
    // Bids may be under it that this person can't see; deleting would silently change them
    const [used] = await db.select({ id: schema.bids.id }).from(schema.bids).where(eq(schema.bids.projectId, projectId)).limit(1);
    if (used) problem = "projectinuse";
    else {
      await db.delete(p).where(eq(p.id, projectId));
      await audit(me.id, "PROJECT_DELETED", "client", clientId, { project: project.name });
    }
  } catch {
    problem = "denied";
  }
  revalidatePath(`/clients/${clientId}`);
  if (problem) redirect(`/clients/${clientId}?tab=bids&msg=${problem}`);
}
