// Phase 7 end-to-end (7a–7c): private messaging, Blasts and appeals — open from profile, send, refuse
// links, near-real-time reply, notifications, access control, report → house
// review, removal, exceptional-access guard, restrict, creator tools, axe.
//   BASE=http://localhost:3000 SHOTS=./screenshots node scripts/e2e-phase7.mjs
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

// ================================================================ member opens a conversation from the profile
const n = await signIn("nocturne@moonuke.test");
await n.page.goto(`${BASE}/c/isadora`);
await n.page.getByRole("button", { name: /^Message Isadora Lune$/ }).click();
await n.page.waitForURL(/\/messages\/[0-9a-f-]{36}$/);
const convUrl = n.page.url();
const convId = convUrl.split("/").pop();
check("member opens a conversation", true);
await axe(n.page, "/messages/[id] (empty) @1440");
const box = n.page.getByLabel("Message Isadora Lune");
await box.fill("Hello from the e2e member");
await n.page.getByRole("button", { name: "Send" }).click();
await n.page.getByRole("list", { name: "Conversation with Isadora Lune" }).getByText("Hello from the e2e member").waitFor();
check("message sent and shown", (await box.inputValue()) === "");

// Links/contact details are refused and the draft is kept.
await box.fill("find me at example.com");
await n.page.getByRole("button", { name: "Send" }).click();
await n.page.locator("form [role=alert]").first().waitFor();
check("link refused", /links|contact/i.test(await n.page.locator("form [role=alert]").first().innerText()));
check("draft kept after refusal", (await box.inputValue()) === "find me at example.com");
await box.fill("");

