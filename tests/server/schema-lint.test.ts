import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, resetDb, system } from "./helpers";

/**
 * Release hardening: mechanical checks over the whole `app` schema, so a
 * future migration can't silently ship a table without RLS, a definer
 * function without a pinned search_path, or a guard trigger that runs with
 * the owner's rights.
 */
beforeAll(async () => {
  await resetDb();
});
afterAll(closePool);

const rows = <R>(sql: string) => system((q) => q.query<R>(sql));

describe("schema security lint", () => {
  it("every table in schema app has RLS enabled", async () => {
    const r = await rows<{ table: string }>(
      `select c.relname as table from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'app' and c.relkind in ('r', 'p') and not c.relrowsecurity order by 1`,
    );
    expect(r.map((x) => x.table)).toEqual([]);
  });

  it("every table mk_app can read has at least one policy for it", async () => {
    const r = await rows<{ table: string }>(
      `select c.relname as table from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'app' and c.relkind = 'r' and has_table_privilege('mk_app', c.oid, 'select')
          and not exists (select 1 from pg_policy p where p.polrelid = c.oid) order by 1`,
    );
    expect(r.map((x) => x.table)).toEqual([]);
  });

  it("no policy applies to PUBLIC; all target mk_app", async () => {
    const r = await rows<{ policy: string }>(
      `select pol.polname || ' on ' || c.relname as policy from pg_policy pol join pg_class c on c.oid = pol.polrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'app' and (0 = any(pol.polroles) or not ('mk_app'::regrole = any(pol.polroles)))`,
    );
    expect(r.map((x) => x.policy)).toEqual([]);
  });

  it("PUBLIC has no privileges on app tables, and mk_app never has TRUNCATE, REFERENCES or TRIGGER", async () => {
    const pub = await rows<{ table: string }>(
      `select c.relname as table from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'app' and c.relkind = 'r'
          and exists (select 1 from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a where a.grantee = 0)`,
    );
    expect(pub.map((x) => x.table)).toEqual([]);
    const wide = await rows<{ table: string }>(
      `select c.relname as table from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'app' and c.relkind = 'r'
          and (has_table_privilege('mk_app', c.oid, 'truncate') or has_table_privilege('mk_app', c.oid, 'references') or has_table_privilege('mk_app', c.oid, 'trigger'))`,
    );
    expect(wide.map((x) => x.table)).toEqual([]);
  });

  it("mk_app can never write entitlements, the audit log's history, or other users' credentials", async () => {
    const can = (table: string, priv: string) =>
      system((q) => q.one<{ ok: boolean }>(`select has_table_privilege('mk_app', $1, $2) as ok`, [`app.${table}`, priv])).then((r) => r!.ok);
    for (const t of ["subscriptions", "purchases"]) {
      for (const p of ["insert", "update", "delete"]) expect(`${t}:${p}:${await can(t, p)}`).toBe(`${t}:${p}:false`);
    }
    for (const p of ["update", "delete"]) expect(`audit_log:${p}:${await can("audit_log", p)}`).toBe(`audit_log:${p}:false`);
    // Password hashes, MFA secrets and recovery codes are only reachable through system().
    const col = await system((q) => q.one<{ ok: boolean }>(`select has_column_privilege('mk_app', 'app.users', 'password_hash', 'select') as ok`));
    expect(col!.ok).toBe(false);
    for (const t of ["mfa_factors", "mfa_recovery_codes", "password_resets", "sessions"]) {
      expect(`${t}:select:${await can(t, "select")}`).toBe(`${t}:select:false`);
    }
  });

  it("every SECURITY DEFINER function pins search_path and is not executable by PUBLIC", async () => {
    const r = await rows<{ fn: string; pinned: boolean; public_exec: boolean }>(
      `select p.oid::regprocedure::text as fn,
              exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') as pinned,
              has_function_privilege('public', p.oid, 'execute') as public_exec
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'app' and p.prosecdef order by 1`,
    );
    expect(r.length).toBeGreaterThan(10);
    expect(r.filter((x) => !x.pinned).map((x) => x.fn)).toEqual([]);
    expect(r.filter((x) => x.public_exec).map((x) => x.fn)).toEqual([]);
  });

  it("guard triggers run as the caller (SECURITY INVOKER), so current_user checks mean something", async () => {
    const r = await rows<{ fn: string; definer: boolean }>(
      `select distinct p.proname as fn, p.prosecdef as definer from pg_trigger t join pg_proc p on p.oid = t.tgfoid
         join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'app' and not t.tgisinternal and p.proname like '%guard%'`,
    );
    expect(r.map((x) => x.fn).sort()).toEqual(expect.arrayContaining(["creators_guard", "posts_guard", "socials_guard", "tiers_guard"]));
    expect(r.filter((x) => x.definer).map((x) => x.fn)).toEqual([]);
  });

  it("mk_app is a plain login-less role: not superuser, no BYPASSRLS, no CREATE on the schema", async () => {
    const r = await system((q) =>
      q.one<{ super: boolean; bypass: boolean; create: boolean }>(
        `select rolsuper as super, rolbypassrls as bypass, has_schema_privilege('mk_app', 'app', 'create') as create from pg_roles where rolname = 'mk_app'`,
      ),
    );
    expect(r).toEqual({ super: false, bypass: false, create: false });
  });
});
