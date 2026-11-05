// Backup and restore drill (local).
//
//   node scripts/backup-drill.mjs <source DATABASE_URL>
//
// 1. pg_dump the whole source database (custom format, like a real backup).
//    Cluster-level roles (mk_app) are not in a dump; the target cluster must
//    already have them (see docs/runbook.md).
// 2. Restore into a fresh scratch database `<source>_restore`.
// 3. Compare per-table row counts and confirm the security posture survived:
//    RLS enabled on every table, the same policies, definer functions and
//    triggers, and mk_app grants.
// 4. Drop the scratch database.
//
// Refuses non-local hosts: drills against production happen on the hosting
// provider's own restore tooling (see docs/runbook.md).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require("pg");

const src = process.argv[2] ?? process.env.DATABASE_URL;
if (!src) {
  console.error("usage: node scripts/backup-drill.mjs <DATABASE_URL>");
  process.exit(2);
}
const u = new URL(src);
if (!["localhost", "127.0.0.1", "::1"].includes(u.hostname)) {
  console.error(`Refusing to drill against non-local host ${u.hostname}.`);
  process.exit(2);
}
const srcDb = u.pathname.slice(1);
const dstDb = `${srcDb}_restore`;
const withDb = (name) => {
  const x = new URL(src);
  x.pathname = `/${name}`;
  return x.toString();
};
const admin = withDb("postgres");
const dump = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mk-drill-")), "app.dump");

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${(r.stderr || r.stdout).slice(-800)}`);
  return r.stdout;
};
async function query(url, sql) {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    return (await c.query(sql)).rows;
  } finally {
    await c.end();
  }
}

const POSTURE = `
  select
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'app' and c.relkind = 'r')::int as tables,
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'app' and c.relkind = 'r' and c.relrowsecurity)::int as rls_tables,
    (select count(*) from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'app')::int as policies,
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app' and p.prosecdef)::int as definers,
    (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'app' and not t.tgisinternal)::int as triggers,
    (select count(*) from information_schema.role_table_grants where grantee = 'mk_app' and table_schema = 'app')::int as mk_app_grants`;
const COUNTS = `select c.relname as t, (xpath('/row/n/text()', query_to_xml('select count(*) as n from app.' || quote_ident(c.relname), false, true, '')))[1]::text::int as n
                 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'app' and c.relkind = 'r' order by 1`;

const t0 = Date.now();
const problems = [];
try {
  run("pg_dump", ["--format=custom", "--file", dump, src]);
  const size = fs.statSync(dump).size;
  await query(admin, `drop database if exists "${dstDb}"`);
  await query(admin, `create database "${dstDb}"`);
  run("pg_restore", ["--exit-on-error", "--dbname", withDb(dstDb), dump]);

  const [a] = await query(src, POSTURE);
  const [b] = await query(withDb(dstDb), POSTURE);
  for (const k of Object.keys(a)) if (a[k] !== b[k]) problems.push(`${k}: source ${a[k]} ≠ restored ${b[k]}`);
  if (b.rls_tables !== b.tables) problems.push(`RLS missing on ${b.tables - b.rls_tables} restored table(s)`);

  const ca = await query(src, COUNTS);
  const cb = new Map((await query(withDb(dstDb), COUNTS)).map((r) => [r.t, r.n]));
  for (const r of ca) if (cb.get(r.t) !== r.n) problems.push(`rows in ${r.t}: source ${r.n} ≠ restored ${cb.get(r.t)}`);

  const total = ca.reduce((n, r) => n + r.n, 0);
  if (problems.length) {
    console.log(`✗ restore drill: ${problems.length} problem(s)\n  ${problems.join("\n  ")}`);
  } else {
    console.log(`✓ restore drill: ${ca.length} tables, ${total} rows, ${a.policies} policies, ${a.definers} definer functions, ${a.triggers} triggers matched (dump ${(size / 1024).toFixed(0)} KB, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
} catch (e) {
  problems.push(e.message);
  console.log(`✗ restore drill failed: ${e.message}`);
} finally {
  await query(admin, `drop database if exists "${dstDb}"`).catch(() => {});
  fs.rmSync(path.dirname(dump), { recursive: true, force: true });
}
process.exit(problems.length ? 1 : 0);
