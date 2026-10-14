import { neonConfig, Pool as NeonPool } from "@neondatabase/serverless";
import { Pool as PgPool } from "pg";
import ws from "ws";

/**
 * Creates the database connection pool.
 *
 * - Neon URLs (…neon.tech) use Neon's serverless driver, which connects over a WebSocket on
 *   port 443. That gets through office firewalls that block the normal PostgreSQL port 5432.
 * - Any other URL (local PostgreSQL, Docker, RDS…) uses the standard `pg` driver on port 5432.
 * - Set DB_DRIVER=pg or DB_DRIVER=neon to force one or the other.
 *
 * Both pools have the same interface, so the rest of the app doesn't care which one it got.
 */
export function makePool(max = 5): PgPool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  const driver = process.env.DB_DRIVER || (/\.neon\.tech/.test(url) ? "neon" : "pg");
  if (driver === "neon") {
    neonConfig.webSocketConstructor = ws;
    return new NeonPool({ connectionString: url, max, connectionTimeoutMillis: 15_000 }) as unknown as PgPool;
  }
  return new PgPool({ connectionString: url, max, connectionTimeoutMillis: 15_000 });
}
