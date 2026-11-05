// Release hardening end-to-end: branded and non-revealing 404s, security
// headers, health check, no stack or framework leaks, axe WCAG 2.1 AA.
// Requires a freshly seeded DB and a running production server.
//   BASE=http://localhost:3000 SHOTS=./screenshots node scripts/e2e-hardening.mjs
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

// ================================================================ 404: branded, identical for missing and forbidden
const anon = await browser.newContext(desktop);
const ap = await anon.newPage();
const missing = await ap.goto(`${BASE}/definitely-not-a-page`);
check("unknown route → 404", missing.status() === 404);
check("404 is branded", await ap.getByRole("heading", { name: /This door/ }).isVisible());
await shot(ap, "not-found-desktop");
await axe(ap, "404 @1440");
const missingText = (await ap.getByTestId("error-shell").innerText()).trim();

const m = await signIn("velvet@moonuke.test");
const forbidden = await m.page.goto(`${BASE}/admin/onboarding/case/00000000-0000-0000-0000-000000000000`);
check("forbidden admin page → 404", forbidden.status() === 404);
check("forbidden 404 looks identical to a missing page", (await m.page.getByTestId("error-shell").innerText()).trim() === missingText);
check("one main landmark inside the shell", (await m.page.locator("main").count()) === 1);
await axe(m.page, "404 inside club shell @1440");
const privateProfile = await m.page.goto(`${BASE}/c/rhea`);
check("unpublished profile → same 404", privateProfile.status() === 404 && (await m.page.getByTestId("error-shell").innerText()).trim() === missingText);

// ================================================================ headers
const home = await ap.goto(`${BASE}/`);
const h = home.headers();
check("no x-powered-by", !("x-powered-by" in h));
check("CSP with per-request nonce and frame-ancestors none", /script-src[^;]*'nonce-/.test(h["content-security-policy"] ?? "") && /frame-ancestors 'none'/.test(h["content-security-policy"] ?? ""));
check("nosniff", h["x-content-type-options"] === "nosniff");
check("referrer policy set", !!h["referrer-policy"]);
check("permissions policy set", !!h["permissions-policy"]);
const again = (await ap.goto(`${BASE}/`)).headers()["content-security-policy"];
check("nonce differs per request", again !== h["content-security-policy"]);

// ================================================================ health
const health = await ap.request.get(`${BASE}/api/health`);
const hb = await health.json();
check("health → 200 ok", health.status() === 200 && hb.status === "ok");
check("health reveals nothing else", Object.keys(hb).length === 1);
check("health is not cached", /no-store/.test(health.headers()["cache-control"] ?? ""));

// ================================================================ no stack traces or framework leaks
const badMedia = await ap.request.get(`${BASE}/api/media/not-a-uuid/0`);
check("bad media request → bare 404", badMedia.status() === 404 && (await badMedia.text()) === "Not found");
const badAction = await ap.request.post(`${BASE}/signin`, { headers: { "Next-Action": "deadbeef", "Content-Type": "text/plain" }, data: "[]" });
const badBody = await badAction.text();
check("forged server action leaks no stack", !/at\s+\S+\s+\(|node_modules|\.tsx?:\d+/.test(badBody), String(badAction.status()));

// ================================================================ mobile
const mp = await (await browser.newContext(mobile)).newPage();
await mp.goto(`${BASE}/nope`);
await axe(mp, "404 @390");
const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - innerWidth);
check("mobile 404: no horizontal overflow", overflow <= 0, String(overflow));

await browser.close();
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? "✓" : "✗"} ${r.name}${!r.ok && r.detail ? `\n    ${r.detail}` : ""}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
