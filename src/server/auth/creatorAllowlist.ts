import "server-only";
import type { Q } from "@/server/db";
import { isProd } from "@/server/env";

/**
 * The only addresses that may become creators in production. Mirrors the
 * rows inserted by migration 20261119000001 (a test checks they match). The
 * database enforces the same list with guard triggers for every write path;
 * this module lets the app refuse early with a clear message.
 */
export const PRODUCTION_CREATOR_ALLOWLIST: readonly string[] = ["hjaouhari0@gmail.com", "mehdi.alaouiismaili9@gmail.com"];

/** Trim and lower-case. No other rewriting (no dot or plus folding): matches are exact. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** Real production (not a local production build used for tests). */
const liveProduction = () => isProd() && process.env.ALLOW_LOCAL_PRODUCTION !== "true";

/**
 * Exact match against the allowlist table. In live production, rows added as
 * test fixtures never count, and the address must also be in the code list.
 * Needs a privileged (system) or owner (AAL2) transaction to read the table.
 */
export async function creatorEmailAllowed(q: Q, email: string): Promise<boolean> {
  const e = normalizeEmail(email);
  const row = await q.one<{ source: string }>(`select source from app.creator_allowlist where email = $1`, [e]);
  if (!row) return false;
  if (liveProduction()) return row.source === "production" && PRODUCTION_CREATOR_ALLOWLIST.includes(e);
  return true;
}
