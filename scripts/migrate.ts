/**
 * Applies supabase/migrations/*.sql in filename order, once each.
 * Usage:  pnpm db:migrate            (uses DATABASE_URL)
 *         pnpm db:migrate --reset    (DEV ONLY: drops schema `app` first)
 * On Supabase, `supabase db push` applies the same files instead.
 */
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

export async function migrate(url: string, { reset = false, quiet = false } = {}) {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    if (reset) {
      if (process.env.NODE_ENV === "production") throw new Error("Refusing to reset in production.");
      await c.query("drop schema if exists app cascade");
      await c.query("drop table if exists public.mk_schema_migrations");
    }
    await c.query(`create table if not exists public.mk_schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
    const dir = path.resolve(__dirname, "../supabase/migrations");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const done = new Set((await c.query<{ name: string }>("select name from public.mk_schema_migrations")).rows.map((r) => r.name));
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = fs.readFileSync(path.join(dir, f), "utf8");
      await c.query("begin");
      try {
        await c.query(sql);
        await c.query("insert into public.mk_schema_migrations (name) values ($1)", [f]);
        await c.query("commit");
        if (!quiet) console.log(`applied ${f}`);
      } catch (e) {
        await c.query("rollback");
        throw new Error(`Migration ${f} failed: ${(e as Error).message}`);
      }
    }
  } finally {
    await c.end();
  }
}

if (require.main === module) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  migrate(url, { reset: process.argv.includes("--reset") })
    .then(() => console.log("migrations up to date"))
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
