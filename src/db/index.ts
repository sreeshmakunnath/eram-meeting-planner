import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { makePool } from "./pool";
import * as schema from "./schema";

// One pool per server instance (reused across hot reloads in dev).
const globalForDb = globalThis as unknown as { pool?: Pool };

const pool = globalForDb.pool ?? makePool(5); // small on serverless; Neon's pooled URL handles fan-out
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export { schema };
