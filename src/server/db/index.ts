import "server-only";
import { Pool, type PoolClient } from "pg";
import { databaseUrl } from "@/server/env";

export type Q = {
  query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<R[]>;
  one<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<R | undefined>;
};

const g = globalThis as unknown as { __mkPool?: Pool };

export function pool(): Pool {
  if (!g.__mkPool) {
    g.__mkPool = new Pool({ connectionString: databaseUrl(), max: 10, idleTimeoutMillis: 30_000 });
  }
  return g.__mkPool;
}

/** For tests and scripts: close and forget the pool. */
export async function closePool() {
  await g.__mkPool?.end();
  g.__mkPool = undefined;
}

function wrap(c: PoolClient): Q {
  return {
    async query(text, params) {
      const r = await c.query(text, params as unknown[]);
      return r.rows;
    },
    async one(text, params) {
      const r = await c.query(text, params as unknown[]);
      return r.rows[0];
    },
  };
}

async function tx<T>(setup: (c: PoolClient) => Promise<void>, fn: (q: Q) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query("begin");
    await setup(c);
    const out = await fn(wrap(c));
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/**
 * Viewer-scoped transaction. Runs as the unprivileged `mk_app` role with the
 * viewer id bound, so every statement is filtered by row-level security.
 * Pass `null` for an anonymous viewer (RLS then denies almost everything).
 */
export function asViewer<T>(viewer: string | { id: string; aal?: 1 | 2 } | null, fn: (q: Q) => Promise<T>): Promise<T> {
  const id = typeof viewer === "string" ? viewer : viewer?.id ?? "";
  const aal = typeof viewer === "object" && viewer?.aal === 2 ? "2" : "1";
  return tx(async (c) => {
    await c.query("set local role mk_app");
    await c.query("select set_config('app.user_id', $1, true), set_config('app.aal', $2, true)", [id, aal]);
  }, fn);
}

/**
 * Privileged transaction for the narrow set of operations that must run
 * before a viewer exists or across viewers: sessions, sign-in lookup,
 * invitation redemption, rate limiting, session revocation.
 * Keep call sites few; each is listed in docs/phase-2-architecture.md.
 */
export function system<T>(fn: (q: Q) => Promise<T>): Promise<T> {
  return tx(async () => {}, fn);
}
