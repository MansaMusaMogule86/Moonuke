#!/usr/bin/env node
// =====================================================================
// pnpm verify — the complete local verification suite, one command.
//
//   pnpm verify            everything
//   pnpm verify --quick    skip the production server + browser suites
//
// Steps: preflight → typecheck → unit + PostgreSQL security tests →
// production build → production-env safety check → start a production
// server → seed + run every Playwright browser suite (incl. axe WCAG 2.1 AA)
// → report.
//
// Safety: browser suites RESET their database, so they run against a
// dedicated `<db>_e2e` database (never your dev DB). Server tests use
// `<db>_test`. Remote database hosts are refused unless VERIFY_ALLOW_REMOTE=1.
//
// This is a LOCAL run. It is not GitHub CI and the report says so.
// =====================================================================
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUICK = process.argv.includes("--quick");
const REPORT_DIR = path.join(ROOT, "reports");
const LOG_DIR = path.join(REPORT_DIR, "logs");
fs.mkdirSync(LOG_DIR, { recursive: true });

// ---------------------------------------------------------------- env
function loadDotEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
const dot = loadDotEnv(path.join(ROOT, ".env.local"));
const baseUrl = process.env.DATABASE_URL ?? dot.DATABASE_URL;
const withDb = (url, name) => {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
};
const dbName = (url) => new URL(url).pathname.replace(/^\//, "");

const results = [];
const t0 = Date.now();
const fmt = (ms) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

function record(step, ok, ms, detail = "") {
  results.push({ step, ok, ms, detail });
  const mark = ok === null ? "–" : ok ? "✓" : "✗";
  console.log(`${mark} ${step.padEnd(44)} ${fmt(ms).padStart(8)}  ${detail}`);
}

function run(step, cmd, args, env = {}, { summarize } = {}) {
  const start = Date.now();
  const logFile = path.join(LOG_DIR, `${step.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.log`);
  const r = spawnSync(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  fs.writeFileSync(logFile, out);
  const ok = r.status === 0;
  const detail = summarize ? summarize(out, ok) : ok ? "" : `see ${path.relative(ROOT, logFile)}`;
  record(step, ok, Date.now() - start, detail);
  if (!ok) {
    const tail = out.trim().split("\n").slice(-15).join("\n");
    console.log(`\n${tail.replace(/^/gm, "    │ ")}\n`);
  }
  return ok;
}

const vitestSummary = (out) => {
  const files = out.match(/Test Files\s+(.+)/)?.[1]?.trim();
  const tests = out.match(/Tests\s+(.+?)\s*\(/)?.[1]?.trim() ?? out.match(/Tests\s+(.+)/)?.[1]?.trim();
  return [tests && `tests: ${tests}`, files && `files: ${files}`].filter(Boolean).join(" · ");
};
const e2eSummary = (out) => {
  const line = out.match(/(\d+)\/(\d+) passed/);
  const failures = [...out.matchAll(/^✗ (.+)$/gm)].map((m) => m[1]).slice(0, 5);
  return (line ? `${line[1]}/${line[2]} checks` : "no summary") + (failures.length ? ` · failed: ${failures.join("; ")}` : "");
};

async function freePort() {
  return new Promise((res) => {
    const s = net.createServer();
    s.listen(0, () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });
}

async function waitFor(url, ms = 60_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// ---------------------------------------------------------------- main
console.log(`\nMOONUKE local verification${QUICK ? " (quick)" : ""} — ${new Date().toISOString()}\n`);

// 1. Preflight
{
  const start = Date.now();
  const problems = [];
  if (!baseUrl) problems.push("DATABASE_URL is not set (env or .env.local)");
  let host = "";
  if (baseUrl) {
    host = new URL(baseUrl).hostname;
    if (!["localhost", "127.0.0.1", "::1"].includes(host) && process.env.VERIFY_ALLOW_REMOTE !== "1") {
      problems.push(`refusing remote database host "${host}" (set VERIFY_ALLOW_REMOTE=1 to override)`);
    }
  }
  if (process.env.NODE_ENV === "production") problems.push("refusing to run with NODE_ENV=production");
  if (problems.length) {
    record("Preflight", false, Date.now() - start, problems.join("; "));
    process.exit(1);
  }
  const { Client } = require("pg");
  try {
    const c = new Client({ connectionString: withDb(baseUrl, "postgres") });
    await c.connect();
    for (const name of [`${dbName(baseUrl)}_test`, `${dbName(baseUrl)}_e2e`]) {
      const r = await c.query("select 1 from pg_database where datname = $1", [name]);
      if (!r.rowCount) await c.query(`create database "${name.replace(/"/g, "")}"`);
    }
    await c.end();
    record("Preflight (Postgres, isolated test DBs)", true, Date.now() - start, `${host} · ${dbName(baseUrl)}_test, ${dbName(baseUrl)}_e2e`);
  } catch (e) {
    record("Preflight (Postgres, isolated test DBs)", false, Date.now() - start, e.message);
    process.exit(1);
  }
}

const TEST_DB = process.env.TEST_DATABASE_URL ?? withDb(baseUrl, `${dbName(baseUrl)}_test`);
const E2E_DB = withDb(baseUrl, `${dbName(baseUrl)}_e2e`);
const SECRET = process.env.APP_SECRET ?? dot.APP_SECRET ?? "verify-only-not-a-secret-verify-only-not-a-secret";

run("Typecheck (tsc --noEmit, strict)", "pnpm", ["-s", "lint"]);
{
  // Dependency audit. Needs the registry; a network failure is reported as skipped, not passed.
  const start = Date.now();
  const r = spawnSync("pnpm", ["audit", "--prod"], { cwd: ROOT, encoding: "utf8", timeout: 90_000 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (/No known vulnerabilities found/.test(out)) record("Dependency audit (pnpm audit --prod)", true, Date.now() - start, "no known vulnerabilities");
  else if (/vulnerabilit/i.test(out) && !/ERR_|ENOTFOUND|ETIMEDOUT|ECONNRESET|fetch failed/i.test(out)) record("Dependency audit (pnpm audit --prod)", false, Date.now() - start, (out.match(/\d+ vulnerabilit[^\n]*/) ?? ["vulnerabilities found"])[0]);
  else record("Dependency audit (pnpm audit --prod)", null, Date.now() - start, "registry unreachable — not checked");
}
run("Unit + PostgreSQL security tests (vitest)", "pnpm", ["-s", "vitest", "run"], { TEST_DATABASE_URL: TEST_DB }, { summarize: vitestSummary });

if (!QUICK) {
  const port = await freePort();
  const APP_URL = `http://localhost:${port}`;
  const serverEnv = {
    DATABASE_URL: E2E_DB,
    APP_SECRET: SECRET,
    APP_URL,
    TRUSTED_PROXY: "none",
    EMAIL_TRANSPORT: "dev",
    AI_PROVIDER: "template",
    ALLOW_LOCAL_PRODUCTION: "true",
    NEXT_TELEMETRY_DISABLED: "1",
  };

  const built = run("Production build (next build)", "pnpm", ["-s", "build"], serverEnv);
  run(
    "Production env check rejects unsafe config",
    "node",
    ["-e", `const r=require('child_process').spawnSync('pnpm',['-s','env:check'],{env:{...process.env,NODE_ENV:'production',ALLOW_LOCAL_PRODUCTION:'',APP_URL:'http://example.com',DATABASE_URL:'${E2E_DB}'},encoding:'utf8'});process.exit(r.status===0?1:0)`],
  );

  if (built) {
    const start = Date.now();
    run("Migrate + seed e2e database", "pnpm", ["-s", "db:seed"], serverEnv);
    const logFile = fs.openSync(path.join(LOG_DIR, "server.log"), "w");
    const server = spawn(path.join(ROOT, "node_modules/.bin/next"), ["start", "-p", String(port)], {
      cwd: ROOT,
      env: { ...process.env, ...serverEnv, NODE_ENV: "production" },
      stdio: ["ignore", logFile, logFile],
      detached: true,
    });
    const up = await waitFor(`${APP_URL}/`);
    record("Start production server", up, Date.now() - start, up ? APP_URL : "did not respond; see reports/logs/server.log");

    if (up) {
      const suites = [
        ["Browser: Phase 1 homepage + axe", "scripts/e2e-smoke.mjs", { OUT: path.join(REPORT_DIR, "screens/phase1") }],
        ["Browser: Phase 2 access + entitlements + axe", "scripts/e2e-phase2.mjs", { SHOTS: path.join(REPORT_DIR, "screens/phase2") }],
        ["Browser: Phase 3 security + safety + axe", "scripts/e2e-phase3.mjs", { SHOTS: path.join(REPORT_DIR, "screens/phase3") }],
        ["Browser: Phase 4 onboarding + axe", "scripts/e2e-phase4.mjs", { SHOTS: path.join(REPORT_DIR, "screens/phase4") }],
        ["Browser: Phase 5 studio + axe", "scripts/e2e-phase5.mjs", { SHOTS: path.join(REPORT_DIR, "screens/phase5") }],
        ["Browser: Phase 6 fan app + axe", "scripts/e2e-phase6.mjs", { SHOTS: path.join(REPORT_DIR, "screens/phase6") }],
        ["Browser: Phase 7 messaging + axe", "scripts/e2e-phase7.mjs", { SHOTS: path.join(REPORT_DIR, "screens/phase7") }],
        ["Browser: release hardening + axe", "scripts/e2e-hardening.mjs", { SHOTS: path.join(REPORT_DIR, "screens/hardening") }],
        ["Browser: safety + compliance + axe", "scripts/e2e-safety.mjs", { SHOTS: path.join(REPORT_DIR, "screens/safety") }],
        ["Browser: notices + appeals + axe", "scripts/e2e-notices.mjs", { SHOTS: path.join(REPORT_DIR, "screens/notices") }],
      ];
      for (const [name, file, extra] of suites) {
        if (!fs.existsSync(path.join(ROOT, file))) {
          record(name, null, 0, "suite not present");
          continue;
        }
        spawnSync("pnpm", ["-s", "db:seed"], { cwd: ROOT, env: { ...process.env, ...serverEnv }, encoding: "utf8" });
        run(name, "node", [file], { ...serverEnv, BASE: APP_URL, ...extra }, { summarize: e2eSummary });
      }
    }
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
    // Backup → restore → compare (rows, RLS, policies, definers, triggers, grants).
    spawnSync("pnpm", ["-s", "db:seed"], { cwd: ROOT, env: { ...process.env, ...serverEnv }, encoding: "utf8" });
    run("Backup + restore drill (pg_dump → pg_restore)", "node", ["scripts/backup-drill.mjs", E2E_DB], {}, { summarize: (out) => (out.match(/[✓✗] restore drill[^\n]*/) ?? [""])[0].replace(/^[✓✗] restore drill:? ?/, "") });
  }
}

// ---------------------------------------------------------------- report
const failed = results.filter((r) => r.ok === false);
const commit = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout.trim();
const dirty = spawnSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).stdout.trim() ? " (uncommitted changes present)" : "";
const verdict = failed.length ? `FAIL — ${failed.length} step(s) failed` : "PASS";
const md = [
  `# Local verification report`,
  ``,
  `- **Result:** ${verdict}`,
  `- **When:** ${new Date().toISOString()}`,
  `- **Commit:** ${commit}${dirty}`,
  `- **Mode:** ${QUICK ? "quick (no browser suites)" : "full"}`,
  `- **Where:** local machine — **this is not a GitHub Actions run**`,
  `- **Duration:** ${fmt(Date.now() - t0)}`,
  ``,
  `| Step | Result | Time | Detail |`,
  `|---|---|---|---|`,
  ...results.map((r) => `| ${r.step} | ${r.ok === null ? "skipped" : r.ok ? "pass" : "**FAIL**"} | ${fmt(r.ms)} | ${r.detail.replace(/\|/g, "\\|")} |`),
  ``,
  `Logs: \`reports/logs/\` · Screenshots: \`reports/screens/\``,
].join("\n");
fs.writeFileSync(path.join(REPORT_DIR, "verify-report.md"), md + "\n");

console.log(`\n${"─".repeat(72)}\n${verdict}   (${fmt(Date.now() - t0)} · commit ${commit}${dirty})`);
console.log(`Report: reports/verify-report.md — local run, not GitHub CI\n`);
process.exit(failed.length ? 1 : 0);
