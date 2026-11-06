// Safety and compliance end-to-end: public takedown notices (no account),
// 48-hour queue, removal with copies, pre-publication review, participant
// records and consent withdrawal, safeguarding (training gate, manual-only
// NCMEC draft), access denial, axe WCAG 2.1 AA at 1440 and 390 px.
// Requires a freshly seeded DB and a running production server.
//   BASE=http://localhost:3000 DATABASE_URL=… SHOTS=./screenshots node scripts/e2e-safety.mjs
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

// ================================================================ public takedown form (no account)
const target = await postOf("isadora", "preview");
const anon = await browser.newContext(desktop);
const ap = await anon.newPage();
const tr = await ap.goto(`${BASE}/takedown`);
check("takedown page is public → 200", tr.status() === 200);
check("takedown page explains the 48-hour commitment", await ap.getByText(/within 48 hours/).isVisible());
await axe(ap, "takedown @1440");
await shot(ap, "takedown-desktop");

await fillNotice(ap, { category: "ncii", role: "depicted_person", location: "somewhere", agree: false });
const visible = (loc) => loc.first().waitFor({ timeout: 10_000 }).then(() => true, () => false);
check("missing statement → error shown", await visible(ap.getByText("Confirm the statement to continue.")));
check("form keeps typed values and choices after an error", (await ap.getByLabel("Your name").inputValue()) === "Fictional Requester" && (await ap.getByLabel("What is this about?").inputValue()) === "ncii");

await ap.goto(`${BASE}/takedown`);
await fillNotice(ap, { category: "ncii", role: "depicted_person", location: `${BASE}/c/isadora#${target.id}` });
await ap.getByTestId("takedown-ref").waitFor();
const ref = (await ap.getByTestId("takedown-ref").innerText()).trim();
check("notice accepted with a reference", /^TD-[A-Z2-7]{10}$/.test(ref), ref);
const row = await one(`select status, contact_enc, extract(epoch from due_at - received_at)/3600 as hours from app.takedown_notices where reference = $1`, [ref]);
check("contact stored encrypted", row && !row.contact_enc.includes("requester@example.test"));
check("48-hour deadline recorded", Number(row?.hours) === 48);
check("NCII notice withholds the post at once", (await one(`select hidden_at is not null as h from app.posts where id = $1`, [target.id])).h === true);

const ap2 = await (await browser.newContext(desktop)).newPage();
await ap2.goto(`${BASE}/takedown`);
await fillNotice(ap2, { category: "ncii", role: "depicted_person", location: `${BASE}/c/isadora#${target.id}` });
await ap2.getByTestId("takedown-ref").waitFor();
check("same person, same content → same reference (deduplicated)", (await ap2.getByTestId("takedown-ref").innerText()).trim() === ref);

const mp = await (await browser.newContext(mobile)).newPage();
await mp.goto(`${BASE}/takedown`);
await axe(mp, "takedown @390");
await noOverflow(mp, "takedown @390");
await shot(mp, "takedown-mobile");

// ================================================================ access control
await ap.goto(`${BASE}/admin/safety`);
check("signed out → /admin/safety redirects to sign-in", ap.url().includes("/signin"));
const member = await signIn("velvet@moonuke.test");
check("member → /admin/safety is 404", (await member.page.goto(`${BASE}/admin/safety`)).status() === 404);
await member.page.goto(`${BASE}/c/isadora`);
const bodyText = (pg) => pg.locator("body").innerText();
check("member can't see the withheld post", (await bodyText(member.page)).includes("Isadora") && !(await bodyText(member.page)).includes(target.teaser));
const creator = await signIn("isadora@moonuke.test");
check("creator → /admin/safety/safeguarding is 404", (await creator.page.goto(`${BASE}/admin/safety/safeguarding`)).status() === 404);