// ================================================================ creator sees it, replies; member receives by polling
const c = await signIn("isadora@moonuke.test");
await c.page.goto(`${BASE}/notifications`);
check("creator notified (no message text)", (await c.page.getByText("New message from Nocturne").count()) > 0 && !(await c.page.content()).includes("Hello from the e2e member"));
await c.page.goto(`${BASE}/messages`);
const row = c.page.getByRole("list", { name: "Conversations" }).getByRole("link").filter({ hasText: "Nocturne" });
check("inbox shows unread", /Unread/.test(await row.innerText()));
await shot(c.page, "messages-inbox-desktop");
await axe(c.page, "/messages @1440");
await row.click();
await c.page.waitForURL(/\/messages\//);
await c.page.getByText("Hello from the e2e member").waitFor();
await c.page.getByLabel("Message Nocturne").fill("Thank you — welcome to the salon.");
await c.page.getByRole("button", { name: "Send" }).click();
await c.page.getByRole("list", { name: "Conversation with Nocturne" }).getByText("Thank you — welcome to the salon.").waitFor();
await n.page.getByText("Thank you — welcome to the salon.").waitFor({ timeout: 15000 });
check("member receives the reply without reloading", true);
await shot(n.page, "messages-thread-desktop");
await axe(n.page, "/messages/[id] @1440");

// ================================================================ access control
const v = await signIn("velvet@moonuke.test");
await v.page.goto(`${BASE}/c/isadora`);
check("non-member sees no Message button", (await v.page.getByRole("button", { name: /^Message Isadora Lune$/ }).count()) === 0);
check("non-member: conversation page → 404", (await v.page.goto(convUrl)).status() === 404);
check("non-member: messages API → 404", (await v.ctx.request.get(`${BASE}/api/messages/${convId}`)).status() === 404);
const anon = await browser.newContext(desktop);
check("signed out: messages API → 404", (await anon.request.get(`${BASE}/api/messages/${convId}`)).status() === 404);
const z = await signIn("zara@moonuke.test");
check("other creator: conversation page → 404", (await z.page.goto(convUrl)).status() === 404);
const own = await n.ctx.request.get(`${BASE}/api/messages/${convId}`);
check("participant API works and is not cacheable", own.ok() && /no-store/.test(own.headers()["cache-control"] ?? ""));

// ================================================================ report → house review (minimal, logged)
await c.page.goto(convUrl);
await c.page.getByRole("button", { name: "Report message" }).first().click();
const sheet = c.page.getByRole("dialog");
await sheet.getByLabel("Harassment or threats").check();
await sheet.getByRole("button", { name: "Send report" }).click();
await sheet.getByText("The house will review your report").waitFor();
check("creator reports a message", true);
await c.page.keyboard.press("Escape");
const o = await signIn("owner@moonuke.test");
check("owner can't use messaging", (await o.page.goto(`${BASE}/messages`)).status() === 404);
await o.page.goto(`${BASE}/admin/moderation`);
await o.page.getByRole("link", { name: "Review message (logged)" }).first().click();
await o.page.waitForURL(/\/admin\/messaging\/report\//);
check("house sees the reported message", await o.page.getByText("Hello from the e2e member").isVisible());
await axe(o.page, "/admin/messaging/report/[id] @1440");
await o.page.getByRole("button", { name: "Remove message" }).click();
await o.page.getByText("Message removed from the conversation.").waitFor();
await c.page.goto(convUrl);
check("removed message is gone for the creator", !(await c.page.content()).includes("Hello from the e2e member"));
await o.page.getByRole("button", { name: /Exceptional access/ }).click();
await o.page.getByLabel("Justification (at least 40 characters)").fill("too short");
await o.page.getByRole("button", { name: "Record justification and open" }).click();
await o.page.locator("form [role=alert]").first().waitFor();
check("exceptional access needs a real justification", true);
await o.page.goto(`${BASE}/admin/messaging`);
await axe(o.page, "/admin/messaging @1440");

// ================================================================ restrict
await c.page.goto(convUrl);
await c.page.getByRole("button", { name: "Restrict" }).click();
await c.page.getByText("They can't send you messages").waitFor();
await n.page.goto(convUrl);
check("restricted member sees why and has no composer", (await n.page.getByText("paused messages from you").isVisible()) && (await n.page.getByLabel("Message Isadora Lune").count()) === 0);
await c.page.getByRole("button", { name: "Allow messages" }).click();
await c.page.getByText("They can message you again").waitFor();

// ================================================================ creator tools
await c.page.goto(`${BASE}/messages/new`);
check("creator can start with a current member", (await c.page.getByRole("list", { name: "Current members" }).getByRole("listitem").filter({ hasText: "Nocturne" }).count()) === 1);
await axe(c.page, "/messages/new @1440");
await c.page.goto(`${BASE}/studio/messaging`);
await axe(c.page, "/studio/messaging @1440");
check("paid requests disabled while payments are off", await c.page.getByLabel("Accept paid message requests").isDisabled());

// ================================================================ Blasts (7b)
await c.page.goto(`${BASE}/studio/blasts`);
await shot(c.page, "blasts-desktop");
await axe(c.page, "/studio/blasts @1440");
const compose = c.page.locator("section").filter({ has: c.page.getByRole("heading", { name: "New Blast" }) });
await compose.getByLabel("Message", { exact: true }).fill("visit example.com today");
await compose.getByRole("button", { name: "Send Blast" }).click();
await compose.locator("form [role=alert]").first().waitFor();
check("blast with a link refused", true);
await compose.getByLabel("Message", { exact: true }).fill("Hello {name}, the e2e salon letter is up.");
await compose.getByRole("button", { name: "Send Blast" }).click();
await c.page.getByTestId("blast-saved").waitFor();
await n.page.goto(convUrl);
let got = false;
for (let i = 0; i < 10 && !got; i++) {
  got = (await n.page.getByText("Hello Nocturne, the e2e salon letter is up.").count()) > 0;
  if (!got) { await n.page.waitForTimeout(1500); await n.page.reload(); }
}
check("blast arrives as a personalised private message", got);
check("fan can stop broadcasts", await n.page.getByRole("button", { name: "Stop broadcasts" }).isVisible());
await c.page.goto(`${BASE}/studio/blasts`);
const hist = c.page.getByRole("list", { name: "Your Blasts" }).getByRole("listitem").first();
check("history shows delivery counts, no recipient names", /delivered/.test(await hist.innerText()) && !/Nocturne/.test(await c.page.getByRole("list", { name: "Your Blasts" }).innerText()));
await c.page.goto(`${BASE}/studio/blasts/lists`);
await axe(c.page, "/studio/blasts/lists @1440");
await c.page.getByLabel("New list name").fill("E2E front row");
await c.page.getByRole("button", { name: "Create list" }).click();
const listSec = c.page.locator("section").filter({ has: c.page.getByRole("heading", { name: /E2E front row/ }) });
await listSec.waitFor();
await listSec.getByRole("button", { name: "Add" }).click();
await listSec.getByRole("button", { name: /^Remove / }).first().waitFor();
check("custom list: member added", true);
const memberBlasts = await v.page.goto(`${BASE}/studio/blasts`);
check("member /studio/blasts → 404", memberBlasts.status() === 404);

// ================================================================ pause → appeal → overturn (7c)
await o.page.goto(`${BASE}/admin/moderation`);
await o.page.getByRole("link", { name: "Review message (logged)" }).first().click();
await o.page.waitForURL(/\/admin\/messaging\/report\//);
await o.page.getByLabel(/^Reason \(shown to/).fill("Please slow down while we review a report");
await o.page.getByRole("button", { name: "Pause messaging" }).click();
await o.page.getByText("Messaging paused for this account.").waitFor();
await n.page.goto(`${BASE}/messages`);
check("paused member sees the banner", await n.page.getByRole("heading", { name: /Messaging is paused until/ }).isVisible());
await axe(n.page, "/messages (paused) @1440");
await n.page.getByLabel("Appeal (optional)").fill("I only wrote one friendly message; please take another look.");
await n.page.getByRole("button", { name: "Send appeal" }).click();
await n.page.getByText("Your appeal is with the house.").waitFor();
await o.page.goto(`${BASE}/admin/messaging`);
await o.page.getByRole("button", { name: "Overturn and lift" }).click();
await o.page.getByText("Overturned").waitFor();
await n.page.goto(`${BASE}/messages`);
check("overturned appeal lifts the pause", (await n.page.getByRole("heading", { name: /Messaging is paused/ }).count()) === 0);

// ================================================================ mobile
const nm = await signIn("nocturne@moonuke.test", mobile);
for (const p of ["/messages", convUrl.replace(BASE, "")]) {
  await nm.page.goto(`${BASE}${p}`);
  await axe(nm.page, `${p.startsWith("/messages/") ? "/messages/[id]" : p} @390`);
  const ov = await nm.page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(`mobile ${p.startsWith("/messages/") ? "thread" : p}: no horizontal overflow`, ov <= 0, String(ov));
}
await shot(nm.page, "messages-thread-mobile");
check("mobile nav has Messages", await nm.page.getByRole("navigation", { name: "Club" }).last().getByRole("link", { name: "Messages" }).isVisible());

await browser.close();
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? "✓" : "✗"} ${r.name}${!r.ok && r.detail ? `\n    ${r.detail}` : ""}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
