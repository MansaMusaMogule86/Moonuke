// Phase 4 end-to-end: white-glove onboarding — case → invite → apply →
// approve → assistant-drafted proposal → creator consent → social proof →
// verification → live — plus authorization boundaries and axe WCAG 2.1 AA.
// Requires a freshly seeded DB, AI_PROVIDER=template, a running server.
//   BASE=http://localhost:3000 SHOTS=./screenshots node scripts/e2e-phase4.mjs
import { createRequire } from "node:module";
import fs from "node:fs";
import { freshCode, DEV_OWNER_TOTP_SECRET, devTotpSecretFor } from "./lib/totp.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const axePath = require.resolve("axe-core/axe.min.js");
const { Client } = require("pg");
const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

const BASE = process.env.BASE ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS;
const PW = "divafans-dev-password";
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
  await page.waitForURL(/\/(home|discover|studio|owner|admin|pending|signin\/verify|account\/security)/);
  if (page.url().endsWith("/signin/verify")) {
    await page.getByLabel("Code").fill(await freshCode(devTotpSecretFor(email)));
    await page.getByRole("button", { name: "Verify" }).click();
    await page.waitForURL(/\/(owner|admin|home|discover|studio)/);
  }
  return { ctx, page };
}

// ================================================================ pipeline + open a case
const o = await signIn("owner@divafans.test");
await o.page.goto(`${BASE}/admin/onboarding`);
const col = (label) => o.page.locator("section").filter({ has: o.page.getByRole("heading", { name: label, exact: true }) });
check("board: Lio waits in Invited", (await col("Invited").getByText("Lio Marchand").count()) === 1);
check("board: Rhea is Ready to verify", (await col("Ready to verify").getByText("Rhea Calder").count()) === 1);
check("board: curated creators are Live", (await col("Live").getByText("Isadora Lune").count()) === 1);
await shot(o.page, "onboarding-board-desktop");
await axe(o.page, "/admin/onboarding @1440");

// Creator invitations need an allowlisted address: explicit test-only fixture row (ignored in live production).
await db.query(`insert into app.creator_allowlist (email, source) values ('nova@example.com', 'test_fixture') on conflict do nothing`);
await o.page.getByLabel("Creator's name").fill("Nova Reyes");
await o.page.getByLabel("Their email").fill("nova@example.com");
await o.page.getByLabel("Concierge note (private)").fill("Met at Lisbon week. Prefers evenings.");
await o.page.getByRole("button", { name: "Open case & issue invitation" }).click();
await o.page.getByTestId("invite-link").waitFor();
const link = (await o.page.getByTestId("invite-link").textContent()).trim().replace(/^https?:\/\/[^/]+/, BASE);
check("white-glove invitation issued", /\/invite\/[A-Za-z0-9_-]{43}$/.test(link));

// ================================================================ creator applies (email-locked)
const v = await browser.newContext(desktop);
const vp = await v.newPage();
await vp.goto(link);
check("invite is for a creator", await vp.getByText(/Invitation · creator/i).isVisible());
await vp.getByLabel("Your name").fill("Nova R");
await vp.getByLabel("Email").fill("someone@example.com");
await vp.getByLabel("Password").fill("nova-very-long-pass-1");
await vp.getByLabel(/18 or older/).check();
await vp.getByLabel(/community rules/).check();
await vp.getByRole("button", { name: "Request approval" }).click();
await vp.locator("form [role=alert]").first().waitFor();
check("email-locked invite rejects another address", (await vp.content()).includes("different email"));
check("consent choices survive a failed submit", (await vp.getByLabel(/18 or older/).isChecked()) && (await vp.getByLabel(/community rules/).isChecked()));
check("password is never echoed back", (await vp.getByLabel("Password").inputValue()) === "");
await vp.getByLabel("Email").fill("nova@example.com");
await vp.getByLabel("Password").fill("nova-very-long-pass-1");
await vp.getByRole("button", { name: "Request approval" }).click();
await vp.waitForURL(/\/pending$/);
check("creator application pending", true);
await v.close();

