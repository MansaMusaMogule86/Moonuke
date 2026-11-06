// Age assurance and regional rules end-to-end, with both features OFF (as
// shipped): entry points are bare 404s, prepared rules have no effect, the
// owner page reports the features as awaiting approval. Axe at 1440 and 390 px.
// Requires a freshly seeded DB and a running production server.
//   BASE=http://localhost:3000 DATABASE_URL=… SHOTS=./screenshots node scripts/e2e-access.mjs
import { createRequire } from "node:module";
import fs from "node:fs";
import { freshCode, DEV_OWNER_TOTP_SECRET } from "./lib/totp.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { Client } = require("pg");
const axePath = require.resolve("axe-core/axe.min.js");

const BASE = process.env.BASE ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS;
const PW = "moonuke-dev-password";
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
  await page.waitForTimeout(1200);
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
const postOf = (handle, access) =>
  one(`select p.id, p.teaser from app.posts p join app.creators c on c.user_id = p.creator_id where c.handle = $1 and p.access = $2 and p.published_at <= now() order by p.published_at desc limit 1`, [handle, access]);

async function fillNotice(page, { category, role, location, email = "requester@example.test", agree = true }) {
  await page.getByLabel("What is this about?").selectOption(category);
  await page.getByLabel("How are you connected to it?").selectOption(role);
  await page.getByLabel("Where is the content?").fill(location);
  await page.getByLabel("Your name").fill("Fictional Requester");
  await page.getByLabel("Email for our reply").fill(email);
  if (agree) await page.getByLabel(/I believe in good faith/).check();
  await page.getByLabel("Signature: type your full name").fill("Fictional Requester");
  await page.getByRole("button", { name: "Send notice" }).click();
}

const bodyText = (pg) => pg.locator("body").innerText();
const visible = (loc) => loc.first().waitFor({ timeout: 10_000 }).then(() => true, () => false);

const m = await signIn("velvet@moonuke.test");
check("/verify-age is 404 while age checks are off", (await m.page.goto(`${BASE}/verify-age`)).status() === 404);
check("/verify-age/mock is 404", (await m.page.goto(`${BASE}/verify-age/mock?check=00000000-0000-0000-0000-000000000000`)).status() === 404);
const cb = await m.page.request.post(`${BASE}/api/age/callback/mock`, { data: "{}", headers: { "x-signature": "t=1,v1=00" } });
check("age callback is a bare 404 while off", cb.status() === 404 && (await cb.text()) === "Not found");
check("member → /admin/safety/access is 404", (await m.page.goto(`${BASE}/admin/safety/access`)).status() === 404);

const o = await signIn("owner@moonuke.test");
await o.page.goto(`${BASE}/admin/safety/access`);
const status = await o.page.getByTestId("access-status").innerText();
check("owner page shows both features off, awaiting approval", /regional rules: off \(awaiting approval\)/i.test(status) && /age checks: off \(awaiting approval\)/i.test(status));
await axe(o.page, "access rules @1440");
await shot(o.page, "access-rules");
await o.page.getByRole("textbox", { name: /^Country/ }).fill("ZZ");
await o.page.getByLabel("Rule", { exact: true }).selectOption("block");
await o.page.getByLabel(/^Note/).fill("Fictional test rule");
await o.page.getByRole("button", { name: "Save rule" }).click();
check("rule saved, with a no-effect warning", await visible(o.page.getByText(/no effect until regional rules are approved/)));
check("rule change audited", (await one(`select count(*)::int as n from app.audit_log where action = 'access.rule_set'`)).n === 1);
await db.query(`insert into app.jurisdiction_rules (country, rule, updated_by) values ('XX', 'block', (select id from app.users where role = 'owner'))`);
const d = await m.page.goto(`${BASE}/discover`);
check("a block rule has no effect while regional rules are off", d.status() === 200 && m.page.url().endsWith("/discover"));

const u = await (await browser.newContext(desktop)).newPage();
check("/unavailable renders", (await u.goto(`${BASE}/unavailable`)).status() === 200);
await axe(u, "unavailable @1440");

const om = await signIn("owner@moonuke.test", mobile);
await om.page.goto(`${BASE}/admin/safety/access`);
await axe(om.page, "access rules @390");
await noOverflow(om.page, "access rules @390");

await browser.close();
await db.end();
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? "✓" : "✗"} ${r.name}${!r.ok && r.detail ? `\n    ${r.detail}` : ""}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
