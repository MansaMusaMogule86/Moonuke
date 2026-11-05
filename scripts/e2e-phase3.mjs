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
import { totp, freshCode, DEV_OWNER_TOTP_SECRET } from "./lib/totp.mjs";

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
let ownerSecret = DEV_OWNER_TOTP_SECRET;
async function ownerSignIn(opts = desktop) {
  const o = await signIn("owner@moonuke.test", PW, opts);
  await o.page.getByLabel("Code").fill(await freshCode(ownerSecret));
  await o.page.getByRole("button", { name: "Verify" }).click();
  await o.page.waitForURL(/\/admin/);
  return o;
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
// ================================================================ MFA: owner challenge
{
  const o = await signIn("owner@moonuke.test");
  check("owner sign-in → two-step challenge", o.page.url().endsWith("/signin/verify"));
  await shot(o.page, "mfa-verify-desktop");
  await axe(o.page, "/signin/verify @1440");
  const blocked = await o.page.goto(`${BASE}/admin`);
  check("owner pre-MFA: /admin redirects to challenge", o.page.url().endsWith("/signin/verify"), o.page.url());
  await o.page.getByLabel("Code").fill("000000");
  await o.page.getByRole("button", { name: "Verify" }).click();
  await formAlert(o.page).waitFor();
  check("wrong code rejected", (await formAlert(o.page).textContent()).includes("didn't work"));
  await o.page.getByLabel("Code").fill(await freshCode(ownerSecret));
  await o.page.getByRole("button", { name: "Verify" }).click();
  await o.page.waitForURL(/\/admin/);
  check("correct code → /admin", o.page.url().endsWith("/admin"));
  const owner = await db.query(`select count(*)::int as n from app.email_outbox where template = 'security_owner_signin'`);
  check("owner sign-in security notice queued", owner.rows[0].n >= 1);
  await o.ctx.close();
}

// ================================================================ MFA: mandatory owner enrolment
{
  await db.query(`delete from app.mfa_factors where user_id = (select id from app.users where role = 'owner')`);
  const o = await signIn("owner@moonuke.test");
  check("owner without MFA → forced setup", /\/account\/security\?setup=required/.test(o.page.url()), o.page.url());
  for (const p of ["/admin", "/admin/invitations", "/discover"]) {
    await o.page.goto(`${BASE}${p}`);
    check(`owner without MFA: ${p} blocked`, /\/account\/security/.test(o.page.url()), o.page.url());
  }
  check("setup banner explains requirement", await o.page.getByRole("alert").filter({ hasText: "required for the owner" }).isVisible());
  await o.page.getByRole("button", { name: "Set up two-step sign-in" }).click();
  const secretEl = o.page.getByTestId("mfa-secret");
  await secretEl.waitFor();
  ownerSecret = (await secretEl.textContent()).trim();
  check("QR code rendered", (await o.page.locator('[aria-label="QR code for your authenticator app"] svg').count()) === 1);
  await shot(o.page, "mfa-setup-desktop");
  await axe(o.page, "/account/security (setup) @1440");
  await o.page.getByLabel("Code from your app").fill(await freshCode(ownerSecret));
  await o.page.getByRole("button", { name: "Turn on two-step sign-in" }).click();
  await o.page.getByTestId("recovery-codes").waitFor();
  const codes = (await o.page.getByTestId("recovery-codes").textContent()).trim().split(/\s+/);
  check("10 recovery codes shown once", codes.length === 10, String(codes.length));
  await o.page.goto(`${BASE}/admin`);
  check("after enrolment the House opens", o.page.url().endsWith("/admin"));
  await o.ctx.close();
}

// ================================================================ member: optional MFA, recovery code, sessions, password
{
  const a = await signIn("nocturne@moonuke.test");
  const b = await signIn("nocturne@moonuke.test");
  await a.page.goto(`${BASE}/account/security`);
  await axe(a.page, "/account/security @1440");
  check("sessions list shows both sessions", (await a.page.getByText(/Signed in .* last active/).count()) === 2);
  await a.page.getByRole("button", { name: "Sign out all other sessions" }).click();
  await a.page.getByText("Signed out 1 other session").waitFor();
  await b.page.goto(`${BASE}/discover`);
  check("revoked session is signed out", b.page.url().endsWith("/signin"));

  await a.page.getByRole("button", { name: "Set up two-step sign-in" }).click();
  await a.page.getByTestId("mfa-secret").waitFor();
  const secret = (await a.page.getByTestId("mfa-secret").textContent()).trim();
  await a.page.getByLabel("Code from your app").fill(await freshCode(secret));
  await a.page.getByRole("button", { name: "Turn on two-step sign-in" }).click();
  await a.page.getByTestId("recovery-codes").waitFor();
  const codes = (await a.page.getByTestId("recovery-codes").textContent()).trim().split(/\s+/);
  await shot(a.page, "mfa-codes-desktop");

  const c = await signIn("nocturne@moonuke.test");
  check("member with MFA → challenge", c.page.url().endsWith("/signin/verify"));
  await c.page.getByLabel("Code").fill(codes[0]);
  await c.page.getByRole("button", { name: "Verify" }).click();
  await c.page.waitForURL(/\/discover/);
  check("recovery code signs in", c.page.url().endsWith("/discover"));
  const d = await signIn("nocturne@moonuke.test");
  await d.page.getByLabel("Code").fill(codes[0]);
  await d.page.getByRole("button", { name: "Verify" }).click();
  await formAlert(d.page).waitFor();
  check("recovery code is single-use", (await formAlert(d.page).textContent()).includes("didn't work"));

  await a.page.goto(`${BASE}/account/security`);
  await a.page.getByLabel("Current password").fill("wrong-password-x");
  await a.page.getByLabel("New password", { exact: true }).fill("nocturne-new-pass-1");
  await a.page.getByLabel("Confirm new password").fill("nocturne-new-pass-1");
  await a.page.getByRole("button", { name: "Change password" }).click();
  await a.page.getByText("Your current password is incorrect").first().waitFor();
  check("password change requires current password", true);
  await a.page.getByLabel("Current password").fill(PW);
  await a.page.getByLabel("New password", { exact: true }).fill("nocturne-new-pass-1");
  await a.page.getByLabel("Confirm new password").fill("nocturne-new-pass-1");
  await a.page.getByRole("button", { name: "Change password" }).click();
  await a.page.getByText("Password changed").waitFor();
  await c.page.goto(`${BASE}/discover`);
  check("password change signs out other sessions", c.page.url().endsWith("/signin"));
  await a.page.goto(`${BASE}/discover`);
  check("current session survives password change", a.page.url().endsWith("/discover"));
  for (const x of [a, b, c, d]) await x.ctx.close();
}

// ================================================================ safety: report, auto-hide, moderation, blocking
{
  const v = await signIn("velvet@moonuke.test", "velvet-new-password-1");
  await v.page.goto(`${BASE}/c/isadora`);
  await v.page.getByRole("button", { name: "Report", exact: true }).click();
  const sheet = v.page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Send report" }).click();
  await sheet.locator("[role=alert]").first().waitFor();
  check("report requires a reason", true);
  await shot(v.page, "report-sheet-desktop");
  await axe(v.page, "report sheet @1440");
  await sheet.getByLabel("Impersonation or fake identity").check();
  await sheet.getByLabel("Details (optional)").fill("Profile photos appear to be someone else.");
  await sheet.getByRole("button", { name: "Send report" }).click();
  await sheet.getByText("The house will review your report").waitFor();
  check("creator report filed", true);
  await v.page.keyboard.press("Escape");

  // Critical report on a visible post → hidden for everyone but the owner/creator
  const teaser = "Studio, 6 a.m.";
  const article = v.page.locator("article").filter({ hasText: teaser }).first();
  await article.getByRole("button", { name: /Report/ }).click();
  const s2 = v.page.getByRole("dialog");
  await s2.getByLabel("Shared without consent").check();
  await s2.getByRole("button", { name: "Send report" }).click();
  await s2.getByText("flagged as urgent").waitFor();
  check("critical report acknowledged as urgent", true);
  await v.page.keyboard.press("Escape");
  await v.page.reload();
  check("critically reported post hidden immediately", (await v.page.locator("article").filter({ hasText: teaser }).count()) === 0);

  // Block from profile → leaves the profile, shows confirmation, profile now 404
  await v.page.goto(`${BASE}/c/valentin`);
  await v.page.getByRole("button", { name: "Block", exact: true }).click();
  await v.page.getByRole("dialog").getByRole("button", { name: /Block Valentin/ }).click();
  await v.page.waitForURL(/\/discover\?blocked=1/);
  check("block → back to discovery with notice", await v.page.getByRole("status").filter({ hasText: "Blocked" }).isVisible());
  check("blocked creator gone from discovery", (await v.page.locator('a[href="/c/valentin"]').count()) === 0);
  const gone = await v.page.goto(`${BASE}/c/valentin`);
  check("blocked creator profile 404", gone.status() === 404);
  await v.page.goto(`${BASE}/account/privacy`);
  await shot(v.page, "privacy-desktop");
  await axe(v.page, "/account/privacy @1440");
  check("privacy lists report statuses", (await v.page.getByText("Received").count()) >= 1);
  await v.page.getByRole("button", { name: "Unblock Valentin Ash" }).click();
  await v.page.getByText("Unblocked").waitFor();
  const back = await v.page.goto(`${BASE}/c/valentin`);
  check("unblock restores profile", back.status() === 200);

  // Owner: critical report on top; restore post; state updates in place
  const o = await ownerSignIn();
  await o.page.goto(`${BASE}/admin/moderation`);
  await shot(o.page, "moderation-desktop");
  await axe(o.page, "/admin/moderation @1440");
  const first = o.page.locator("article").first();
  check("critical report first in queue", (await first.getAttribute("aria-label")).startsWith("Critical"));
  check("auto-hidden badge shown", await first.getByText("Post hidden").isVisible());
  await first.getByRole("button", { name: "Restore post" }).click();
  await first.getByText("Post restored").waitFor();
  check("card reflects decision without reload", (await first.getByText("dismissed").count()) >= 1 && (await first.getByRole("button", { name: "Hide post" }).count()) === 1);
  await v.page.goto(`${BASE}/c/isadora`);
  check("restored post visible again", (await v.page.locator("article").filter({ hasText: teaser }).count()) === 1);

  // Escalation needs a reference
  await o.page.reload();
  const imp = o.page.locator("article").filter({ hasText: "Impersonation" }).first();
  await imp.getByRole("button", { name: "Escalate…" }).click();
  await imp.getByRole("button", { name: "Record escalation" }).click();
  await imp.locator("[role=alert]").first().waitFor();
  check("escalation requires external reference", true);
  await imp.getByLabel("External reference").fill("EXT-2026-001");
  await imp.getByRole("button", { name: "Record escalation" }).click();
  await imp.getByText("Escalation recorded").waitFor();
  check("escalation recorded", true);

  // Members can't reach moderation
  const mod = await v.page.goto(`${BASE}/admin/moderation`);
  check("member /admin/moderation → 404", mod.status() === 404);
  await v.ctx.close();
  await o.ctx.close();
}

// ================================================================ creator verification
{
  const m = await signIn("velvet@moonuke.test", "velvet-new-password-1");
  const hiddenRes = await m.page.goto(`${BASE}/c/rhea`);
  check("unverified creator profile 404 for members", hiddenRes.status() === 404);
  const r = await signIn("rhea@moonuke.test");
  check("creator nav shows Studio", await r.page.getByRole("navigation", { name: "Club" }).first().getByRole("link", { name: "Studio" }).isVisible());
  await r.page.goto(`${BASE}/studio`);
  check("studio shows submitted status", await r.page.getByText("Submitted", { exact: true }).isVisible());
  await shot(r.page, "studio-desktop");
  await axe(r.page, "/studio @1440");
  await r.page.getByLabel("Tagline (optional)").fill("Kiln notes, glaze tests and the pieces that crack.");
  await r.page.getByRole("button", { name: "Save profile" }).click();
  await r.page.getByText("Profile saved").waitFor();
  check("creator can edit draft profile", true);

  const o = await ownerSignIn();
  await o.page.goto(`${BASE}/admin/creators`);
  await axe(o.page, "/admin/creators @1440");
  const card = o.page.locator("article").filter({ hasText: "Rhea Calder" });
  await card.getByRole("button", { name: "Verify & publish" }).click();
  await card.getByText(/Confirm before verifying/).waitFor();
  check("verify blocked until checklist complete", true);
  await card.getByLabel("Identity confirmed").check();
  await card.getByLabel(/18\+ confirmed/).check();
  await card.getByLabel(/Consent & records/).check();
  await card.getByRole("button", { name: "Verify & publish" }).click();
  await card.getByText("Verified and published").waitFor();
  check("card updates in place: verified + published", (await card.getByText("Published", { exact: true }).count()) === 1);
  await shot(o.page, "admin-creators-desktop");
  const live = await m.page.goto(`${BASE}/c/rhea`);
  check("verified creator now visible to members", live.status() === 200);
  for (const x of [m, r, o]) await x.ctx.close();
}

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
