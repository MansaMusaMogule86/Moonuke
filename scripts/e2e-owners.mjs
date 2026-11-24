// Two-owner identity, personalized dashboard, 50/50 waterfall, dual-owner approval,
// separate payout destinations (Account A vs Account B), creator/fan isolation,
// and WCAG 2.1 AA accessibility at 1440x900 and 390x844.
//   BASE=http://localhost:3000 DATABASE_URL=… SHOTS=./reports/screens/owners node scripts/e2e-owners.mjs
import { createRequire } from "node:module";
import fs from "node:fs";
import { totp, devTotpSecretFor } from "./lib/totp.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { Client } = require("pg");
const axePath = require.resolve("axe-core/axe.min.js");

const BASE = process.env.BASE ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS ?? "./reports/screens/owners";
const PW = "divafans-dev-password";
fs.mkdirSync(SHOTS, { recursive: true });

const JADE_EMAIL = "jade.owner@divafans.test";
const KAEL_EMAIL = "kael.owner@divafans.test";

const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });
const browser = await chromium.launch();
const desktop = { viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" };
const mobile = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" };

async function shot(page, name) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

async function axe(page, label) {
  await page.waitForTimeout(800);
  await page.addScriptTag({ path: axePath });
  const r = await page.evaluate(() =>
    axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }),
  );
  const v = r.violations.map(
    (x) => `${x.id} (${x.nodes.length}): ${x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`,
  );
  check(`axe ${label}`, v.length === 0, v.join("\n    "));
}

async function noOverflow(page, label) {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(`${label}: no horizontal overflow`, o <= 0, String(o));
}

// Clear last_used_step in test DB before generating a fresh TOTP code so we don't have to wait 30s between step-ups
async function codeFor(email) {
  await db.query(
    `update app.mfa_factors set last_used_step = null where user_id = (select id from app.users where email = $1)`,
    [email],
  );
  return totp(devTotpSecretFor(email));
}

