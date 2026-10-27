import { and, asc, eq } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { db, schema } from "@/db";
import { clientVisibleTo } from "@/lib/access";
import { authOptions } from "@/lib/auth";
import { BD_STAGE_LABELS } from "@/lib/queries";

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV export of the client master (opens in Excel). */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const status = new URL(req.url).searchParams.get("status") ?? "ACTIVE";
  const { clients, users } = schema;
  const rows = await db
    .select({
      name: clients.name,
      shortCode: clients.shortCode,
      type: clients.type,
      industry: clients.industry,
      country: clients.country,
      city: clients.city,
      website: clients.website,
      bdStage: clients.bdStage,
      status: clients.status,
      owner: users.fullName,
    })
    .from(clients)
    .leftJoin(users, eq(clients.accountOwnerId, users.id))
    .where(and(clientVisibleTo(session.user), status === "ALL" ? undefined : eq(clients.status, status as "ACTIVE" | "INACTIVE" | "PENDING_REVIEW")))
    .orderBy(asc(clients.name));
  const header = ["Client", "Short code", "Type", "Industry", "Country", "City", "Website", "BD stage", "Status", "Account owner"];
  const lines = rows.map((r) =>
    [r.name, r.shortCode, r.type, r.industry, r.country, r.city, r.website, r.bdStage ? BD_STAGE_LABELS[r.bdStage] : "", r.status, r.owner]
      .map(cell)
      .join(","),
  );
  // BOM so Excel opens Arabic / accented names correctly.
  return new Response("﻿" + [header.join(","), ...lines].join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="eram-clients.csv"' },
  });
}
