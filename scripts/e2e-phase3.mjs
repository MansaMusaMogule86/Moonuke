// Phase 3 end-to-end: recovery, email, MFA, account security, blocking,
// reporting & moderation, creator verification, admin UI state, axe.
// Requires a freshly seeded DB (pnpm db:seed), EMAIL_TRANSPORT=dev, a running server.
//   BASE=http://localhost:3000 DATABASE_URL=… SHOTS=./screenshots node scripts/e2e-phase3.mjs
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { Client } = require("pg");
const axePath = require.resolve("axe-core/axe.min.js");
import { totp, DEV_OWNER_TOTP_SECRET } from "./lib/totp.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS;
const PW = "moonuke-dev-password";
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });
const browser = await chromium.launch();
const desktop = { viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" };
const mobile = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" };

async function shot(page, name) {
  if (!SHOTS) return;
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}
async function axe(page, label) {
  await page.waitForTimeout(1400);
  await page.addScriptTag({ path: axePath });
  const r = await page.evaluate(() => axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
  const v = r.violations.map((x) => `${x.id} (${x.nodes.length}): ${x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
  check(`axe ${label}`, v.length === 0, v.join("\n    "));
}
const formAlert = (page) => page.locator("form [role=alert], [data-form-message][role=alert]").first();
async function lastMail(to, template) {
  const r = await db.query(`select body_text from app.email_outbox where to_email = $1 and template = $2 order by created_at desc limit 1`, [to, template]);
  return r.rows[0]?.body_text ?? null;
}
async function signIn(email, password = PW, opts = desktop) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/signin`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(discover|pending|signin\/verify|account\/security)/);
  return { ctx, page };
}

// ================================================================ password recovery
{
  const ctx = await browser.newContext(desktop);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/signin`);
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await page.waitForURL(/\/forgot$/);
  await axe(page, "/forgot @1440");
  await page.getByLabel("Email").fill("velvet@moonuke.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await page.getByText("If an account uses that address").waitFor();
  check("forgot: generic confirmation", true);
  const body = await lastMail("velvet@moonuke.test", "password_reset");
  const link = body?.match(/https?:\/\/\S+\/reset\/[A-Za-z0-9_-]{43}/)?.[0];
  check("reset email queued with link", !!link);
  await page.goto(link.replace(/^https?:\/\/[^/]+/, BASE));
  await shot(page, "reset-desktop");
  await axe(page, "/reset/[token] @1440");
  await page.getByLabel("New password").fill("velvet-new-password-1");
  await page.getByLabel("Confirm password").fill("velvet-new-password-1");
  await page.getByRole("button", { name: "Set new password" }).click();
  await page.waitForURL(/\/signin\?reset=1/);
  check("reset → sign-in with notice", await page.getByText("Your password was changed").isVisible());
  await page.goto(link.replace(/^https?:\/\/[^/]+/, BASE));
  check("reset link is single-use", await page.getByRole("heading", { name: /expired/ }).isVisible());
  // unknown address → same response
  await page.goto(`${BASE}/forgot`);
  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await page.getByText("If an account uses that address").waitFor();
  check("forgot: unknown email gets identical response", true);
  const v = await signIn("velvet@moonuke.test", "velvet-new-password-1");
  check("new password works", v.page.url().endsWith("/discover"));
  await v.ctx.close();
  await ctx.close();
}

// ---- (later sections are appended by subsequent Phase 3 commits) ----
//@@SECTIONS@@

await browser.close();
await db.end();
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? "✓" : "✗"} ${r.name}${!r.ok && r.detail ? `\n    ${r.detail}` : ""}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
