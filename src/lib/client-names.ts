import { ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { FormError } from "./form";
import { isSimilar } from "./similar";

export type ClientNameMatches = { exact: { id: number; name: string } | null; similar: { id: number; name: string }[] };

/** Trims and collapses inner spaces, so "SABIC " and "SABIC" are the same name. */
export const cleanClientName = (name: string) => name.trim().replace(/\s+/g, " ");

/** The name without bracketed parts and with "and" as "&": "Larsen and Toubro (L&T)" -> "Larsen & Toubro". */
const core = (name: string) => name.replace(/\([^)]*\)/g, " ").replace(/\band\b/gi, "&").replace(/\s+/g, " ").trim();
const letters = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** True when `name` looks like this client: a near spelling, the same core name, or its short code. */
export const looksLike = (c: { name: string; shortCode?: string | null }, name: string) =>
  isSimilar(c.name, name) || isSimilar(core(c.name), core(name)) || (!!c.shortCode && letters(c.shortCode) === letters(name));

/**
 * Clients with the same name (ignoring case) and those that look alike: a near spelling ("Sabbic" ~ "SABIC"),
 * the same name without brackets or with "and"/"&" swapped, or the client's short code ("L & T" ~ "L&T").
 */
export async function clientNameMatches(name: string, excludeId?: number | null): Promise<ClientNameMatches> {
  const clean = cleanClientName(name);
  if (!clean) return { exact: null, similar: [] };
  const all = await db
    .select({ id: schema.clients.id, name: schema.clients.name, shortCode: schema.clients.shortCode })
    .from(schema.clients)
    .where(excludeId ? ne(schema.clients.id, excludeId) : undefined);
  const found = all.find((c) => c.name.toLowerCase() === clean.toLowerCase());
  const exact = found ? { id: found.id, name: found.name } : null;
  const similar = all
    .filter((c) => c.id !== exact?.id && looksLike(c, clean))
    .slice(0, 5)
    .map((c) => ({ id: c.id, name: c.name }));
  return { exact, similar };
}

/**
 * Server-side rule for a new or renamed client: the same name (any case) is refused; a similar
 * name is refused until the person confirms it's a different company (`confirmDifferent` ticked).
 */
export async function assertClientName(name: string, opts: { excludeId?: number | null; confirmed: boolean; previousName?: string | null }) {
  const clean = cleanClientName(name);
  const { exact, similar } = await clientNameMatches(clean, opts.excludeId);
  if (exact) throw new FormError(`"${exact.name}" already exists in the client master. Open it instead of adding it again; if you can't find it, it belongs to another business unit, so ask an Admin to add your unit to it.`);
  const renamed = !opts.previousName || opts.previousName.toLowerCase() !== clean.toLowerCase();
  if (renamed && similar.length && !opts.confirmed)
    throw new FormError(
      `${similar.length === 1 ? "A similar client already exists" : "Similar clients already exist"}: ${similar.map((s) => s.name).join(", ")}. If this is a different company, tick "This is a different company" and save again.`,
    );
  return clean;
}
