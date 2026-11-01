// Seeds branches, business units and the two Super Admins. Safe to re-run: existing rows are left as they are.
// Run once against the production database:  npm run db:seed
//   SUPER_ADMIN_1_NAME / _EMAIL / _USERNAME / _PASSWORD and SUPER_ADMIN_2_… (see .env.example).
//   _USERNAME defaults to the part of the email before "@"; without _PASSWORD a random one is generated and printed.
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { hashPassword, passwordProblem } from "../lib/password";
import { makePool } from "./pool";
import * as schema from "./schema";

try {
  process.loadEnvFile(".env");
} catch {}

const branchNames = ["Al Khobar", "Dammam", "Riyadh", "Jubail"];
const buNames = ["Eram Engineering", "Eram Trading", "ERAM Maritime"];

type AdminSpec = { fullName: string; email: string; username: string; password: string; generated: boolean };

function adminFromEnv(n: number): AdminSpec {
  const env = (k: string) => process.env[`SUPER_ADMIN_${n}_${k}`]?.trim() ?? "";
  const email = env("EMAIL").toLowerCase();
  const fullName = env("NAME");
  if (!email || !fullName) throw new Error(`Set SUPER_ADMIN_${n}_NAME and SUPER_ADMIN_${n}_EMAIL (see .env.example).`);
  const username = (env("USERNAME") || email.split("@")[0]).toLowerCase();
  let password = env("PASSWORD");
  const generated = !password;
  if (generated) password = `${randomBytes(9).toString("base64url")}A7!`;
  const problem = passwordProblem(password);
  if (problem) throw new Error(`SUPER_ADMIN_${n}_PASSWORD: ${problem}`);
  return { fullName, email, username, password, generated };
}

async function main() {
  const admins = [adminFromEnv(1), adminFromEnv(2)];
  if (admins[0].email === admins[1].email || admins[0].username === admins[1].username)
    throw new Error("The two Super Admins need different emails and usernames.");

  const pool = makePool(1);
  const db = drizzle(pool, { schema });
  try {
    await db.insert(schema.branches).values(branchNames.map((name) => ({ name }))).onConflictDoNothing();
    await db.insert(schema.businessUnits).values(buNames.map((name) => ({ name }))).onConflictDoNothing();

    const [hq] = await db.select().from(schema.branches).where(eq(schema.branches.name, branchNames[0]));
    const [bu] = await db.select().from(schema.businessUnits).where(eq(schema.businessUnits.name, buNames[0]));

    for (const a of admins) {
      const [row] = await db
        .insert(schema.users)
        .values({
          fullName: a.fullName,
          username: a.username,
          email: a.email,
          role: "SUPER_ADMIN",
          branchId: hq.id,
          businessUnitId: bu.id,
          passwordHash: await hashPassword(a.password),
        })
        .onConflictDoNothing()
        .returning();
      if (!row) {
        console.log(`${a.email}: already exists, left unchanged.`);
        continue;
      }
      await db.insert(schema.userBusinessUnits).values({ userId: row.id, businessUnitId: bu.id }).onConflictDoNothing();
      console.log(`${a.email}: Super Admin created (username ${a.username})${a.generated ? `, password ${a.password}` : ""}.`);
    }
    console.log("Seed done. Sign in and change the password under My profile.");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
