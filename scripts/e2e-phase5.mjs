// Phase 5 end-to-end: creator studio posts and tiers — composer, drafts, scheduling,
// publishing, edit, delete, bought-post locks, member visibility, axe WCAG 2.1 AA.
// Requires a freshly seeded DB and a running server.
//   BASE=http://localhost:3000 SHOTS=./screenshots node scripts/e2e-phase5.mjs
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

// ================================================================ creator: posts list + composer
const c = await signIn("isadora@moonuke.test");
await c.page.goto(`${BASE}/studio`);
await c.page.getByRole("link", { name: "Posts", exact: true }).click();
await c.page.waitForURL(/\/studio\/posts$/);
check("posts list lists seeded posts", (await c.page.getByRole("list", { name: "Your posts" }).getByRole("listitem").count()) >= 6);
await shot(c.page, "studio-posts-desktop");
await axe(c.page, "/studio/posts @1440");

async function compose(page, { teaser, body, access = "members", publish = "now", at }) {
  await page.goto(`${BASE}/studio/posts/new`);
  await page.getByLabel("Teaser").fill(teaser);
  await page.getByLabel("Post", { exact: true }).fill(body);
  await page.getByLabel("Who can see it").selectOption(access);
  await page.getByRole("radio", { name: publish === "now" ? "Publish now" : publish === "schedule" ? "Schedule" : "Keep as draft" }).check();
  if (at) await page.getByLabel("Publish at (your local time)").fill(at);
  await page.locator("form").getByRole("button", { name: /^(Publish|Schedule|Save draft)$/ }).click();
  await page.getByTestId("post-saved").waitFor();
  return page.getByTestId("post-saved").innerText();
}

await c.page.goto(`${BASE}/studio/posts/new`);
await axe(c.page, "/studio/posts/new @1440");
// Validation: PPV needs a price, echoes the teaser back.
await c.page.getByLabel("Teaser").fill("Priced letter");
await c.page.getByLabel("Who can see it").selectOption("ppv");
await c.page.getByRole("radio", { name: "Publish now" }).check();
await c.page.locator("form").getByRole("button", { name: "Publish" }).click();
await c.page.locator("form [role=alert]").first().waitFor();
check("ppv without a price is refused", /price/i.test(await c.page.locator("form [role=alert]").first().innerText()));
check("teaser kept after error", (await c.page.getByLabel("Teaser").inputValue()) === "Priced letter");

