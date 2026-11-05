// Phase 4 end-to-end: white-glove onboarding — case → invite → apply →
// approve → assistant-drafted proposal → creator consent → social proof →
// verification → live — plus authorization boundaries and axe WCAG 2.1 AA.
// Requires a freshly seeded DB, AI_PROVIDER=template, a running server.
//   BASE=http://localhost:3000 SHOTS=./screenshots node scripts/e2e-phase4.mjs
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

// ================================================================ pipeline + open a case
const o = await signIn("owner@moonuke.test");
await o.page.goto(`${BASE}/admin/onboarding`);
const col = (label) => o.page.locator("section").filter({ has: o.page.getByRole("heading", { name: label, exact: true }) });
check("board: Lio waits in Invited", (await col("Invited").getByText("Lio Marchand").count()) === 1);
check("board: Rhea is Ready to verify", (await col("Ready to verify").getByText("Rhea Calder").count()) === 1);
check("board: curated creators are Live", (await col("Live").getByText("Isadora Lune").count()) === 1);
await shot(o.page, "onboarding-board-desktop");
await axe(o.page, "/admin/onboarding @1440");

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
await vp.getByLabel("Alias").fill("Nova R");
await vp.getByLabel("Email").fill("someone@example.com");
await vp.getByLabel("Password").fill("nova-very-long-pass-1");
await vp.getByLabel(/18 or older/).check();
await vp.getByLabel(/house rules/).check();
await vp.getByRole("button", { name: "Request approval" }).click();
await vp.locator("form [role=alert]").first().waitFor();
check("email-locked invite rejects another address", (await vp.content()).includes("different email"));
check("consent choices survive a failed submit", (await vp.getByLabel(/18 or older/).isChecked()) && (await vp.getByLabel(/house rules/).isChecked()));
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
await app.getByText("Approved. The account is now active.").waitFor();
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
await n.page.goto(`${BASE}/studio`);
check("white-glove studio", await n.page.getByText(/White-glove/).first().isVisible());
const card = n.page.getByRole("article", { name: "Profile proposal from the house" });
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
await n.page.goto(`${BASE}/studio`);
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

const m = await signIn("velvet@moonuke.test");
const prof = await m.page.goto(`${BASE}/c/nova`);
check("member sees the new profile", prof.status() === 200);
check("verified social chip shown", await m.page.getByRole("list", { name: "Verified social profiles" }).getByText("@nova.moves").isVisible());
await shot(m.page, "profile-verified-social-desktop");
const rhea = await m.page.goto(`${BASE}/c/rhea`);
check("unverified creator still hidden", rhea.status() === 404);
const memberAdmin = await m.page.goto(`${BASE}/admin/onboarding/case/00000000-0000-0000-0000-000000000000`);
check("member /admin/onboarding/case → 404", memberAdmin.status() === 404);

// ================================================================ mobile
const om = await signIn("owner@moonuke.test", mobile);
await om.page.goto(`${BASE}/admin/onboarding`);
await shot(om.page, "onboarding-board-mobile");
await axe(om.page, "/admin/onboarding @390");
const overflow = await om.page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
check("mobile board: no horizontal overflow", overflow <= 0, String(overflow));
const rm = await signIn("rhea@moonuke.test", mobile);
await rm.page.goto(`${BASE}/studio`);
await shot(rm.page, "studio-mobile");
await axe(rm.page, "/studio @390");
check("Rhea's studio never shows concierge notes", !(await rm.page.content()).includes("Kiln schedule"));

await browser.close();
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? "✓" : "✗"} ${r.name}${!r.ok && r.detail ? `\n    ${r.detail}` : ""}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
