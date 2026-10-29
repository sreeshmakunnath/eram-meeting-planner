import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";

/** Which kind of record an id in an audit entry's details points at, by detail key. */
const DETAIL_KIND: Record<string, Kind> = {
  businessUnits: "businessUnit",
  groupsAdded: "group",
  groupsRemoved: "group",
  membersAdded: "user",
  membersRemoved: "user",
  mergedFrom: "client",
  contactId: "contact",
  users: "user",
};

type Kind = "user" | "client" | "group" | "branch" | "businessUnit" | "meeting" | "task" | "contact";

const TABLES = {
  user: { t: schema.users, name: schema.users.fullName },
  client: { t: schema.clients, name: schema.clients.name },
  group: { t: schema.groups, name: schema.groups.name },
  branch: { t: schema.branches, name: schema.branches.name },
  businessUnit: { t: schema.businessUnits, name: schema.businessUnits.name },
  meeting: { t: schema.meetings, name: schema.meetings.title },
  task: { t: schema.tasks, name: schema.tasks.title },
  contact: { t: schema.clientContacts, name: schema.clientContacts.name },
} as const;

/** Where a record opens, when it has a page. */
export const RECORD_HREF: Partial<Record<string, (id: number) => string>> = {
  user: (id) => `/admin/users/${id}`,
  client: (id) => `/clients/${id}`,
  group: (id) => `/groups/${id}`,
  meeting: (id) => `/meetings/${id}`,
  task: (id) => `/tasks/${id}`,
};

export type AuditEntry = { entity: string; entityId: number | null; details: unknown };

/**
 * Looks up the names behind an audit page's ids (the record itself and ids inside its details) in one query per
 * kind. Returns name(kind, id), or null when the record no longer exists.
 */
export async function auditNames(entries: AuditEntry[]) {
  const wanted = new Map<Kind, Set<number>>();
  const want = (kind: Kind, id: unknown) => {
    if (typeof id !== "number") return;
    if (!wanted.has(kind)) wanted.set(kind, new Set());
    wanted.get(kind)!.add(id);
  };
  for (const e of entries) {
    if (e.entity in TABLES) want(e.entity as Kind, e.entityId);
    for (const [key, v] of Object.entries((e.details ?? {}) as Record<string, unknown>)) {
      const kind = DETAIL_KIND[key];
      if (kind) for (const id of Array.isArray(v) ? v : [v]) want(kind, id);
    }
  }
  const names = new Map<string, string>();
  await Promise.all(
    [...wanted].map(async ([kind, ids]) => {
      const { t, name } = TABLES[kind];
      const rows = await db.select({ id: t.id, name }).from(t).where(inArray(t.id, [...ids]));
      for (const r of rows) names.set(`${kind}:${r.id}`, r.name);
    }),
  );
  return {
    name: (kind: string, id: number) => names.get(`${kind}:${id}`) ?? null,
    /** The details as label/value pairs, with ids swapped for names. */
    details(e: AuditEntry): [string, string][] {
      return Object.entries((e.details ?? {}) as Record<string, unknown>)
        .filter(([key, v]) => !(key === "name" && "contactId" in ((e.details ?? {}) as object) && typeof v === "string")) // contactId already names it
        .filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0))
        .map(([key, v]) => {
          const kind = DETAIL_KIND[key];
          const show = (x: unknown) => (kind && typeof x === "number" ? (names.get(`${kind}:${x}`) ?? `#${x} (deleted)`) : typeof x === "object" ? JSON.stringify(x) : String(x));
          return [labelOf(key), Array.isArray(v) ? v.map(show).join(", ") : show(v)];
        });
    },
  };
}

const LABELS: Record<string, string> = { contactId: "Contact", users: "Shared with", mergedFrom: "Merged from", businessUnits: "Business units", as: "Approved as" };
const labelOf = (key: string) => LABELS[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
