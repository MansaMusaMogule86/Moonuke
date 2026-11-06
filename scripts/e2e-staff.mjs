// Restricted moderator role end-to-end, OFF as shipped: the console is a 404
// even with a grant and the owner's switch on in the database, granting is
// refused until approved, and the owner page reports the status. Axe at 1440/390.
// Requires a freshly seeded DB and a running production server.
//   BASE=http://localhost:3000 DATABASE_URL=… SHOTS=./screenshots node scripts/e2e-staff.mjs
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

const o = await signIn("owner@moonuke.test");
await o.page.goto(`${BASE}/admin/staff`);
const st = await o.page.getByTestId("staff-status").innerText();
check("owner page: server flag off, awaiting approval", /server flag: off \(awaiting approval\)/i.test(st) && /your switch: off/i.test(st));
check("no switch offered while the flag is off", (await o.page.getByRole("button", { name: /Switch moderator access/ }).count()) === 0);
await axe(o.page, "admin staff @1440");
await shot(o.page, "admin-staff");
await o.page.getByLabel("Member's email").fill("velvet@moonuke.test");
await o.page.getByLabel(/See the report queue/).check();
await o.page.getByRole("button", { name: "Grant" }).click();
check("granting is refused until approved", await visible(o.page.getByText("Moderator access isn't approved yet.")));
check("no grant stored", (await one(`select count(*)::int as n from app.staff_grants`)).n === 0);

// Even a grant and the owner's switch set directly in the database don't open anything while the server flag is off.
await db.query(`insert into app.mfa_factors (user_id, secret_enc, confirmed_at) select id, 'x', now() from app.users where email = 'velvet@moonuke.test' on conflict do nothing`);
await db.query(`insert into app.staff_grants (user_id, capabilities, granted_by) select u.id, array['reports.view','reports.decide','content.hide','review.decide','takedowns.decide','appeals.decide'], (select id from app.users where role = 'owner') from app.users u where u.email = 'velvet@moonuke.test'`);
await db.query(`update app.safety_settings set moderators_enabled = true`);
await db.query(`delete from app.mfa_factors where user_id = (select id from app.users where email = 'velvet@moonuke.test')`);
const m = await signIn("velvet@moonuke.test");
check("member with a grant → /staff is 404 (flag off)", (await m.page.goto(`${BASE}/staff`)).status() === 404);
check("member with a grant → /admin/staff is 404", (await m.page.goto(`${BASE}/admin/staff`)).status() === 404);
check("member with a grant → /admin/moderation is 404", (await m.page.goto(`${BASE}/admin/moderation`)).status() === 404);
const c = await signIn("isadora@moonuke.test");
check("creator → /staff is 404", (await c.page.goto(`${BASE}/staff`)).status() === 404);

const om = await signIn("owner@moonuke.test", mobile);
await om.page.goto(`${BASE}/admin/staff`);
await axe(om.page, "admin staff @390");
await noOverflow(om.page, "admin staff @390");

await browser.close();
await db.end();
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? "✓" : "✗"} ${r.name}${!r.ok && r.detail ? `\n    ${r.detail}` : ""}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