async function signIn(email, opts = desktop) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/signin`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PW);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(owner|home|discover|pending|signin\/verify|studio)/);
  if (page.url().endsWith("/signin/verify")) {
    await page.getByLabel("Code").fill(await codeFor(email));
    await page.getByRole("button", { name: "Verify" }).click();
    await page.waitForURL(/\/(owner|admin|home|discover|studio)/);
  }
  return { ctx, page };
}

// 1. Creator and Fan cannot access /owner
{
  const fan = await signIn("velvet@divafans.test");
  const fanRes = await fan.page.goto(`${BASE}/owner`);
  check("Fan cannot access /owner (404)", fanRes.status() === 404);
  const fanStudio = await fan.page.goto(`${BASE}/studio`);
  check("Fan cannot access /studio (404)", fanStudio.status() === 404);
  await fan.ctx.close();

  const creator = await signIn("isadora@divafans.test");
  const creatorRes = await creator.page.goto(`${BASE}/owner`);
  check("Creator cannot access /owner (404)", creatorRes.status() === 404);
  const creatorStudio = await creator.page.goto(`${BASE}/studio`);
  check("Creator Studio preserved for creators (200)", creatorStudio.status() === 200);
  await creator.ctx.close();
}

// 2. Jade (OWNER_001) signs in, routes to /owner, sees "Welcome back, Jade.", 50% share, Account A only
const jade = await signIn(JADE_EMAIL, desktop);
check("Jade login routes directly to /owner", jade.page.url().endsWith("/owner"), jade.page.url());
const jadeHeading = (await jade.page.getByTestId("owner-welcome-heading").textContent()).trim();
check("Jade sees 'Welcome back, Jade.'", jadeHeading === "Welcome back, Jade.", jadeHeading);
const jadeBody = await jade.page.locator("body").innerText();
check("Jade sees OWNER_001 and 50% ownership", jadeBody.includes("OWNER_001") && jadeBody.includes("50%"));
check("Jade sees Account A and never sees Account B", jadeBody.includes("Account A") && !jadeBody.includes("Account B"));
check("Jade dashboard never exposes login email", !jadeBody.includes(JADE_EMAIL) && !jadeBody.includes(KAEL_EMAIL));
await axe(jade.page, "Jade /owner @1440");
await noOverflow(jade.page, "Jade /owner @1440");
await shot(jade.page, "jade-owner-overview-desktop");

// 3. Kael Veyre (OWNER_002) signs in independently, routes to /owner, sees "Welcome back, Kael Veyre.", 50% share, Account B only
const kael = await signIn(KAEL_EMAIL, desktop);
check("Kael Veyre login routes directly to /owner", kael.page.url().endsWith("/owner"), kael.page.url());
const kaelHeading = (await kael.page.getByTestId("owner-welcome-heading").textContent()).trim();
check("Kael Veyre sees 'Welcome back, Kael Veyre.'", kaelHeading === "Welcome back, Kael Veyre.", kaelHeading);
const kaelBody = await kael.page.locator("body").innerText();
check("Kael Veyre sees OWNER_002 and 50% ownership", kaelBody.includes("OWNER_002") && kaelBody.includes("50%"));
check("Kael Veyre sees Account B and never sees Account A", kaelBody.includes("Account B") && !kaelBody.includes("Account A"));
check("Kael Veyre dashboard never exposes login email", !kaelBody.includes(JADE_EMAIL) && !kaelBody.includes(KAEL_EMAIL));
await axe(kael.page, "Kael Veyre /owner @1440");
await noOverflow(kael.page, "Kael Veyre /owner @1440");
await shot(kael.page, "kael-owner-overview-desktop");

// 4. Payout Accounts page isolation & MFA-protected update
await jade.page.goto(`${BASE}/owner/payouts`);
const jadePayoutText = await jade.page.locator("body").innerText();
check("Jade /owner/payouts shows Account A only", jadePayoutText.includes("Account A") && !jadePayoutText.includes("Account B"));
await axe(jade.page, "Jade /owner/payouts @1440");
await shot(jade.page, "jade-owner-payouts-desktop");

await kael.page.goto(`${BASE}/owner/payouts`);
const kaelPayoutText = await kael.page.locator("body").innerText();
check("Kael /owner/payouts shows Account B only", kaelPayoutText.includes("Account B") && !kaelPayoutText.includes("Account A"));
await axe(kael.page, "Kael /owner/payouts @1440");
await shot(kael.page, "kael-owner-payouts-desktop");

// 5. Dual-owner distribution calculation, approval by Jade -> approval by Kael -> simulated payout in UI
await jade.page.goto(`${BASE}/owner`);
await jade.page.getByRole("button", { name: "Calculate & Reconcile Period" }).click();
await jade.page.getByText(/Distribution period calculated and reconciled/).waitFor();
check("Jade calculates and reconciles a distribution period in UI", true);

await jade.page.getByLabel("6-digit MFA code").first().fill(await codeFor(JADE_EMAIL));
await jade.page.getByRole("button", { name: "Submit Signed Decision" }).first().click();
await jade.page.getByText(/PARTIALLY_APPROVED/).first().waitFor();
check("Jade MFA approval moves period to PARTIALLY_APPROVED", true);

await kael.page.goto(`${BASE}/owner`);
await kael.page.getByLabel("6-digit MFA code").first().fill(await codeFor(KAEL_EMAIL));
await kael.page.getByRole("button", { name: "Submit Signed Decision" }).first().click();
await kael.page.getByText(/READY_FOR_PAYOUT/).first().waitFor();
check("Kael MFA approval moves period to READY_FOR_PAYOUT", true);

await kael.page.getByRole("button", { name: "Run Simulated Payouts" }).first().click();
await kael.page.getByText(/Simulated payout run completed/).waitFor();
check("Simulated payout executes after dual-owner approval", true);
await shot(kael.page, "kael-owner-approved-simulated-desktop");

// 6. Mobile responsiveness & WCAG 2.1 AA at 390x844
const jadeMobile = await signIn(JADE_EMAIL, mobile);
await axe(jadeMobile.page, "Jade /owner @390");
await noOverflow(jadeMobile.page, "Jade /owner @390");
await shot(jadeMobile.page, "jade-owner-overview-mobile");

const kaelMobile = await signIn(KAEL_EMAIL, mobile);
await axe(kaelMobile.page, "Kael /owner @390");
await noOverflow(kaelMobile.page, "Kael /owner @390");
await shot(kaelMobile.page, "kael-owner-overview-mobile");

for (const c of [jade, kael, jadeMobile, kaelMobile]) await c.ctx.close();
await browser.close();
await db.end();

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? "✓" : "✗"} ${r.name}${!r.ok && r.detail ? `\n    ${r.detail}` : ""}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
