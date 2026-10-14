// Applies the SQL migrations in ./drizzle to DATABASE_URL, then catches up data that later phases
// derive (tasks for Meeting Brief actions submitted before the task planner existed).
// Run: npm run db:migrate  (Vercel runs it on every deploy through the vercel-build script)
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { backfillBriefTasks } from "../lib/brief-tasks";
import { makePool } from "./pool";
import * as schema from "./schema";

try {
  process.loadEnvFile(".env");
} catch {}

async function main() {
  const pool = makePool(1);
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
  const bf = await backfillBriefTasks(db);
  if (bf.briefs) console.log(`Created ${bf.created} task(s) from ${bf.briefs} earlier Meeting Brief(s).`);
  await pool.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
