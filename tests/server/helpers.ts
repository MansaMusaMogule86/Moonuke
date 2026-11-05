import { migrate } from "../../scripts/migrate";
import { asViewer, closePool, system } from "@/server/db";
import type { Viewer } from "@/server/auth/permissions";
import { seed, type SeedResult } from "@/server/seed";

export async function resetDb(): Promise<SeedResult> {
  await closePool();
  await migrate(process.env.DATABASE_URL!, { reset: true, quiet: true });
  return seed();
}

export async function viewer(id: string): Promise<Viewer> {
  const v = await system((q) =>
    q.one<Omit<Viewer, "aal" | "mfa">>(`select id, role, status, alias::text as alias, email::text as email from app.users where id = $1`, [id]),
  );
  if (!v) throw new Error(`no user ${id}`);
  // Tests model an owner who has completed two-step sign-in in this session.
  return { ...v, aal: v.role === "owner" ? 2 : 1, mfa: v.role === "owner" ? "verified" : "none" };
}

/** Run raw SQL as a given viewer under RLS and return the Postgres error code, if any. */
export async function rlsError(viewerId: string | null, sql: string, params: unknown[] = [], aal: 1 | 2 = 2): Promise<string | null> {
  try {
    await asViewer(viewerId ? { id: viewerId, aal } : null, (q) => q.query(sql, params));
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? "unknown";
  }
}

export const meta = { ipHash: null, userAgent: "vitest" };

export { asViewer, system, closePool };
