// Seeds branches, business units, the first admin and the first client records. Run: npm run db:seed
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

try {
  process.loadEnvFile(".env");
} catch {}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

const branchNames = ["Al Khobar", "Dammam", "Riyadh", "Jubail"];
const buNames = ["Eram Engineering", "Eram Trading", "ERAM Maritime"];

// Companies from the Client Meeting Planner and BD Target Schedule (Batch 1).
const clientRows: { name: string; shortCode?: string; country: string; city?: string }[] = [
  { name: "Lamprell", country: "UAE" },
  { name: "Larsen & Toubro (L&T)", shortCode: "L&T", country: "India", city: "Delhi" },
  { name: "McDermott", country: "UAE", city: "Dubai" },
  { name: "NMDC", shortCode: "NMDC", country: "UAE", city: "Abu Dhabi" },
  { name: "TAQA Al-Rushaid", country: "Saudi Arabia", city: "Dammam" },
  { name: "Técnicas Reunidas", country: "Spain" },
  { name: "Royal Commission", country: "Saudi Arabia", city: "Riyadh" },
  { name: "Tecnimont", country: "UAE" },
  { name: "STAR Saipem", country: "Saudi Arabia", city: "Dammam" },
  { name: "SABIC", shortCode: "SABIC", country: "Saudi Arabia", city: "Jubail" },
];

async function main() {
  await db.insert(schema.branches).values(branchNames.map((name) => ({ name }))).onConflictDoNothing();
  await db.insert(schema.businessUnits).values(buNames.map((name) => ({ name }))).onConflictDoNothing();

  const [hq] = await db.select().from(schema.branches).where(eq(schema.branches.name, "Al Khobar"));
  const [eng] = await db.select().from(schema.businessUnits).where(eq(schema.businessUnits.name, "Eram Engineering"));

  const email = (process.env.SEED_ADMIN_EMAIL || "admin@eram.com.sa").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || "Admin@12345";
  await db
    .insert(schema.users)
    .values({
      fullName: "System Administrator",
      username: "admin",
      email,
      role: "ADMIN",
      branchId: hq.id,
      businessUnitId: eng.id,
      passwordHash: await bcrypt.hash(password, 10),
    })
    .onConflictDoNothing();
  const [admin] = await db.select().from(schema.users).where(eq(schema.users.email, email));

  for (const c of clientRows) {
    const [row] = await db
      .insert(schema.clients)
      .values({ ...c, type: "PROSPECT", bdStage: "RESEARCH", createdById: admin.id })
      .onConflictDoNothing()
      .returning();
    if (row) await db.insert(schema.clientBusinessUnits).values({ clientId: row.id, businessUnitId: eng.id });
  }

  console.log(`Seed done. Admin login: ${email} / ${password}`);
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
