// Phase 6 end-to-end: fan app — library, vault with signed media, purchases,
// memberships (cancel at period end), notifications, access, axe WCAG 2.1 AA.
// Requires a freshly seeded DB and a running production server.
//   BASE=http://localhost:3000 SHOTS=./screenshots node scripts/e2e-phase6.mjs
import { createRequire } from "node:module";
import fs from "node:fs";
import { freshCode, DEV_OWNER_TOTP_SECRET } from "./lib/totp.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const axePath = require.resolve("axe-core/axe.min.js");

const BASE = process.env.BASE ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS;
const PW = "moonuke-dev-password";
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });
const browser = await chromium.launch();
const desktop = { viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" };
const mobile = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" };

async function shot(page, name) {
  if (!SHOTS) return;
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}
async function axe(page, label) {
  await page.waitForTimeout(1400);
  await page.addScriptTag({ path: axePath });
  const r = await page.evaluate(() => axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
  const v = r.violations.map((x) => `${x.id} (${x.nodes.length}): ${x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
  check(`axe ${label}`, v.length === 0, v.join("\n    "));
}
async function signIn(email, opts = desktop, password = PW) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/signin`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(discover|pending|signin\/verify)/);
  if (page.url().endsWith("/signin/verify")) {
    await page.getByLabel("Code").fill(await freshCode(DEV_OWNER_TOTP_SECRET));
    await page.getByRole("button", { name: "Verify" }).click();
    await page.waitForURL(/\/(admin|discover)/);
  }
  return { ctx, page };
}

// ================================================================ dashboard
const n = await signIn("nocturne@moonuke.test");
await n.page.goto(`${BASE}/library`);
check("library: memberships listed", (await n.page.locator("section").filter({ has: n.page.getByRole("heading", { name: "Memberships" }) }).getByRole("listitem").count()) >= 3);
check("library: following listed", (await n.page.locator("section").filter({ has: n.page.getByRole("heading", { name: "Following" }) }).getByRole("listitem").count()) === 2);
check("library: nav item present", await n.page.getByRole("navigation", { name: "Club" }).first().getByRole("link", { name: "Library" }).isVisible());
await shot(n.page, "library-desktop");
await axe(n.page, "/library @1440");

// ================================================================ vault + signed media
await n.page.goto(`${BASE}/library/vault`);
const tiles = n.page.getByRole("list", { name: "Unlocked posts" }).getByRole("listitem");
check("vault: has unlocked posts", (await tiles.count()) > 0);
await axe(n.page, "/library/vault @1440");
const src0 = await tiles.first().locator("img").getAttribute("src");
const own = await n.ctx.request.get(`${BASE}${src0}`);
check("vault media loads for its owner", own.status() === 200 && /image\/svg/.test(own.headers()["content-type"] ?? ""));
check("vault media is not cacheable", /no-store/.test(own.headers()["cache-control"] ?? ""));
const v = await signIn("velvet@moonuke.test");
const stolen = await v.ctx.request.get(`${BASE}${src0}`);
check("signed URL is useless to another member", stolen.status() === 404);
const anon = await browser.newContext(desktop);
check("signed URL is useless signed out", (await anon.request.get(`${BASE}${src0}`)).status() === 404);
const tampered = src0.replace(/sig=[^&]+/, "sig=AAAA");
check("tampered signature → 404", (await n.ctx.request.get(`${BASE}${tampered}`)).status() === 404);
const otherIndex = src0.replace(/\/(\d+)\?/, "/7?");
check("signature bound to the asset index", (await n.ctx.request.get(`${BASE}${otherIndex}`)).status() === 404);
await v.page.goto(`${BASE}/library/vault`);
check("member without memberships: empty vault", (await v.page.getByRole("list", { name: "Unlocked posts" }).count()) === 0);
const filtered = await n.page.goto(`${BASE}/library/vault?creator=isadora`);
check("vault filter by creator", filtered.ok() && (await n.page.getByText("Showing @isadora").isVisible()));

// ================================================================ purchases
await n.page.goto(`${BASE}/library/purchases`);
const pur = n.page.getByRole("list", { name: "Your purchases" }).getByRole("listitem");
check("purchases: one unlocked purchase", (await pur.count()) === 1 && /unlocked/i.test(await pur.first().innerText()));
check("purchases: no price shown", !/\$\d/.test(await n.page.locator("main").innerText()));
await axe(n.page, "/library/purchases @1440");
await pur.first().getByRole("link", { name: /Open/ }).click();
await n.page.waitForURL(/\/c\/mireille#post-/);
check("purchase opens the post on the profile", await n.page.locator(`[id^="post-"]`).first().isVisible());

// ================================================================ memberships: cancel at period end, then keep
await n.page.goto(`${BASE}/library/memberships`);
await axe(n.page, "/library/memberships @1440");
const isa = n.page.getByRole("article", { name: "Membership: Isadora Lune" });
await isa.getByRole("button", { name: /Cancel membership/ }).click();
await isa.getByRole("button", { name: "Yes, cancel" }).click();
await isa.getByText("will end at the close").waitFor();
check("cancel: badge shows Ending", await isa.getByText("Ending", { exact: true }).isVisible());
await n.page.goto(`${BASE}/library/vault?creator=isadora`);
check("cancel: access continues until period end", (await n.page.getByRole("list", { name: "Unlocked posts" }).getByRole("listitem").count()) > 0);
await n.page.goto(`${BASE}/library/memberships`);
await n.page.getByRole("article", { name: "Membership: Isadora Lune" }).getByRole("button", { name: "Keep my membership" }).click();
await n.page.getByText("will continue").waitFor();
check("resume: membership continues", true);

// ================================================================ notifications from a new post
const c = await signIn("isadora@moonuke.test");
await c.page.goto(`${BASE}/studio/posts/new`);
await c.page.getByLabel("Teaser").fill("E2E fan notice");
await c.page.getByLabel("Post", { exact: true }).fill("Body only members see.");
await c.page.getByLabel("Who can see it").selectOption("members");
await c.page.getByRole("radio", { name: "Publish now" }).check();
await c.page.locator("form").getByRole("button", { name: "Publish" }).click();
await c.page.getByTestId("post-saved").waitFor();
await n.page.goto(`${BASE}/library`);
const bell = n.page.getByRole("link", { name: /^Notifications, \d+ unread$/ });
check("bell shows unread count", await bell.isVisible());
await bell.click();
await n.page.waitForURL(/\/notifications$/);
await shot(n.page, "notifications-desktop");
await axe(n.page, "/notifications @1440");
const item = n.page.getByRole("list", { name: "Notifications" }).getByRole("link").filter({ hasText: "Isadora Lune posted" }).first();
check("notification lists the new post", /E2E fan notice/.test(await item.innerText()));
// Fresh load: the notifications page itself must never carry post bodies.
const fresh = await n.ctx.request.get(`${BASE}/notifications`);
check("notification never shows the post body", fresh.ok() && !(await fresh.text()).includes("Body only members see."));
await item.click();
await n.page.waitForURL(/\/c\/isadora#post-/);
await n.page.goto(`${BASE}/notifications`);
check("opened notification is read", !/Unread: Isadora Lune posted/.test(await n.page.getByRole("list", { name: "Notifications" }).innerText()));
const velvetNotes = await v.page.goto(`${BASE}/notifications`);
check("non-follower got nothing", velvetNotes.ok() && (await v.page.getByText("Nothing yet.").isVisible()));

// ================================================================ access
const o = await signIn("owner@moonuke.test");
check("owner /library → 404 (admin only)", (await o.page.goto(`${BASE}/library`)).status() === 404);
const anonPage = await anon.newPage();
await anonPage.goto(`${BASE}/library/vault`);
check("signed out → sign in", /\/signin/.test(anonPage.url()));

// ================================================================ mobile
const nm = await signIn("nocturne@moonuke.test", mobile);
for (const p of ["/library", "/library/vault", "/library/memberships", "/library/purchases", "/notifications"]) {
  await nm.page.goto(`${BASE}${p}`);
  await axe(nm.page, `${p} @390`);
  const ov = await nm.page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(`mobile ${p}: no horizontal overflow`, ov <= 0, String(ov));
}
await nm.page.goto(`${BASE}/library`);
await shot(nm.page, "library-mobile");
check("mobile nav has Library", await nm.page.getByRole("navigation", { name: "Club" }).last().getByRole("link", { name: "Library" }).isVisible());

await browser.close();
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? "✓" : "✗"} ${r.name}${!r.ok && r.detail ? `\n    ${r.detail}` : ""}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
