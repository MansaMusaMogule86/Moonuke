// Statements of reasons and appeals end-to-end: a house decision notifies the
// creator, the creator reads the reasons and appeals once, the owner
// overturns, the content returns. Access denial; axe at 1440 and 390 px.
// Requires a freshly seeded DB and a running production server.
//   BASE=http://localhost:3000 DATABASE_URL=… SHOTS=./screenshots node scripts/e2e-notices.mjs
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

// A post waiting for review; the owner rejects it in the UI.
const post = await postOf("isadora", "preview");
await db.query(`update app.posts set review_state = 'pending', review_reasons = '{all_content}' where id = $1`, [post.id]);
const o = await signIn("owner@moonuke.test");
await o.page.goto(`${BASE}/admin/safety/review`);
const card = o.page.locator("li", { hasText: post.teaser });
await card.getByLabel(/Note for the creator/).fill("The frame shows a third-party logo.");
await card.getByRole("button", { name: "Reject" }).click();
await o.page.getByText(/^Rejected/).waitFor();
check("rejection issues a notice", (await one(`select count(*)::int as n from app.moderation_notices where post_id = $1`, [post.id])).n === 1);

// Creator sees and reads it.
const c = await signIn("isadora@moonuke.test");
await c.page.goto(`${BASE}/studio`);
check("studio shows new notices", await visible(c.page.getByRole("link", { name: "Notices (1 new)" })));
await c.page.goto(`${BASE}/notifications`);
check("in-app notification links to notices", await visible(c.page.getByText("A decision about your content")));
await c.page.goto(`${BASE}/studio/notices`);
check("statement states the decision", await visible(c.page.getByText(/wasn't approved for publication/)));
check("statement explains automation and redress", (await bodyText(c.page)).includes("No. A person made this decision.") && /appeal this decision once/i.test(await bodyText(c.page)));
check("statement includes the house note", (await bodyText(c.page)).includes("third-party logo"));
await axe(c.page, "studio notices @1440");
await shot(c.page, "studio-notices");
await c.page.getByLabel("Why should this decision change?").fill("short");
await c.page.getByRole("button", { name: "Send appeal" }).click();
check("too-short appeal refused", await visible(c.page.getByText(/10 to 2,000 characters/)));
await c.page.getByLabel("Why should this decision change?").fill("The logo is my own studio mark, registered to me.");
await c.page.getByRole("button", { name: "Send appeal" }).click();
await c.page.getByText(/^Appeal sent/).waitFor();
await c.page.reload();
check("one appeal only: the form is gone", (await c.page.getByLabel("Why should this decision change?").count()) === 0 && /appeal under review/i.test(await bodyText(c.page)));

const cm = await signIn("isadora@moonuke.test", mobile);
await cm.page.goto(`${BASE}/studio/notices`);
await axe(cm.page, "studio notices @390");
await noOverflow(cm.page, "studio notices @390");

// Access control.
const m = await signIn("velvet@moonuke.test");
check("member → /studio/notices is 404", (await m.page.goto(`${BASE}/studio/notices`)).status() === 404);
check("creator → /admin/safety/appeals is 404", (await c.page.goto(`${BASE}/admin/safety/appeals`)).status() === 404);
await m.page.goto(`${BASE}/c/isadora`);
check("rejected post hidden from members", !(await bodyText(m.page)).includes(post.teaser));

// Owner overturns.
await o.page.goto(`${BASE}/admin/safety/appeals`);
check("appeal in the owner queue", await visible(o.page.getByText(/my own studio mark/)));
await axe(o.page, "admin appeals @1440");
await o.page.getByLabel("Note for the creator").fill("Agreed: it is your own mark.");
await o.page.getByRole("button", { name: "Overturn" }).click();
await o.page.getByText(/^Overturned/).waitFor();
check("overturn approves the post", (await one(`select review_state from app.posts where id = $1`, [post.id])).review_state === "approved");
await m.page.goto(`${BASE}/c/isadora`);
check("post visible to members again", (await bodyText(m.page)).includes(post.teaser));
await c.page.goto(`${BASE}/studio/notices`);
check("creator sees the outcome and note", /appeal: decision reversed/i.test(await bodyText(c.page)) && (await bodyText(c.page)).includes("Agreed: it is your own mark."));
check("appeal decision audited", (await one(`select count(*)::int as n from app.audit_log where action = 'appeal.overturn'`)).n === 1);

const om = await signIn("owner@moonuke.test", mobile);
await om.page.goto(`${BASE}/admin/safety/appeals`);
await axe(om.page, "admin appeals @390");
await noOverflow(om.page, "admin appeals @390");

await browser.close();
await db.end();
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? "✓" : "✗"} ${r.name}${!r.ok && r.detail ? `\n    ${r.detail}` : ""}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
