import { asc, eq, inArray } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { db, schema } from "@/db";
import { authOptions, type SessionUser } from "@/lib/auth";
import { buildImportTemplate, type TemplateColumn, xlsxResponse } from "@/lib/excel";
import { VENDOR_IMPORT_COLUMNS, type VendorField } from "@/lib/vendor-import-columns";
import { VENDOR_REG_LABEL, VENDOR_REG_STATUSES } from "@/lib/vendor-reg";

/** Empty vendor registration import sheet with dropdowns. Admins only; the client list is their units' clients. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const me = session?.user as SessionUser | undefined;
  if ((session as { inactive?: boolean } | null)?.inactive || (me?.role !== "ADMIN" && me?.role !== "SUPER_ADMIN")) return new Response("Admins only", { status: 403 });

  const c = schema.clients;
  const mine = me.role === "SUPER_ADMIN" ? undefined : me.buIds?.length ? inArray(c.businessUnitId, me.buIds) : eq(c.id, -1);
  const [clients, users] = await Promise.all([
    db.select({ code: c.clientCode, name: c.name }).from(c).where(mine).orderBy(asc(c.name)),
    db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.status, "ACTIVE")).orderBy(asc(schema.users.email)),
  ]);
  const lists: Partial<Record<VendorField, TemplateColumn["list"]>> = {
    client: { title: "Clients (code)", values: clients.map((x) => x.code ?? x.name), strict: false }, // an exact name works too
    status: { title: "Status", values: VENDOR_REG_STATUSES.map((s) => VENDOR_REG_LABEL[s]), strict: true },
    assignee: { title: "Assigned to", values: users.map((u) => u.email), strict: false }, // a name or username works too
  };

  const buf = await buildImportTemplate({
    sheet: "Vendor registrations",
    columns: VENDOR_IMPORT_COLUMNS.map((col) => ({ header: col.header, width: col.width, help: col.help, required: col.header.endsWith("*"), list: lists[col.key] })),
    howTo: [
      "How to fill the vendor registration import sheet",
      "",
      "• One row per registration. Client is required: its client code (e.g. ENG-0012, in the dropdown) or its exact name.",
      "• Only clients in your business units can be imported (any client for a Super Admin).",
      '• Registration: empty means "Vendor registration". A row with the same client and registration as an existing one updates it: filled-in cells overwrite, empty cells keep the current value.',
      "• Assigned to: a user's email (dropdown), username or full name. They must be a member of the client's business unit.",
      "• No portal passwords in this sheet: add them on the registration in the planner, where they are stored encrypted.",
      "• Hover over a header for a hint. The Lists sheet shows the allowed values.",
      "• In the planner, use Check file first: it reports every problem without saving anything.",
    ],
  });
  return xlsxResponse(buf, "eram-vendor-registrations-import-template.xlsx");
}
