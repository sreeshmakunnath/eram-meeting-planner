import { asc, eq } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { db, schema } from "@/db";
import { authOptions } from "@/lib/auth";
import { CLIENT_IMPORT_COLUMNS, type ClientField } from "@/lib/client-import-columns";
import { buildImportTemplate, type TemplateColumn, xlsxResponse } from "@/lib/excel";
import { BD_STAGE_LABELS, BD_STAGES, INDUSTRIES } from "@/lib/queries";

/** Empty client import sheet with dropdowns for the fixed lists. Admins only. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN" && session?.user?.role !== "SUPER_ADMIN") return new Response("Admins only", { status: 403 });

  const [bus, users] = await Promise.all([
    db.select({ name: schema.businessUnits.name }).from(schema.businessUnits).where(eq(schema.businessUnits.active, true)).orderBy(asc(schema.businessUnits.name)),
    db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.status, "ACTIVE")).orderBy(asc(schema.users.email)),
  ]);
  const lists: Partial<Record<ClientField, TemplateColumn["list"]>> = {
    type: { title: "Type", values: ["Client", "Prospect", "Partner", "Vendor"], strict: true },
    bdStage: { title: "BD stage", values: BD_STAGES.map((s) => BD_STAGE_LABELS[s]), strict: true },
    status: { title: "Status", values: ["Active", "Inactive", "Pending review"], strict: true },
    businessUnits: { title: "Business units", values: bus.map((b) => b.name), strict: false }, // several can be typed with ;
    owner: { title: "Account owner", values: users.map((u) => u.email), strict: false }, // a name or username works too
    industry: { title: "Industry (suggestions)", values: INDUSTRIES, strict: false },
  };

  const buf = await buildImportTemplate({
    sheet: "Clients",
    columns: CLIENT_IMPORT_COLUMNS.map((c) => ({ header: c.header, width: c.width, help: c.help, required: c.header.endsWith("*"), list: lists[c.key] })),
    howTo: [
      "How to fill the client import sheet",
      "",
      "• One row per contact. For a client with three contacts, use three rows and repeat the client name; client details can stay empty on the extra rows.",
      "• Client and Country are required for new clients (dark blue headers). Everything else is optional.",
      "• Clients already in the planner (same name, any capitals) are updated: filled-in cells overwrite, empty cells leave the current value. New contacts and business units are added, never removed.",
      '• Names that look like an existing client ("Sabbic" vs "SABIC", "L & T" vs "Larsen & Toubro (L&T)") are held back as possible duplicates. Fix the name, or tick "Import near-matches as new clients".',
      "• Business units: pick from the list, or type several separated by ; (e.g. Eram Engineering; Eram Trading).",
      "• Account owner: a user's email (dropdown), username or full name.",
      "• Hover over a header for a hint. The Lists sheet shows the allowed values.",
      "• In the planner, use Check file first: it reports every problem without saving anything.",
    ],
  });
  return xlsxResponse(buf, "eram-clients-import-template.xlsx");
}
