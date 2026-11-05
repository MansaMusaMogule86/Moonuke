// Phase 2 end-to-end: invitation → application → approval → discovery →
// entitlements → referrals → suspension, plus axe WCAG 2.1 AA on every route.
// Requires a freshly seeded DB (pnpm db:seed) and a running server.
//   BASE=http://localhost:3000 SHOTS=./screenshots node scripts/e2e-phase2.mjs
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const axePath = require.resolve("axe-core/axe.min.js");

const BASE = process.env.BASE ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS;
const PW = "moonuke-dev-password";
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const desktop = { viewport: { width: 1440, height: 900 } };
const mobile = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

async function signIn(email, opts = desktop) {
  const ctx = await browser.newContext({ ...opts, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/signin`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PW);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(discover|pending)/);
  return { ctx, page };
}

async function shot(page, name) {
  if (!SHOTS) return;
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

const axeTargets = [];
async function axe(page, label) {
  await page.waitForTimeout(1400); // let entrance fades (opacity is kept under reduced motion) settle
  await page.addScriptTag({ path: axePath });
  const r = await page.evaluate(() => axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
  const v = r.violations.map((x) => `${x.id} (${x.nodes.length}): ${x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
  axeTargets.push(label);
  check(`axe ${label}`, v.length === 0, v.join("\n    "));
}

// ---------------------------------------------------------------- owner issues an invitation
const owner = await signIn("owner@moonuke.test");
check("owner lands on /discover", owner.page.url().endsWith("/discover"));
check("owner sees House nav", await owner.page.getByRole("navigation", { name: "Club" }).first().getByRole("link", { name: "House" }).isVisible());

await owner.page.goto(`${BASE}/admin/invitations`);
await owner.page.getByLabel("Private note").fill("e2e invite");
await owner.page.getByRole("button", { name: "Create invitation" }).click();
const linkEl = owner.page.getByTestId("invite-link");
await linkEl.waitFor();
const inviteLink = (await linkEl.textContent()).trim();
check("invitation link issued once", /\/invite\/[A-Za-z0-9_-]{43}$/.test(inviteLink), inviteLink);
await shot(owner.page, "admin-invitations-desktop");

// ---------------------------------------------------------------- visitor applies
const visitorCtx = await browser.newContext({ ...desktop, reducedMotion: "reduce" });
const visitor = await visitorCtx.newPage();
await visitor.goto(`${BASE}/discover`);
check("anonymous /discover → /signin", visitor.url().endsWith("/signin"));
await visitor.goto(inviteLink.replace(/^https?:\/\/[^/]+/, BASE));
check("invite page shows application", await visitor.getByRole("heading", { name: /invited/ }).isVisible());
await shot(visitor, "invite-desktop");
await axe(visitor, "/invite/[valid] @1440");

await visitor.getByRole("button", { name: "Request approval" }).click();
await visitor.locator("form [role=alert]").first().waitFor();
check("empty application shows field errors", (await visitor.locator("form [role=alert]").count()) >= 3);
await visitor.getByLabel("Alias").fill("Orion");
await visitor.getByLabel("Email").fill("orion@example.com");
await visitor.getByLabel("Password").fill("orion-very-long-pass");
await visitor.getByLabel(/18 or older/).check();
await visitor.getByLabel(/house rules/).check();
await visitor.getByRole("button", { name: "Request approval" }).click();
await visitor.waitForURL(/\/pending$/);
check("application → /pending", visitor.url().endsWith("/pending"));
await shot(visitor, "pending-desktop");
await axe(visitor, "/pending @1440");

for (const path of ["/discover", "/c/isadora", "/refer", "/admin"]) {
  await visitor.goto(`${BASE}${path}`);
  check(`pending ${path} → /pending`, visitor.url().endsWith("/pending"), visitor.url());
}
const mediaProbe = await visitor.request.get(`${BASE}/api/media/00000000-0000-0000-0000-000000000000/0?exp=9999999999&sig=x`);
check("pending cannot fetch media", mediaProbe.status() === 404);

// Used invitation (1 use) now closed
const reuse = await browser.newContext(desktop);
const reusePage = await reuse.newPage();
await reusePage.goto(inviteLink.replace(/^https?:\/\/[^/]+/, BASE));
check("used invitation shows closed page", await reusePage.getByRole("heading", { name: /closed/ }).isVisible());
await axe(reusePage, "/invite/[invalid] @1440");
await reuse.close();

// ---------------------------------------------------------------- owner approves
await owner.page.goto(`${BASE}/admin`);
await shot(owner.page, "admin-applications-desktop");
await axe(owner.page, "/admin @1440");
const orionRow = owner.page.getByRole("listitem").filter({ hasText: "orion@example.com" });
await orionRow.getByRole("button", { name: "Approve" }).click();
await owner.page.getByText("Approved. The account is now active.").waitFor();
check("owner approval succeeds", true);

await visitor.goto(`${BASE}/discover`);
check("approved member reaches /discover", visitor.url().endsWith("/discover"), visitor.url());

// ---------------------------------------------------------------- discovery
await visitor.waitForTimeout(600);
const listed = await visitor.locator('a[href^="/c/"]').count();
check("discovery lists creators", listed >= 10, String(listed));
check("discreet creator not listed", (await visitor.locator('a[href="/c/amaya"]').count()) === 0);
check("private creator not listed", (await visitor.locator('a[href="/c/orsolya"]').count()) === 0);
await shot(visitor, "discover-desktop");
await axe(visitor, "/discover @1440");
await visitor.getByRole("searchbox").fill("lisbon");
await visitor.getByRole("searchbox").press("Enter");
await visitor.waitForURL(/q=lisbon/);
check("search narrows results", (await visitor.locator('a[href^="/c/"]').count()) === 1);
await visitor.goto(`${BASE}/discover?category=music`);
check("category filter", (await visitor.locator('a[href^="/c/"]').count()) === 2);

// ---------------------------------------------------------------- profile + entitlements (non-subscriber)
await visitor.goto(`${BASE}/c/isadora`);
const html = await visitor.content();
check("free preview body visible", html.includes("This one is open to everyone"));
check("member body NOT in HTML", !html.includes("For members: the full story"));
check("VIP body NOT in HTML", !html.includes("For the VIP room only"));
check("PPV body NOT in HTML", !html.includes("The full set, as promised"));
await shot(visitor, "profile-desktop");
await axe(visitor, "/c/isadora @1440");

await visitor.getByRole("button", { name: /Join VIP · \$48/ }).click();
const sheet = visitor.getByRole("dialog");
await sheet.getByText("$48").waitFor();
check("checkout quote from server", await sheet.getByText("$48").isVisible());
check("checkout disabled", await sheet.getByRole("button", { name: "Checkout unavailable" }).isDisabled());
await shot(visitor, "checkout-sheet-desktop");
await visitor.keyboard.press("Escape");

await visitor.getByRole("button", { name: "Follow" }).click();
await visitor.getByRole("button", { name: "Following" }).waitFor();
await visitor.reload();
check("follow persists", await visitor.getByRole("button", { name: "Following" }).isVisible());

await visitor.goto(`${BASE}/c/orsolya`);
check("private profile 404 for non-subscriber", (await visitor.title()).includes("404") || (await visitor.getByText(/could not be found|not found/i).count()) > 0);
await visitor.goto(`${BASE}/c/amaya`);
check("discreet profile reachable by link", await visitor.getByRole("heading", { level: 1 }).isVisible());

// ---------------------------------------------------------------- member with entitlements
const noct = await signIn("nocturne@moonuke.test");
await noct.page.goto(`${BASE}/c/isadora`);
const nhtml = await noct.page.content();
check("VIP sees VIP body", nhtml.includes("For the VIP room only"));
check("VIP does not see PPV body", !nhtml.includes("The full set, as promised"));
const imgSrc = await noct.page.locator('article img[src^="/api/media/"]').first().getAttribute("src");
const own = await noct.page.request.get(`${BASE}${imgSrc}`);
check("entitled media served", own.status() === 200 && own.headers()["content-type"].startsWith("image/svg+xml"));
check("media is private/no-store", (own.headers()["cache-control"] ?? "").includes("no-store"));
const stolen = await visitor.request.get(`${BASE}${imgSrc}`);
check("signed URL useless to another viewer", stolen.status() === 404);
const anon = await (await browser.newContext()).request.get(`${BASE}${imgSrc}`);
check("signed URL useless without session", anon.status() === 404);
const tampered = await noct.page.request.get(`${BASE}${imgSrc.replace(/sig=[^&]+/, "sig=AAAA")}`);
check("tampered signature rejected", tampered.status() === 404);

// ---------------------------------------------------------------- referral
await noct.page.goto(`${BASE}/refer`);
await axe(noct.page, "/refer @1440");
await noct.page.getByLabel("Their name").fill("Lyra");
await noct.page.getByLabel("Their email").fill("lyra@example.com");
await noct.page.getByLabel("How do you know them?").fill("We studied together in Vienna for years.");
await noct.page.getByRole("button", { name: "Send request to the house" }).click();
await noct.page.getByText("Request sent to the house").waitFor();
check("referral request recorded", await noct.page.getByText("lyra@example.com").isVisible());
await shot(noct.page, "refer-desktop");
const adminAsMember = await noct.page.goto(`${BASE}/admin`);
check("member /admin → 404", adminAsMember.status() === 404);
const invAsMember = await noct.page.goto(`${BASE}/admin/invitations`);
check("member /admin/invitations → 404", invAsMember.status() === 404);

await owner.page.goto(`${BASE}/admin/referrals`);
await axe(owner.page, "/admin/referrals @1440");
const lyra = owner.page.getByRole("listitem").filter({ hasText: "lyra@example.com" });
await lyra.getByRole("button", { name: /Approve & issue/ }).click();
await owner.page.getByTestId("invite-link").waitFor();
check("referral approval issues link to owner", /\/invite\//.test(await owner.page.getByTestId("invite-link").textContent()));
await shot(owner.page, "admin-referrals-desktop");
await noct.page.goto(`${BASE}/refer`);
check("requester sees approved status, no link", (await noct.page.getByText("Invitation issued").count()) > 0 && !(await noct.page.content()).includes("/invite/"));

// ---------------------------------------------------------------- suspension
const velvet = await signIn("velvet@moonuke.test");
await owner.page.goto(`${BASE}/admin/members`);
await axe(owner.page, "/admin/members @1440");
const vrow = owner.page.getByRole("listitem").filter({ hasText: "velvet@moonuke.test" });
await vrow.getByRole("button", { name: "Suspend Velvet Hour" }).click();
await vrow.getByLabel("Reason").fill("e2e test");
await vrow.getByRole("button", { name: "Confirm suspension" }).click();
await owner.page.getByText("Account suspended").waitFor();
await velvet.page.goto(`${BASE}/discover`);
check("suspended session is revoked immediately", velvet.page.url().endsWith("/signin"), velvet.page.url());
await velvet.page.getByLabel("Email").fill("velvet@moonuke.test");
await velvet.page.getByLabel("Password").fill(PW);
await velvet.page.getByRole("button", { name: "Sign in" }).click();
await velvet.page.locator("form [role=alert]").waitFor();
check("suspended cannot sign in", (await velvet.page.locator("form [role=alert]").textContent()).includes("can't sign in"));

await owner.page.goto(`${BASE}/admin/audit`);
const audit = await owner.page.content();
check("audit records the session's actions", ["invitation.create", "application.submit", "application.approve", "referral.request", "referral.approve", "account.suspend"].every((a) => audit.includes(a)));
await shot(owner.page, "admin-audit-desktop");
await axe(owner.page, "/admin/audit @1440");

// ---------------------------------------------------------------- bad credentials
const bad = await browser.newContext(desktop);
const badPage = await bad.newPage();
await badPage.goto(`${BASE}/signin`);
await axe(badPage, "/signin @1440");
await badPage.getByLabel("Email").fill("nocturne@moonuke.test");
await badPage.getByLabel("Password").fill("not-the-password");
await badPage.getByRole("button", { name: "Sign in" }).click();
await badPage.locator("form [role=alert]").waitFor();
check("wrong password → generic error", (await badPage.locator("form [role=alert]").textContent()).includes("don't match"));

// ---------------------------------------------------------------- mobile pass
const m = await signIn("nocturne@moonuke.test", mobile);
check("mobile bottom tab bar", await m.page.locator("nav[aria-label=Club].fixed").isVisible());
await shot(m.page, "discover-mobile");
await axe(m.page, "/discover @390");
await m.page.goto(`${BASE}/c/isadora`);
await shot(m.page, "profile-mobile");
await axe(m.page, "/c/isadora @390");
await m.page.goto(`${BASE}/refer`);
await axe(m.page, "/refer @390");
const overflow = await m.page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
check("mobile: no horizontal overflow", overflow <= 0, String(overflow));
const om = await signIn("owner@moonuke.test", mobile);
await om.page.goto(`${BASE}/admin`);
await shot(om.page, "admin-mobile");
await axe(om.page, "/admin @390");
await om.page.goto(`${BASE}/admin/invitations`);
await axe(om.page, "/admin/invitations @390");
const sm = await browser.newContext({ ...mobile, reducedMotion: "reduce" });
const smp = await sm.newPage();
await smp.goto(`${BASE}/signin`);
await shot(smp, "signin-mobile");
await axe(smp, "/signin @390");

await browser.close();
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? "✓" : "✗"} ${r.name}${!r.ok && r.detail ? `\n    ${r.detail}` : ""}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