// ================================================================ owner: takedown queue
const o = await signIn("owner@moonuke.test");
await o.page.goto(`${BASE}/admin/safety`);
check("owner sees the notice in the queue", await o.page.getByRole("link", { name: ref }).isVisible());
await axe(o.page, "admin safety @1440");
await shot(o.page, "admin-safety");
await o.page.getByRole("link", { name: ref }).click();
await o.page.waitForURL(/\/admin\/safety\/takedown\//);
await axe(o.page, "takedown notice @1440");
const viewsBefore = (await one(`select count(*)::int as n from app.audit_log where action = 'takedown.contact_view'`)).n;
await o.page.getByRole("button", { name: /Show requester contact/ }).click();
await o.page.getByTestId("contact").waitFor();
check("owner can reveal the requester contact", (await o.page.getByTestId("contact").innerText()).includes("requester@example.test"));
check("contact reveal is audited", (await one(`select count(*)::int as n from app.audit_log where action = 'takedown.contact_view'`)).n === viewsBefore + 1);
await o.page.getByLabel("Decision note").fill("Valid notice from the person shown.");
await o.page.getByRole("button", { name: "Remove content and copies" }).click();
await o.page.getByText(/^Removed/).waitFor();
check("removal recorded", (await one(`select status from app.takedown_notices where reference = $1`, [ref])).status === "removed");
check("media fingerprint blocked", (await one(`select count(*)::int as n from app.blocked_media_hashes`)).n > 0);

// ================================================================ pre-publication review
const pending = await postOf("kaiasol", "preview");
await db.query(`update app.posts set review_state = 'pending', review_reasons = '{all_content}' where id = $1`, [pending.id]);
await member.page.goto(`${BASE}/c/kaiasol`);
check("pending post hidden from members", !(await bodyText(member.page)).includes(pending.teaser));
await o.page.goto(`${BASE}/admin/safety/review`);
check("pending post in the review queue", await o.page.getByText(pending.teaser).isVisible());
await axe(o.page, "review queue @1440");
const card = o.page.locator("li", { hasText: pending.teaser });
await card.getByRole("button", { name: "Approve" }).click();
await o.page.getByText(/^Approved/).waitFor();
await member.page.goto(`${BASE}/c/kaiasol`);
check("approved post visible to members", (await bodyText(member.page)).includes(pending.teaser));
await o.page.getByRole("button", { name: "Review every new post" }).click();
await o.page.getByText("Every new or edited post now waits for review.").waitFor();
check("review mode switched to all (audited)", (await one(`select review_mode from app.safety_settings`)).review_mode === "all" && (await one(`select count(*)::int as n from app.audit_log where action = 'review.mode'`)).n === 1);
await o.page.getByRole("button", { name: "Review flagged posts only" }).click();
await o.page.getByText("Only flagged posts wait for review.").waitFor();

// ================================================================ participants and consent
const cp = creator.page;
await cp.goto(`${BASE}/studio/participants`);
await axe(cp, "studio participants @1440");
await cp.getByLabel(/^Label/).fill("Partner A");
await cp.getByLabel("Full legal name").fill("Fictional Person");
await cp.getByLabel("Date of birth").fill("2012-05-01");
await cp.getByLabel("ID document seen").selectOption("passport");
await cp.getByLabel(/Country of the ID/).fill("GB");
await cp.getByRole("button", { name: "Add person" }).click();
check("under-18 participant refused", await visible(cp.getByText(/must be 18 or older/)));
check("nothing stored for the refused person", (await one(`select count(*)::int as n from app.participants`)).n === 0);
await cp.getByLabel("Full legal name").fill("Fictional Person");
await cp.getByLabel("Date of birth").fill("1991-05-01");
await cp.getByRole("button", { name: "Add person" }).click();
await cp.getByText(/^Added\./).waitFor();
check("adult participant added, waiting for verification", await cp.getByText("Waiting for verification").isVisible());
check("identity encrypted at rest", !(await one(`select identity_enc from app.participants`)).identity_enc.includes("Fictional Person"));
await cp.getByText("Record a consent").click();
await cp.getByLabel("What the consent covers").fill("Studio duo set, November");
await cp.getByLabel("Date signed").fill("2026-11-01");
await cp.getByLabel("Name they signed with").fill("Fictional Person");
await cp.getByRole("button", { name: "Record consent" }).click();
await cp.getByText("Consent recorded.").waitFor();
check("consent recorded", (await one(`select count(*)::int as n from app.participant_consents`)).n === 1);

await o.page.goto(`${BASE}/admin/safety/participants`);
await axe(o.page, "admin participants @1440");
await o.page.getByLabel("Why you need to see identity details").fill("Verifying age and identity before approval");
await o.page.getByRole("button", { name: /Show identity/ }).click();
await o.page.getByTestId("identity").waitFor();
check("owner reveals identity with a stated purpose", (await o.page.getByTestId("identity").innerText()).includes("1991-05-01"));
await o.page.getByRole("button", { name: "Verify" }).click();
await o.page.getByText("Verified.").waitFor();

const duo = await postOf("isadora", "members");
await cp.goto(`${BASE}/studio/posts/${duo.id}`);
await cp.getByLabel(/Partner A/).check();
await cp.getByRole("button", { name: "Save people" }).click();
await cp.getByText(/now waits for house review/).waitFor();
check("post naming a participant waits for review", (await one(`select review_state from app.posts where id = $1`, [duo.id])).review_state === "pending");
await axe(cp, "studio post with participants @1440");

await cp.goto(`${BASE}/studio/participants`);
await cp.getByRole("button", { name: "Withdraw consent" }).click();
await cp.getByText(/Consent withdrawn\. 1 post was hidden\./).waitFor();
check("consent withdrawal hides the post at once", (await one(`select hidden_at is not null as h from app.posts where id = $1`, [duo.id])).h === true);

const cm = await signIn("isadora@moonuke.test", mobile);
await cm.page.goto(`${BASE}/studio/participants`);
await axe(cm.page, "studio participants @390");
await noOverflow(cm.page, "studio participants @390");

// ================================================================ safeguarding
const csamTarget = await postOf("valentin", "preview");
const ap3 = await (await browser.newContext(desktop)).newPage();
await ap3.goto(`${BASE}/takedown`);
await fillNotice(ap3, { category: "csam", role: "other", location: `${BASE}/c/valentin#${csamTarget.id}`, email: "other@example.test" });
await ap3.getByTestId("takedown-ref").waitFor();
check("CSAM notice opens a safeguarding case with legal holds", (await one(`select count(*)::int as n from app.legal_holds`)).n >= 1 && (await one(`select count(*)::int as n from app.safeguarding_cases`)).n === 1);

await o.page.goto(`${BASE}/admin/safety`);
check("urgent safeguarding banner shown", await o.page.getByText(/safeguarding case needs a trained person/).isVisible());
await o.page.goto(`${BASE}/admin/safety/safeguarding`);
check("case details gated behind training", await o.page.getByRole("heading", { name: "Training required" }).isVisible());
await axe(o.page, "safeguarding gate @1440");
await o.page.getByLabel("Training completed on").fill(new Date().toISOString().slice(0, 10));
await o.page.getByLabel("Training (course or provider)").fill("Fictional safeguarding course");
await o.page.getByRole("button", { name: "Record my training" }).click();
await o.page.getByText(/Training recorded/).waitFor();
await o.page.goto(`${BASE}/admin/safety/safeguarding`);
const sgRef = (await one(`select reference from app.safeguarding_cases`)).reference;
check("trained owner sees the case", await o.page.getByRole("link", { name: sgRef }).isVisible());
await o.page.getByRole("link", { name: sgRef }).click();
await o.page.waitForURL(/\/admin\/safety\/safeguarding\//);
await axe(o.page, "safeguarding case @1440");
await shot(o.page, "safeguarding-case");
await o.page.getByRole("button", { name: "Prepare CyberTipline draft" }).click();
await o.page.getByText("Draft prepared. Nothing was sent.").waitFor();
check("draft is for manual entry only", (await o.page.getByLabel("Draft for manual entry").innerText()).includes("Nothing has been sent"));
await o.page.getByRole("button", { name: "Start assessment" }).click();
await o.page.getByText("Case is now assessing.").waitFor();
check("case moved to assessing (audited)", (await one(`select status from app.safeguarding_cases`)).status === "assessing");
check("no external request was made: no report number recorded", (await one(`select external_ref from app.safeguarding_cases`)).external_ref === null);

const om = await signIn("owner@moonuke.test", mobile);
await om.page.goto(`${BASE}/admin/safety`);
await axe(om.page, "admin safety @390");
await noOverflow(om.page, "admin safety @390");

await browser.close();
await db.end();
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? "✓" : "✗"} ${r.name}${!r.ok && r.detail ? `\n    ${r.detail}` : ""}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
