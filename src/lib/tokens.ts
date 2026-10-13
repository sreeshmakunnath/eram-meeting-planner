import crypto from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";

type TokenType = "SET_PASSWORD" | "RESET_PASSWORD";
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** Creates a one-time token (only its hash is stored). Earlier unused tokens of the same type are invalidated. */
export async function createToken(userId: number, type: TokenType, minutes: number) {
  const raw = crypto.randomBytes(32).toString("base64url");
  await db
    .update(schema.authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(schema.authTokens.userId, userId), eq(schema.authTokens.type, type), isNull(schema.authTokens.usedAt)));
  await db.insert(schema.authTokens).values({
    tokenHash: sha256(raw),
    userId,
    type,
    expiresAt: new Date(Date.now() + minutes * 60_000),
  });
  return raw;
}

/** Returns the token row if valid (unused, unexpired), without consuming it. */
export async function findValidToken(raw: string) {
  const [row] = await db
    .select()
    .from(schema.authTokens)
    .where(
      and(
        eq(schema.authTokens.tokenHash, sha256(raw)),
        isNull(schema.authTokens.usedAt),
        gt(schema.authTokens.expiresAt, new Date()),
      ),
    );
  return row ?? null;
}

export async function consumeToken(id: number) {
  await db.update(schema.authTokens).set({ usedAt: new Date() }).where(eq(schema.authTokens.id, id));
}
