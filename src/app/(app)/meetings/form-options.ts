import { asc, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { activeBusinessUnits, activeGroups, activeUsers } from "@/lib/queries";

export type ClientOption = {
  id: number;
  name: string;
  location: string;
  accountGroupId: number | null;
  buIds: number[];
  contacts: { id: number; name: string; designation: string | null; hasEmail: boolean }[];
};
export type MeetingFormOptions = Awaited<ReturnType<typeof meetingFormOptions>>;

/** Everything the meeting form's dropdowns need, in one round of queries. */
export async function meetingFormOptions() {
  const [clients, contacts, cbus, users, groups, bus] = await Promise.all([
    db
      .select({ id: schema.clients.id, name: schema.clients.name, country: schema.clients.country, city: schema.clients.city, accountGroupId: schema.clients.accountGroupId })
      .from(schema.clients)
      .where(ne(schema.clients.status, "INACTIVE"))
      .orderBy(asc(schema.clients.name)),
    db
      .select({ id: schema.clientContacts.id, clientId: schema.clientContacts.clientId, name: schema.clientContacts.name, designation: schema.clientContacts.designation, email: schema.clientContacts.email })
      .from(schema.clientContacts)
      .orderBy(asc(schema.clientContacts.name)),
    db.select().from(schema.clientBusinessUnits),
    activeUsers(),
    activeGroups(),
    activeBusinessUnits(),
  ]);
  const clientOptions: ClientOption[] = clients.map((c) => ({
    id: c.id,
    name: c.name,
    location: [c.city, c.country].filter(Boolean).join(", "),
    accountGroupId: c.accountGroupId,
    buIds: cbus.filter((b) => b.clientId === c.id).map((b) => b.businessUnitId),
    contacts: contacts.filter((x) => x.clientId === c.id).map(({ id, name, designation, email }) => ({ id, name, designation, hasEmail: !!email?.trim() })),
  }));
  return { clients: clientOptions, users, groups, bus };
}

export async function meetingSelections(id: number) {
  const [attendees, groups, contacts, bus, owners] = await Promise.all([
    db.select().from(schema.meetingAttendees).where(eq(schema.meetingAttendees.meetingId, id)),
    db.select().from(schema.meetingGroups).where(eq(schema.meetingGroups.meetingId, id)),
    db.select().from(schema.meetingContacts).where(eq(schema.meetingContacts.meetingId, id)),
    db.select().from(schema.meetingBusinessUnits).where(eq(schema.meetingBusinessUnits.meetingId, id)),
    db.select().from(schema.meetingActionOwners).where(eq(schema.meetingActionOwners.meetingId, id)),
  ]);
  return {
    // only people picked directly; group members come back through the group
    userIds: attendees.filter((a) => a.viaGroupId === null).map((a) => a.userId),
    groupIds: groups.map((g) => g.groupId),
    contactIds: contacts.map((c) => c.contactId),
    businessUnitIds: bus.map((b) => b.businessUnitId),
    ownerIds: owners.map((o) => o.userId),
  };
}
