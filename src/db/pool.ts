import { neonConfig, Pool as NeonPool } from "@neondatabase/serverless";
import { Pool as PgPool, type PoolClient } from "pg";
import ws from "ws";

const CONNECT_TIMEOUT_MS = 6_000; // per attempt; a healthy connect (incl. Neon waking up) takes 1–3 s
const CONNECT_ATTEMPTS = 3;

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
  const options = { connectionString: url, max, connectionTimeoutMillis: CONNECT_TIMEOUT_MS };
  let pool: PgPool;
  if (driver === "neon") {
    neonConfig.webSocketConstructor = ws;
    pool = new NeonPool(options) as unknown as PgPool;
  } else pool = new PgPool(options);
  // A server-closed idle client emits 'error' on the pool; without a listener it crashes the process.
  pool.on("error", (err) => console.error("Database pool error:", err.message));
  return withConnectRetry(pool);
}

/**
 * Retries a connection attempt that fails or stalls. On some networks an occasional connect hangs
 * while an immediate retry succeeds in under a second; without this, that one attempt fails the page.
 * Only connecting is retried, never a query, so nothing runs twice.
 */
function withConnectRetry(pool: PgPool): PgPool {
  const connectOnce = pool.connect.bind(pool) as () => Promise<PoolClient>;
  const connect = async (): Promise<PoolClient> => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await connectOnce();
      } catch (e) {
        if (attempt >= CONNECT_ATTEMPTS) throw e;
        console.warn(`Database connect attempt ${attempt} failed (${(e as Error).message || "timeout"}); retrying.`);
      }
    }
  };
  // pool.query() calls this.connect(callback) internally, so patching connect covers queries too.
  pool.connect = ((callback?: (err: Error | undefined, client?: PoolClient, done?: (release?: unknown) => void) => void) => {
    if (!callback) return connect();
    connect().then(
      (client) => callback(undefined, client, (release) => client.release(release as Error | boolean | undefined)),
      (err: Error) => callback(err),
    );
  }) as PgPool["connect"];
  return pool;
}
