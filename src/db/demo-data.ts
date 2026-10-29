// Demo data for showing the planner: two business units, a BU Admin and a User in each, clients, meetings and
// tasks dated around today. Everything is tied to the demo users (emails @demo.eram.test), so removeDemo() takes
// out exactly what seedDemo() added, plus anything those users created while demoing. Run via src/db/demo.ts.
import bcrypt from "bcryptjs";
import { and, eq, inArray, like, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;

export const DEMO_DOMAIN = "@demo.eram.test";
/** The two units the demo uses: existing ones are reused; missing ones are created and removed again on rollback. */
export const DEMO_UNITS = ["Eram Africa", "Source India"] as const;

// ---------- dates around today, in Saudi time ----------
const day = (n: number) => new Date(Date.now() + 3 * 3600_000 + n * 86400_000).toISOString().slice(0, 10);
const at = (n: number, time: string) => new Date(`${day(n)}T${time}:00+03:00`);
const hoursLater = (d: Date, h: number) => new Date(d.getTime() + h * 3600_000);

type Unit = (typeof DEMO_UNITS)[number];
const PEOPLE: { unit: Unit; admin: [string, string]; user: [string, string] }[] = [
  { unit: "Eram Africa", admin: ["Amina Okoro", "amina"], user: ["Daniel Mwangi", "daniel"] },
  { unit: "Source India", admin: ["Rahul Menon", "rahul"], user: ["Priya Nair", "priya"] },
];
const CLIENTS: Record<Unit, { name: string; country: string; city: string; industry: string; contact: [string, string] }[]> = {
  "Eram Africa": [
    { name: "Kilima Ports Authority (Demo)", country: "Tanzania", city: "Dar es Salaam", industry: "Ports & Marine", contact: ["Joseph Mrema", "Procurement Manager"] },
    { name: "Savanna Cement (Demo)", country: "Kenya", city: "Mombasa", industry: "Manufacturing", contact: ["Grace Wanjiru", "Plant Director"] },
    { name: "Lake Victoria Energy (Demo)", country: "Uganda", city: "Kampala", industry: "Power & Utilities", contact: ["Samuel Okello", "Head of Projects"] },
  ],
  "Source India": [
    { name: "Deccan Infra Projects (Demo)", country: "India", city: "Hyderabad", industry: "Construction", contact: ["Arjun Rao", "VP Business Development"] },
    { name: "Konkan Shipyards (Demo)", country: "India", city: "Mumbai", industry: "Ports & Marine", contact: ["Meera Kulkarni", "GM Operations"] },
    { name: "Ganga Petrochem (Demo)", country: "India", city: "Kolkata", industry: "Oil & Gas", contact: ["Vikram Sen", "Procurement Head"] },
  ],
};

/** BD steps per client: [status, due (days from today), done (days from today) or null]. Three levels of progress. */
const BD_PLANS: [(typeof schema.taskStatusEnum.enumValues)[number], number, number | null][][] = [
  [["COMPLETED", -24, -26], ["COMPLETED", -14, -11], ["IN_PROGRESS", 5, null], ["NOT_STARTED", 14, null]],
  [["COMPLETED", -12, -12], ["IN_PROGRESS", -3, null], ["NOT_STARTED", 10, null], ["NOT_STARTED", 20, null]],
  [["IN_PROGRESS", 4, null]],
];
const BD_CATEGORIES = ["MARKET_RESEARCH", "MIR_REPORT", "APPROACH", "FOLLOW_UP"] as const;
const BD_TITLES = ["Market research", "MIR report", "Approach", "Follow-up"];
const STAGES = ["APPROACH", "MIR", "RESEARCH"] as const;

/** Adds the demo data. Throws if it's already there (remove it first). Returns what was created, for the log. */
export async function seedDemo(db: Db, password: string) {
  const existing = await db.select({ id: schema.users.id }).from(schema.users).where(like(schema.users.email, `%${DEMO_DOMAIN}`));
  if (existing.length) throw new Error("Demo data is already in this database. Remove it first (npm run db:demo:remove).");

  // Branch and units
  let [branch] = await db.select().from(schema.branches).orderBy(schema.branches.id).limit(1);
  if (!branch) [branch] = await db.insert(schema.branches).values({ name: "Al Khobar" }).returning();
  const createdUnits: number[] = [];
  const units = new Map<Unit, number>();
  for (const name of DEMO_UNITS) {
    let [bu] = await db.select().from(schema.businessUnits).where(eq(schema.businessUnits.name, name));
    if (!bu) {
      [bu] = await db.insert(schema.businessUnits).values({ name }).returning();
      createdUnits.push(bu.id);
    }
    units.set(name, bu.id);
  }

  // People: an Admin and a User per unit; the User reports to the Admin
  const hash = await bcrypt.hash(password, 10);
  const person = async (fullName: string, handle: string, role: "ADMIN" | "USER", buId: number, designation: string) => {
    const [u] = await db
      .insert(schema.users)
      .values({ fullName, username: `demo.${handle}`, email: `${handle}${DEMO_DOMAIN}`, role, branchId: branch.id, businessUnitId: buId, designation, passwordHash: hash })
      .returning();
    await db.insert(schema.userBusinessUnits).values({ userId: u.id, businessUnitId: buId });
    return u;
  };
  const counts = { users: 0, clients: 0, contacts: 0, meetings: 0, tasks: 0 };

  for (const p of PEOPLE) {
    const buId = units.get(p.unit)!;
    const admin = await person(p.admin[0], p.admin[1], "ADMIN", buId, "BU Head");
    const user = await person(p.user[0], p.user[1], "USER", buId, "Business Development Executive");
    await db.insert(schema.userManagers).values({ userId: user.id, managerId: admin.id });
    counts.users += 2;

    const task = async (v: Omit<typeof schema.tasks.$inferInsert, "businessUnitId" | "createdById">, assignee: number) => {
      const [t] = await db.insert(schema.tasks).values({ ...v, businessUnitId: buId, createdById: admin.id }).returning();
      await db.insert(schema.taskAssignees).values({ taskId: t.id, userId: assignee });
      await db.insert(schema.taskActivity).values({ taskId: t.id, userId: admin.id, action: "CREATED", details: { from: "Demo data" } });
      counts.tasks++;
      return t;
    };

    // Clients with a shared contact and BD steps at different stages
    const clients: (typeof schema.clients.$inferSelect & { contactId: number })[] = [];
    for (const [i, c] of CLIENTS[p.unit].entries()) {
      const [client] = await db
        .insert(schema.clients)
        .values({
          name: c.name,
          country: c.country,
          city: c.city,
          industry: c.industry,
          type: "PROSPECT",
          bdStage: STAGES[i],
          targetBatch: "Demo Batch",
          accountOwnerId: user.id,
          createdById: admin.id,
          notes: "Demo data — removed with npm run db:demo:remove.",
        })
        .returning();
      await db.insert(schema.clientBusinessUnits).values({ clientId: client.id, businessUnitId: buId });
      const [contact] = await db
        .insert(schema.clientContacts)
        .values({ clientId: client.id, name: c.contact[0], designation: c.contact[1], email: `${c.contact[0].split(" ")[0].toLowerCase()}@example.com`, isPrimary: true, ownerId: user.id, shared: true })
        .returning();
      clients.push({ ...client, contactId: contact.id });
      counts.clients++;
      counts.contacts++;

      for (const [k, [status, due, done]] of BD_PLANS[i].entries())
        await task(
          {
            title: `${BD_TITLES[k]} – ${c.name}`,
            category: BD_CATEGORIES[k],
            clientId: client.id,
            priority: "HIGH",
            dueDate: day(due),
            status,
            percent: status === "COMPLETED" ? 100 : status === "IN_PROGRESS" ? 50 : 0,
            completedAt: done === null ? null : at(done, "15:00"),
          },
          user.id,
        );
    }

    // Meetings: one held last week, upcoming ones for the agenda, one waiting for a date, one internal
    const meeting = async (v: Omit<typeof schema.meetings.$inferInsert, "organiserId">, client: (typeof clients)[number] | null) => {
      const [m] = await db.insert(schema.meetings).values({ ...v, clientId: client?.id ?? null, organiserId: user.id }).returning();
      await db.insert(schema.meetingAttendees).values([
        { meetingId: m.id, userId: user.id, attended: v.status === "COMPLETED" ? true : null },
        { meetingId: m.id, userId: admin.id, attended: v.status === "COMPLETED" ? true : null },
      ]);
      await db.insert(schema.meetingBusinessUnits).values({ meetingId: m.id, businessUnitId: buId });
      if (client) await db.insert(schema.meetingContacts).values({ meetingId: m.id, contactId: client.contactId });
      await db.insert(schema.meetingActivity).values({ meetingId: m.id, userId: user.id, action: "CREATED", details: { status: v.status } });
      counts.meetings++;
      return m;
    };
    const [c1, c2, c3] = clients;
    const held = at(-6, "10:00");
    await meeting({ title: `Introductory meeting – ${c1.name}`, status: "COMPLETED", startAt: held, endAt: hoursLater(held, 1), mode: "IN_PERSON", location: c1.city ?? null, objective: "Introduce ERAM services and understand upcoming projects.", nextAction: "Send capability deck and case studies", followUpDate: day(3), priority: "HIGH" }, c1);
    const confirmed = at(1, "11:00");
    await meeting({ title: `Capability presentation – ${c1.name}`, status: "CONFIRMED", startAt: confirmed, endAt: hoursLater(confirmed, 1.5), mode: "TEAMS", objective: "Present ERAM capabilities for the port expansion project.", type: "PRESENTATION", priority: "HIGH" }, c1);
    const scheduled = at(3, "14:00");
    await meeting({ title: `Requirements discussion – ${c2.name}`, status: "SCHEDULED", startAt: scheduled, endAt: hoursLater(scheduled, 1), mode: "IN_PERSON", location: c2.city ?? null, objective: "Walk through manpower requirements for the next shutdown." }, c2);
    const later = at(8, "10:30");
    await meeting({ title: `Site visit – ${c2.name}`, status: "SCHEDULED", startAt: later, endAt: hoursLater(later, 3), mode: "IN_PERSON", type: "SITE_VISIT", location: c2.city ?? null, objective: "Visit the plant with the operations team." }, c2);
    await meeting({ title: `First approach – ${c3.name}`, status: "TO_BE_SCHEDULED", objective: "Introductory call once the MIR report is ready.", followUpDate: day(10), priority: "MEDIUM" }, c3);
    const internal = at(2, "09:00");
    await meeting({ title: `${p.unit} weekly BD review`, status: "SCHEDULED", startAt: internal, endAt: hoursLater(internal, 1), mode: "TEAMS", type: "INTERNAL", objective: "Review the BD pipeline and this week's priorities." }, null);

    // General tasks: one with a subtask, one overdue
    const deck = await task({ title: "Prepare capability deck for upcoming presentations", category: "PRESENTATION", priority: "HIGH", dueDate: day(1), status: "IN_PROGRESS", percent: 40 }, user.id);
    await task({ title: "Collect project references", parentTaskId: deck.id, dueDate: day(0), status: "NOT_STARTED" }, user.id);
    await task({ title: "Update contact list after trade show", dueDate: day(-2), status: "STARTED", percent: 20 }, user.id);
  }

  await db.insert(schema.auditLogs).values({ userId: null, action: "DEMO_DATA_ADDED", entity: "businessUnit", entityId: null, details: { createdUnits, ...counts } });
  return { ...counts, createdUnits };
}

/**
 * Removes the demo: everything the demo users organised or created (meetings, tasks, clients), then the users,
 * then units the demo had to create. Rows elsewhere that point at a demo user are cleared or removed, so real
 * data they touched while demoing (e.g. a comment on a real task) doesn't block the rollback.
 */
export async function removeDemo(db: Db) {
  const demoUsers = (await db.select({ id: schema.users.id }).from(schema.users).where(like(schema.users.email, `%${DEMO_DOMAIN}`))).map((u) => u.id);
  if (!demoUsers.length) return null;
  const logs = await db.select({ details: schema.auditLogs.details }).from(schema.auditLogs).where(eq(schema.auditLogs.action, "DEMO_DATA_ADDED"));
  const createdUnits = [...new Set(logs.flatMap((l) => ((l.details ?? {}) as { createdUnits?: number[] }).createdUnits ?? []))];

  const clients = (await db.select({ id: schema.clients.id }).from(schema.clients).where(inArray(schema.clients.createdById, demoUsers))).map((c) => c.id);
  const meetings = (
    await db
      .select({ id: schema.meetings.id })
      .from(schema.meetings)
      .where(or(inArray(schema.meetings.organiserId, demoUsers), clients.length ? inArray(schema.meetings.clientId, clients) : undefined))
  ).map((m) => m.id);
  const tasks = (
    await db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(or(inArray(schema.tasks.createdById, demoUsers), clients.length ? inArray(schema.tasks.clientId, clients) : undefined))
  ).map((t) => t.id);

  await removeRows(db, "tasks", tasks);
  await removeRows(db, "meetings", meetings);
  if (clients.length) await db.delete(schema.auditLogs).where(and(eq(schema.auditLogs.entity, "client"), inArray(schema.auditLogs.entityId, clients)));
  await removeRows(db, "clients", clients);
  await removeRows(db, "users", demoUsers);
  // Units the demo created go only if nothing real uses them now (someone may have started using them)
  const keptUnits: number[] = [];
  for (const id of createdUnits) if (!(await removeRows(db, "business_units", [id], { onlyIfUnused: true }))) keptUnits.push(id);
  await db.delete(schema.auditLogs).where(eq(schema.auditLogs.action, "DEMO_DATA_ADDED"));
  return { users: demoUsers.length, clients: clients.length, meetings: meetings.length, tasks: tasks.length, units: createdUnits.length - keptUnits.length, keptUnits };
}

/**
 * Deletes rows by id after dealing with whatever points at them: links that don't cascade are set to null, or the
 * linking row is deleted when the column can't be empty. Read from the database's own foreign keys, so tables
 * added later are covered too. `onlyIfUnused`: delete nothing (and return false) when anything still points at them.
 */
async function removeRows(db: Db, table: string, ids: number[], { onlyIfUnused = false } = {}) {
  if (!ids.length) return true;
  const refs = await db.execute<{ tbl: string; col: string; del: string; notnull: boolean }>(sql`
    select c.conrelid::regclass::text as tbl, a.attname as col, c.confdeltype as del, a.attnotnull as notnull
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = ${table}::regclass and array_length(c.conkey, 1) = 1`);
  const list = sql.join(ids.map((id) => sql`${id}`), sql`, `);
  if (onlyIfUnused)
    for (const r of refs.rows) {
      const used = await db.execute(sql`select 1 from ${sql.raw(r.tbl)} where ${sql.identifier(r.col)} in (${list}) limit 1`);
      if (used.rows.length) return false;
    }
  for (const r of refs.rows) {
    if (r.del === "c" || r.del === "n") continue; // the database cascades or clears these itself
    const col = sql.identifier(r.col);
    const tbl = sql.raw(r.tbl); // regclass text: already quoted where needed
    if (r.notnull) await db.execute(sql`delete from ${tbl} where ${col} in (${list})`);
    else await db.execute(sql`update ${tbl} set ${col} = null where ${col} in (${list})`);
  }
  await db.execute(sql`delete from ${sql.raw(table)} where id in (${list})`);
  return true;
}