check("publish now", /Published/.test(await compose(c.page, { teaser: "E2E live letter", body: "Members-only body E2E." })));
const future = new Date(Date.now() + 3 * 86400000);
const pad = (n) => String(n).padStart(2, "0");
const at = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}T10:00`;
check("schedule", /Scheduled/.test(await compose(c.page, { teaser: "E2E scheduled letter", body: "Later body.", publish: "schedule", at })));
check("draft", /draft/.test(await compose(c.page, { teaser: "E2E draft letter", body: "Draft body.", publish: "draft" })));
await c.page.getByRole("button", { name: "Back to posts" }).click();
await c.page.waitForURL(/\/studio\/posts$/);
const row = (t) => c.page.getByRole("listitem").filter({ hasText: t });
check("list shows states", /published/i.test(await row("E2E live letter").innerText()) && /scheduled/i.test(await row("E2E scheduled letter").innerText()) && /draft/i.test(await row("E2E draft letter").innerText()));

// ================================================================ member view: only published posts
const m = await signIn("nocturne@moonuke.test");
await m.page.goto(`${BASE}/c/isadora`);
const html = await m.page.content();
check("member sees the published post", html.includes("E2E live letter"));
check("member never sees scheduled or draft teasers", !html.includes("E2E scheduled letter") && !html.includes("E2E draft letter"));
const memberStudio = await m.page.goto(`${BASE}/studio/posts`);
check("member /studio/posts → 404", memberStudio.status() === 404);
const memberNew = await m.page.goto(`${BASE}/studio/posts/new`);
check("member /studio/posts/new → 404", memberNew.status() === 404);

// ================================================================ edit + delete
await row("E2E draft letter").getByRole("link", { name: /Edit/ }).click();
await c.page.waitForURL(/\/studio\/posts\/[0-9a-f-]{36}$/);
const draftUrl = c.page.url();
await axe(c.page, "/studio/posts/[id] @1440");
await c.page.getByLabel("Teaser").fill("E2E draft letter, revised");
await c.page.locator("form").getByRole("button", { name: "Save changes" }).click();
await c.page.getByTestId("post-saved").waitFor();
check("edit saved", /draft/i.test(await c.page.getByTestId("post-saved").innerText()));
await c.page.goto(draftUrl);
await c.page.getByRole("button", { name: "Delete post…" }).click();
await c.page.getByRole("button", { name: "Yes, delete" }).click();
await c.page.getByText("Post deleted.").waitFor();
check("draft deleted", (await c.page.goto(draftUrl)).status() === 404);
const otherCreator = await signIn("zara@moonuke.test");
const live = await c.page.goto(`${BASE}/studio/posts`);
await row("E2E live letter").getByRole("link", { name: /Edit/ }).click();
await c.page.waitForURL(/\/studio\/posts\/[0-9a-f-]{36}$/);
check("another creator can't open the edit page", (await otherCreator.page.goto(c.page.url())).status() === 404 && live.ok());

// ================================================================ bought post is locked
const mi = await signIn("mireille@moonuke.test");
await mi.page.goto(`${BASE}/studio/posts`);
const ppvRow = mi.page.getByRole("listitem").filter({ hasText: "Pay per view" }).first();
await ppvRow.getByRole("link", { name: /Edit/ }).click();
await mi.page.waitForURL(/\/studio\/posts\/[0-9a-f-]{36}$/);
check("bought post: access locked", await mi.page.getByLabel("Who can see it").isDisabled());
check("bought post: no delete", await mi.page.getByText("can't be deleted").isVisible());

// ================================================================ tiers
await c.page.goto(`${BASE}/studio`);
await c.page.getByRole("link", { name: "Tiers", exact: true }).click();
await c.page.waitForURL(/\/studio\/tiers$/);
await shot(c.page, "studio-tiers-desktop");
await axe(c.page, "/studio/tiers @1440");
const add = c.page.locator("section").filter({ has: c.page.getByRole("heading", { name: "Add a tier" }) });
await add.getByLabel("Tier name").fill("E2E Salon");
await add.getByLabel("Monthly price (USD)").fill("0");
await add.getByRole("button", { name: "Add tier" }).click();
await add.locator("form [role=alert]").first().waitFor();
check("tier: free price refused", /price/i.test(await add.locator("form [role=alert]").first().innerText()));
check("tier: name echoed after error", (await add.getByLabel("Tier name").inputValue()) === "E2E Salon");
await add.getByLabel("Monthly price (USD)").fill("25");
await add.getByLabel("Perks, one per line (optional)").fill("Letters\nSalon evenings");
await add.getByRole("button", { name: "Add tier" }).click();
await c.page.getByTestId("tier-saved").waitFor();
await c.page.getByRole("button", { name: "Done" }).click();
const salon = c.page.getByRole("form", { name: "Tier E2E Salon" });
await salon.waitFor();
check("tier: added", await salon.isVisible());
const vipForm = c.page.getByRole("form", { name: /^Tier VIP/ }).first();
check("tier: subscribed VIP type locked, no delete", (await vipForm.getByLabel("Type").isDisabled()) && (await vipForm.getByRole("button", { name: /Delete/ }).count()) === 0);

const v2 = await signIn("velvet@moonuke.test");
await v2.page.goto(`${BASE}/c/isadora`);
check("member sees the new tier and its price", (await v2.page.getByText("E2E Salon").count()) > 0 && (await v2.page.content()).includes("$25"));

await salon.getByLabel("Monthly price (USD)").fill("30");
await salon.getByRole("button", { name: "Save tier" }).click();
await salon.getByText("Saved.").waitFor();
check("tier: edit keeps the new value", (await salon.getByLabel("Monthly price (USD)").inputValue()) === "30");
await salon.getByRole("button", { name: /Delete/ }).click();
await salon.getByRole("button", { name: "Yes, delete E2E Salon" }).click();
await c.page.getByText("Tier deleted.").waitFor();
check("tier: deleted", true);
const memberTiers = await v2.page.goto(`${BASE}/studio/tiers`);
check("member /studio/tiers → 404", memberTiers.status() === 404);

// ================================================================ mobile
const cm = await signIn("isadora@moonuke.test", mobile);
await cm.page.goto(`${BASE}/studio/posts`);
await shot(cm.page, "studio-posts-mobile");
await axe(cm.page, "/studio/posts @390");
await cm.page.goto(`${BASE}/studio/posts/new`);
await axe(cm.page, "/studio/posts/new @390");
await cm.page.goto(`${BASE}/studio/tiers`);
await axe(cm.page, "/studio/tiers @390");
const overflow = await cm.page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
check("mobile tiers: no horizontal overflow", overflow <= 0, String(overflow));

await browser.close();
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? "✓" : "✗"} ${r.name}${!r.ok && r.detail ? `\n    ${r.detail}` : ""}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
