// Adds or removes the demo data (see demo-data.ts). Each run is one transaction: all or nothing.
//   npm run db:demo            add it          (DEMO_PASSWORD sets the demo users' password; default Demo@12345)
//   npm run db:demo:remove     take it out again
import { drizzle } from "drizzle-orm/node-postgres";
import { DEMO_DOMAIN, removeDemo, seedDemo } from "./demo-data";
import { makePool } from "./pool";
import * as schema from "./schema";

try {
  process.loadEnvFile(".env");
} catch {}

const pool = makePool(1);
const db = drizzle(pool, { schema });
const remove = process.argv.includes("--remove");

async function main() {
  const host = (process.env.DATABASE_URL ?? "").replace(/^.*@/, "").replace(/[/?].*$/, "");
  console.log(`${remove ? "Removing demo data from" : "Adding demo data to"} ${host}`);
  if (remove) {
    const r = await db.transaction((tx) => removeDemo(tx));
    if (!r) console.log("No demo data found. Nothing to remove.");
    else {
      console.log(`Removed ${r.users} demo users, ${r.clients} clients, ${r.meetings} meetings, ${r.tasks} tasks and ${r.units} business units.`);
      if (r.keptUnits.length) console.log(`Kept business unit(s) ${r.keptUnits.join(", ")}: real data uses them now.`);
    }
  } else {
    const password = process.env.DEMO_PASSWORD || "Demo@12345";
    const r = await db.transaction((tx) => seedDemo(tx, password));
    console.log(`Added ${r.users} users, ${r.clients} clients (${r.contacts} contacts), ${r.meetings} meetings and ${r.tasks} tasks.`);
    if (r.createdUnits.length) console.log(`Created ${r.createdUnits.length} business unit(s); they go again on remove.`);
    console.log(`Sign in as amina${DEMO_DOMAIN} / rahul${DEMO_DOMAIN} (BU Admins) or daniel${DEMO_DOMAIN} / priya${DEMO_DOMAIN} (Users), password ${password}`);
  }
  await pool.end();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await pool.end();
  process.exit(1);
});
