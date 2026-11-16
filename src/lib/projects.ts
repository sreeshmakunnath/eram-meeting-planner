// Client projects: server-only helpers (not server actions, so they can't be called from the browser).
import { and, eq, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";
import { FormError, str } from "@/lib/form";

const p = schema.clientProjects;

/** An existing project of the client with this name (any case), if there is one. */
export async function projectByName(clientId: number, name: string, exceptId?: number) {
  const [row] = await db
    .select({ id: p.id, name: p.name })
    .from(p)
    .where(and(eq(p.clientId, clientId), sql`lower(${p.name}) = lower(${name})`, exceptId ? ne(p.id, exceptId) : undefined));
  return row;
}

/**
 * The project to put a bid in, from a bid form: a picked project (it must be the client's), or a new name typed
 * under "+ New project…" (an existing project with that name is reused). Null when none.
 */
export async function resolveBidProject(me: SessionUser, clientId: number, fd: FormData): Promise<number | null> {
  const picked = str(fd, "projectId");
  if (picked === "__new") {
    const name = str(fd, "newProject")?.slice(0, 200);
    if (!name) throw new FormError("Type the new project's name, or pick an existing project.");
    const existing = await projectByName(clientId, name);
    if (existing) return existing.id;
    const [row] = await db.insert(p).values({ clientId, name, createdById: me.id }).returning({ id: p.id });
    await audit(me.id, "PROJECT_ADDED", "client", clientId, { project: name });
    return row.id;
  }
  const id = Number(picked);
  if (!picked || !Number.isInteger(id)) return null;
  const [row] = await db.select({ id: p.id }).from(p).where(and(eq(p.id, id), eq(p.clientId, clientId)));
  if (!row) throw new FormError("That project belongs to another client.");
  return id;
}