// ================================================================ owner approves, prepares profile with the assistant
await o.page.goto(`${BASE}/admin`);
const app = o.page.getByRole("listitem").filter({ hasText: "nova@example.com" });
await app.getByRole("button", { name: "Approve" }).click();
await app.getByText(/hasn't confirmed their email address/).waitFor();
check("a creator can't be approved before confirming their email", true);
// The creator confirms through the real account-created email (the dev transport keeps the body).
{
  const mail = (await db.query(`select body_text from app.email_outbox where to_email = 'nova@example.com' and template = 'account_created' order by created_at desc limit 1`)).rows[0];
  const confirm = mail?.body_text.match(/https?:\/\/\S+\/verify-email\/\S+/)?.[0].replace(/^https?:\/\/[^/]+/, BASE);
  check("account-created email carries a confirmation link", !!confirm);
  const c = await browser.newContext(desktop);
  const cp = await c.newPage();
  await cp.goto(confirm);
  await cp.getByRole("button", { name: "Confirm my email" }).click();
  await cp.getByText("Thanks, your email address is confirmed.").waitFor();
  await c.close();
}
await o.page.goto(`${BASE}/admin`);
await o.page.getByRole("listitem").filter({ hasText: "nova@example.com" }).getByRole("button", { name: "Approve" }).click();
await o.page.getByRole("listitem").filter({ hasText: "nova@example.com" }).getByText("Approved. The account is now active.").waitFor();
await o.page.goto(`${BASE}/admin/onboarding`);
await col("Preparing profile").getByText("Nova Reyes").click();
await o.page.waitForURL(/\/admin\/onboarding\/case\//);
check("case page shows concierge notes to owner", await o.page.getByText("Prefers evenings").isVisible());
await o.page.getByRole("button", { name: /Draft with the assistant/ }).click();
const panel = o.page.getByRole("region", { name: "Profile assistant" });
await panel.getByLabel("Display name").fill("Nova Reyes");
await panel.getByLabel("Discipline").fill("Contemporary dancer");
await panel.getByLabel("City (optional)").fill("Lisbon");
await panel.getByLabel("Themes (comma-separated)").fill("rehearsals, choreography");
await panel.getByRole("button", { name: "Draft suggestions" }).click();
await panel.getByTestId("assist-bio").waitFor();
const bio = (await panel.getByTestId("assist-bio").textContent()).trim();
check("assistant drafted a bio from the notes", bio.includes("Nova Reyes") && bio.includes("Lisbon"));
await panel.getByRole("button", { name: "Use bio" }).click();
await panel.getByRole("button", { name: "Use tagline 1" }).click();
await shot(o.page, "case-assistant-desktop");
await axe(o.page, "/admin/onboarding/case @1440");
const composer = o.page.locator("form").filter({ has: o.page.getByRole("button", { name: "Send draft for their approval" }) });
await composer.getByLabel("Handle").fill("nova");
await composer.getByLabel("Display name").fill("Nova Reyes");
await composer.getByLabel("Discipline").fill("Contemporary dancer");
await composer.getByLabel("Category").selectOption("movement");
check("assistant text filled the draft", (await composer.getByLabel("About").inputValue()).includes("Lisbon"));
await composer.getByLabel("Message to the creator (optional)").fill("A first pass from our call — change anything.");
await composer.getByRole("button", { name: "Send draft for their approval" }).click();
await o.page.getByText("Sent to the creator for approval").waitFor();
check("draft sent for creator approval", true);

// ================================================================ creator consents, adds a social
const n = await signIn("nova@example.com", desktop, "nova-very-long-pass-1");
// Creators with unfinished onboarding resume at /studio/settings; MFA is optional for creators (owner MFA stays mandatory).
check("new creator resumes unfinished onboarding in studio", /\/studio\/settings/.test(n.page.url()), n.page.url());
await n.page.goto(`${BASE}/account/security`);
await n.page.getByRole("button", { name: /^Set up( two-step sign-in)?$/ }).click();
await n.page.getByTestId("mfa-secret").waitFor();
const novaSecret = (await n.page.getByTestId("mfa-secret").textContent()).trim();
await n.page.getByLabel("Code from your app").fill(await freshCode(novaSecret));
await n.page.getByRole("button", { name: "Turn on two-step sign-in" }).click();
await n.page.getByTestId("recovery-codes").waitFor();
check("creator optional MFA enrollment succeeds", true);
await n.page.goto(`${BASE}/studio/settings`);
const card = n.page.getByRole("article", { name: "Profile proposal from the house" });
check("white-glove studio", await card.isVisible());
check("proposal shows assistant badge and message", (await card.getByText("Assistant-drafted").count()) === 1 && (await card.getByText("A first pass from our call").count()) === 1);
check("concierge notes never reach the creator", !(await n.page.content()).includes("Prefers evenings"));
await shot(n.page, "studio-proposal-desktop");
await axe(n.page, "/studio (proposal) @1440");
await card.getByRole("button", { name: "Accept and update my draft" }).click();
await card.getByText("Accepted — your profile draft was updated.").waitFor();
await n.page.reload();
check("accepted copy is now in the creator's draft", (await n.page.getByLabel("Handle", { exact: true }).inputValue()) === "nova" && (await n.page.getByLabel("About (optional)").inputValue()).includes("Lisbon"));
await n.page.getByLabel("Platform").selectOption("instagram");
await n.page.getByLabel("Social handle").fill("nova.moves");
await n.page.getByRole("button", { name: "Add profile" }).click();
await n.page.getByTestId("proof-code").waitFor();
const proof = (await n.page.getByTestId("proof-code").textContent()).trim();
check("proof code issued", /^mnk-[a-f0-9]{8}$/.test(proof), proof);
const adminAsCreator = await n.page.goto(`${BASE}/admin/onboarding`);
check("creator /admin/onboarding → 404", adminAsCreator.status() === 404);

// ================================================================ owner verifies the social
await o.page.reload();
const soc = o.page.getByRole("form", { name: /Review instagram @nova\.moves/ });
check("owner sees the same proof code", (await soc.getByText(proof).count()) === 1);
await soc.getByRole("button", { name: "Code found — verify" }).click();
await soc.getByText("Marked verified.").waitFor();
check("social verified in place", (await soc.getByText("verified", { exact: true }).count()) >= 1);

// ================================================================ creator shows it, submits verification
await n.page.goto(`${BASE}/studio/settings`);
await n.page.getByRole("button", { name: "Show on profile" }).click();
await n.page.waitForTimeout(800);
await n.page.getByLabel(/I am 18 or older, and I/).check();
await n.page.getByLabel(/I am the person this profile/).check();
await n.page.getByLabel(/Everyone who appears/).check();
await n.page.getByLabel(/creator terms/).check();
await n.page.getByRole("button", { name: "Request verification" }).click();
await n.page.getByText(/Submitted\. The house will review/).waitFor();
check("verification submitted", true);

// ================================================================ owner verifies & publishes; member sees the verified social
await o.page.goto(`${BASE}/admin/creators`);
const vc = o.page.locator("article").filter({ hasText: "Nova Reyes" });
await vc.getByLabel("Identity confirmed").check();
await vc.getByLabel(/18\+ confirmed/).check();
await vc.getByLabel(/Consent & records/).check();
await vc.getByRole("button", { name: "Verify & publish" }).click();
await vc.getByText("Verified and published").waitFor();
await o.page.goto(`${BASE}/admin/onboarding`);
check("board: Nova is Live", (await col("Live").getByText("Nova Reyes").count()) === 1);

const m = await signIn("velvet@divafans.test");
const prof = await m.page.goto(`${BASE}/c/nova`);
check("member sees the new profile", prof.status() === 200);
check("verified social chip shown", await m.page.getByRole("list", { name: "Verified social profiles" }).getByText("@nova.moves").isVisible());
await shot(m.page, "profile-verified-social-desktop");
const rhea = await m.page.goto(`${BASE}/c/rhea`);
check("unverified creator still hidden", rhea.status() === 404);
const memberAdmin = await m.page.goto(`${BASE}/admin/onboarding/case/00000000-0000-0000-0000-000000000000`);
check("member /admin/onboarding/case → 404", memberAdmin.status() === 404);

// ================================================================ profile import (creator, export file → proposal → consent)
const ri = await signIn("rhea@divafans.test");
await ri.page.goto(`${BASE}/studio/settings`);
const imp = ri.page.locator("section").filter({ has: ri.page.getByRole("heading", { name: "Import a profile" }) });
await imp.locator('input[type="file"]').setInputFiles({
  name: "export.json",
  mimeType: "application/json",
  buffer: Buffer.from(JSON.stringify({ profile: { tagline: "Wood-fired, slow, singular.", website: "https://www.tiktok.com/@rhea.kiln?lang=en" } })),
});
await imp.getByRole("button", { name: "Import as a proposal" }).click();
await ri.page.getByTestId("import-result").waitFor();
check("import: result lists fields and an unverified link", /tagline/.test(await ri.page.getByTestId("import-result").innerText()) && /1 link/.test(await ri.page.getByTestId("import-result").innerText()));
check("import: profile unchanged before consent", !(await ri.page.getByLabel("Tagline (optional)").inputValue()).includes("Wood-fired"));
await ri.page.getByRole("button", { name: "Review the proposal" }).click();
const importCard = ri.page.getByRole("article", { name: "Imported profile proposal" });
await importCard.waitFor();
check("import: proposal card shows the imported link", await importCard.getByText("TikTok · @rhea.kiln").isVisible());
await shot(ri.page, "studio-import-proposal-desktop");
await axe(ri.page, "/studio (import proposal) @1440");
await importCard.getByRole("button", { name: "Accept and update my draft" }).click();
await importCard.getByText("Accepted").first().waitFor();
await importCard.getByRole("button", { name: "View my updated draft" }).click();
await ri.page.waitForTimeout(800);
check("import: tagline applied after consent", (await ri.page.getByLabel("Tagline (optional)").inputValue()) === "Wood-fired, slow, singular.");
const socialsSec = ri.page.locator("section").filter({ has: ri.page.getByRole("heading", { name: "Social profiles" }) });
check("import: link added as an unverified claim", (await socialsSec.getByText("TikTok · @rhea.kiln").count()) === 1 && (await socialsSec.getByTestId("proof-code").count()) >= 2);
// Same content pasted as text: recognised as a duplicate, nothing filed.
await imp.getByLabel("Paste profile details").fill("Tagline: Wood-fired, slow, singular.\nhttps://www.tiktok.com/@rhea.kiln");
await imp.getByRole("button", { name: "Import as a proposal" }).click();
await imp.locator("form [role=alert]").first().waitFor();
check("import: duplicate refused", /already filed/.test(await imp.locator("form [role=alert]").first().innerText()));
check("import: pasted text echoed after error", (await imp.getByLabel("Paste profile details").inputValue()).includes("Wood-fired"));
const memberStudio = await m.page.goto(`${BASE}/studio`);
check("member /studio → 404 (no import surface)", memberStudio.status() === 404);
await ri.ctx.close();

// ================================================================ mobile
const om = await signIn("owner@divafans.test", mobile);
await om.page.goto(`${BASE}/admin/onboarding`);
await shot(om.page, "onboarding-board-mobile");
await axe(om.page, "/admin/onboarding @390");
const overflow = await om.page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
check("mobile board: no horizontal overflow", overflow <= 0, String(overflow));
const rm = await signIn("rhea@divafans.test", mobile);
await rm.page.goto(`${BASE}/studio`);
await shot(rm.page, "studio-mobile");
await axe(rm.page, "/studio @390");
check("Rhea's studio never shows concierge notes", !(await rm.page.content()).includes("Kiln schedule"));

await browser.close();
await db.end();
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? "✓" : "✗"} ${r.name}${!r.ok && r.detail ? `\n    ${r.detail}` : ""}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
