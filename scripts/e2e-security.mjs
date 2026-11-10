// Security monitoring end-to-end: failed sign-ins raise an alert, the owner
// reviews it in /admin/security (overview, explorer, detail), acknowledges it,
// and non-owners get a bare 404. Axe at 1440 and 390 px.
// Requires a freshly seeded DB and a running production server.
//   BASE=http://localhost:3000 DATABASE_URL=… SHOTS=./screenshots node scripts/e2e-security.mjs
import { createRequire } from "node:module";
import fs from "node:fs";
import { freshCode, DEV_OWNER_TOTP_SECRET } from "./lib/totp.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { Client } = require("pg");
const axePath = require.resolve("axe-core/axe.min.js");

const BASE = process.env.BASE ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS;
const PW = "divafans-dev-password";
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];

const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });
const browser = await chromium.launch();
const desktop = { viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" };
const mobile = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" };

async function shot(page, name) {
  if (!SHOTS) return;
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}
async function axe(page, label) {
  await page.waitForTimeout(1000);
  await page.addScriptTag({ path: axePath });
  const r = await page.evaluate(() => axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
  const v = r.violations.map((x) => `${x.id} (${x.nodes.length}): ${x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
  check(`axe ${label}`, v.length === 0, v.join("\n    "));
}
async function noOverflow(page, label) {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(`${label}: no horizontal overflow`, o <= 0, String(o));
}
async function signIn(email, opts = desktop) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/signin`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PW);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(discover|pending|signin\/verify|studio)/);
  if (page.url().endsWith("/signin/verify")) {
    await page.getByLabel("Code").fill(await freshCode(DEV_OWNER_TOTP_SECRET));
    await page.getByRole("button", { name: "Verify" }).click();
    await page.waitForURL(/\/(admin|discover)/);
  }
  return { ctx, page };
}

// ---- Five failed sign-ins for one (nonexistent) account through the real form.
{
  const ctx = await browser.newContext(desktop);
  const page = await ctx.newPage();
  for (let i = 0; i < 5; i++) {
    await page.goto(`${BASE}/signin`);
    await page.getByLabel("Email").fill("intruder@example.test");
    await page.getByLabel("Password").fill(`not-the-password-${i}`);
    await page.getByRole("button", { name: "Sign in" }).click();
    // Wait for the form's own message (Next's route announcer also has role=alert).
    await page.getByText(/don't match an account|Too many attempts/).waitFor();
  }
  const msg = await page.getByText(/don't match an account|Too many attempts/).first().innerText();
  check("failed sign-in message doesn't reveal whether the account exists", /don't match an account|Too many attempts/.test(msg), msg);
  await ctx.close();
}
const failed = await one(`select count(*)::int as n from app.security_events where event_type = 'auth.login.failed' and actor_user_id is null`);
check("failed attempts are recorded server-side", failed.n >= 5, String(failed.n));
const raw = await one(`select count(*)::int as n from app.security_events where metadata::text ilike '%intruder%' or account_ref ilike '%intruder%'`);
check("the submitted email is never stored", raw.n === 0);
const alert = await one(`select id, severity, notified_outbox_id from app.security_alerts where alert_type = 'failed_logins_account'`);
check("threshold raised a high alert that was queued for email", alert && alert.severity === "high" && alert.notified_outbox_id);

// ---- Owner console
const o = await signIn("owner@divafans.test");
const ok = await o.page.goto(`${BASE}/admin/security`);
check("owner: console loads", ok.status() === 200);
check("owner: heading", await o.page.getByRole("heading", { level: 1, name: /Security monitoring/ }).isVisible());
check("owner: own sign-in is counted", await o.page.getByText("Successful sign-ins · 24 h").isVisible());
const alertItem = o.page.locator("li").filter({ hasText: /failed sign-in attempts? for one account/ }).first();
check("owner: alert listed with its summary", await alertItem.isVisible());
check("owner: tab is in the console nav", await o.page.getByRole("link", { name: "Security", exact: true }).first().isVisible());
await shot(o.page, "security-overview-desktop");
await axe(o.page, "/admin/security @1440");

await alertItem.getByLabel("Investigation note").fill("Seen in e2e: nonexistent account.");
await alertItem.getByRole("button", { name: "Acknowledge" }).click();
await o.page.getByText("Alert acknowledged.").waitFor();
const acked = await one(`select status, note from app.security_alerts where id = $1`, [alert.id]);
check("owner: acknowledge persists with the note", acked.status === "acknowledged" && /e2e/.test(acked.note));

await o.page.goto(`${BASE}/admin/security/events?type=auth.login.failed`);
check("explorer: filtered list", await o.page.getByText(/\d+ events? · page 1 of/).isVisible());
await axe(o.page, "/admin/security/events @1440");
await o.page.getByRole("link", { name: "Failed sign-in" }).first().click();
await o.page.getByRole("heading", { level: 1, name: "Failed sign-in" }).waitFor();
check("detail: shows the keyed-hash note instead of an email", await o.page.getByText(/matched by keyed hash only/).isVisible());
await shot(o.page, "security-event-desktop");
await axe(o.page, "/admin/security/events/[id] @1440");
const viewed = await one(`select count(*)::int as n from app.audit_log where action = 'security.event_view'`);
check("detail views are audited", viewed.n >= 1);
await o.ctx.close();

const om = await signIn("owner@divafans.test", mobile);
await om.page.goto(`${BASE}/admin/security`);
await shot(om.page, "security-overview-mobile");
await axe(om.page, "/admin/security @390");
await noOverflow(om.page, "/admin/security @390");
await om.page.goto(`${BASE}/admin/security/events`);
await axe(om.page, "/admin/security/events @390");
await noOverflow(om.page, "/admin/security/events @390");
await om.ctx.close();

// ---- Non-owners: bare 404, nothing leaks
for (const email of ["velvet@divafans.test", "isadora@divafans.test"]) {
  const u = await signIn(email);
  for (const path of ["/admin/security", "/admin/security/events", `/admin/security/events/1`]) {
    const r = await u.page.goto(`${BASE}${path}`);
    check(`${email.split("@")[0]}: ${path} is a 404`, r.status() === 404, String(r.status()));
  }
  await u.ctx.close();
}

await browser.close();
await db.end();
let failures = 0;
for (const r of results) {
  if (!r.ok) failures++;
  console.log(`${r.ok ? "✓" : "✗"} ${r.name}${!r.ok && r.detail ? `\n    ${r.detail}` : ""}`);
}
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
