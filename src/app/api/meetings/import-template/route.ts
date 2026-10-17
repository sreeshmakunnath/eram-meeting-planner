import { asc, eq, ne } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { db, schema } from "@/db";
import { authOptions } from "@/lib/auth";
import { buildImportTemplate, xlsxResponse } from "@/lib/excel";

/** Empty Client Meeting Planner sheet for Meetings → Import Excel. Admins only. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") return new Response("Admins only", { status: 403 });

  const [clients, users, bus] = await Promise.all([
    db.select({ name: schema.clients.name }).from(schema.clients).where(ne(schema.clients.status, "INACTIVE")).orderBy(asc(schema.clients.name)),
    db.select({ name: schema.users.fullName }).from(schema.users).where(eq(schema.users.status, "ACTIVE")).orderBy(asc(schema.users.fullName)),
    db.select({ name: schema.businessUnits.name }).from(schema.businessUnits).where(eq(schema.businessUnits.active, true)).orderBy(asc(schema.businessUnits.name)),
  ]);
  const people = users.map((u) => u.name);

  // Headers match the importer (src/lib/actions/import.ts), which matches them ignoring case and punctuation.
  const buf = await buildImportTemplate({
    sheet: "Client Meeting Planner",
    columns: [
      { header: "Priority", width: 10, help: "High, Medium or Low. Empty = High.", list: { title: "Priority", values: ["High", "Medium", "Low"], strict: true } },
      {
        header: "Client / Company",
        width: 28,
        required: true,
        help: "Required. Pick an existing client, or type a new one (it's added to the client master).",
        list: { title: "Client / Company", values: clients.map((c) => c.name), strict: false },
      },
      { header: "Country / Location", width: 20, help: "e.g. Dammam, Saudi Arabia. Used as the new client's city and country." },
      { header: "Client Contact", width: 24, help: "Client attendees, as text. Emails typed here get the meeting invite." },
      { header: "ERAM Attendees", width: 28, help: "Users' full names, separated by commas.", list: { title: "ERAM people", values: people, strict: false } },
      {
        header: "Meeting Type",
        width: 16,
        help: "Empty = Client Meeting.",
        list: { title: "Meeting Type", values: ["Client Meeting", "Follow-up", "Presentation", "Site Visit", "Internal"], strict: true },
      },
      { header: "Proposed Date", width: 14, numFmt: "dd-mmm-yyyy", help: "Needed for Scheduled, Confirmed and Completed." },
      { header: "Proposed Time", width: 12, numFmt: "hh:mm", help: "KSA time, e.g. 10:30. Empty = 10:00. Meetings are booked for 1 hour." },
      {
        header: "Status",
        width: 16,
        help: "Empty = Scheduled when a date is given, otherwise To Be Scheduled.",
        list: { title: "Status", values: ["To Be Scheduled", "Scheduled", "Confirmed", "Completed", "Postponed", "Cancelled"], strict: true },
      },
      { header: "Meeting Objective / Agenda", width: 36, help: "Empty = To be defined." },
      { header: "Relevant Business Units", width: 26, help: "One or more, separated by ;", list: { title: "Business units", values: bus.map((b) => b.name), strict: false } },
      { header: "Presentation / Documents", width: 24 },
      { header: "Next Action", width: 28 },
      { header: "Action Owner", width: 22, help: "Users' full names, separated by commas.", list: { title: "Action owner", values: people, strict: false } },
      { header: "Follow-up Date", width: 14, numFmt: "dd-mmm-yyyy" },
      { header: "Notes", width: 30 },
    ],
    howTo: [
      "How to fill the meeting import sheet",
      "",
      "• One row per meeting. Only Client / Company is required (dark blue header).",
      "• Clients: pick from the list, or type a new name and it's added to the client master. A spelling close to an existing client (e.g. Sabbic) is linked to that client, and the result lists every such link so you can check it.",
      "• Dates: type them as dates (e.g. 20-Oct-2026) and times as hh:mm. Scheduled, Confirmed and Completed need a date; without one the meeting is saved as To Be Scheduled.",
      "• ERAM Attendees and Action Owner: users' full names, separated by commas. Names that don't match a user are kept in the meeting's notes.",
      "• Business units: pick from the list, or type several separated by ;",
      "• A row with the same client and objective as a meeting already in the planner is skipped, so the file can be imported again safely.",
      "• No emails or calendar invites are sent during import.",
    ],
  });
  return xlsxResponse(buf, "eram-meetings-import-template.xlsx");
}
