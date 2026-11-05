// Interaction + accessibility smoke test against a running server.
// Usage: BASE=http://localhost:3000 node scripts/e2e-smoke.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const axePath = require.resolve("axe-core/axe.min.js");

const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok, detail });

const browser = await chromium.launch();

// ---- Mobile interactions
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });

  const desktopCta = page.getByRole("banner").getByRole("link", { name: "Sign in" });
  check("mobile: header CTAs collapse", !(await desktopCta.isVisible()));

  await page.getByRole("button", { name: "Open menu" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  check("mobile: menu sheet opens as dialog", await dialog.isVisible());
  check("mobile: menu lists 5 sections", (await dialog.getByRole("navigation").getByRole("link").count()) === 5);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  check("mobile: Escape closes sheet", !(await dialog.isVisible().catch(() => false)));

  // Menu link navigates and closes
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("dialog").getByRole("link", { name: /Privacy/ }).click();
  await page.waitForTimeout(1200);
  check("mobile: menu link navigates to section", page.url().endsWith("#privacy"));

  await ctx.close();
}

// ---- Desktop interactions
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);

  const hero = page.locator("section[aria-labelledby=hero-title]");
  await hero.getByRole("radio", { name: "Creator" }).check({ force: true });
  check("hero: role toggle swaps secondary CTA", await hero.getByRole("link", { name: "What creators get" }).isVisible());
  check("hero: no public registration CTA", (await page.getByRole("link", { name: /request entry|register|sign up|apply/i }).count()) === 0);

  const counter = page.getByText(/^0\d \/ 05$/).first();
  const before = await counter.textContent();
  await page.getByRole("button", { name: "Next creators" }).click();
  await page.waitForTimeout(900);
  const after = await counter.textContent();
  check("hero: carousel advances", before !== after, `${before} → ${after}`);

  await page.locator("#vault").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Unlock" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.waitFor({ state: "visible" });
  check("vault: PPV opens sheet", await sheet.isVisible());
  check("vault: checkout disabled in preview", await sheet.getByRole("button", { name: /Checkout unavailable/ }).isDisabled());
  await page.keyboard.press("Escape");

  // Keyboard: skip link is first tab stop
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
  check("a11y: skip link is first tab stop", focused === "Skip to content", focused);
  await ctx.close();
}

// ---- Reduced motion: content must still be visible
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const anim = await page.evaluate(() => getComputedStyle(document.querySelector(".mk-marquee")).animationName);
  check("reduced motion: marquee paused", anim === "none", anim);
  const titleOk = await page.locator("#hero-title").isVisible();
  check("reduced motion: hero title visible", titleOk);
  await ctx.close();
}

// ---- axe-core WCAG 2.1 AA scan
for (const route of ["/", "/design-system"]) {
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ viewport: vp, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(BASE + route, { waitUntil: "networkidle" });
    // Scroll through so in-view content is rendered at full opacity.
    const h = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < h; y += 600) { await page.evaluate((yy) => scrollTo(0, yy), y); await page.waitForTimeout(80); }
    await page.waitForTimeout(1500);
    await page.addScriptTag({ path: axePath });
    const r = await page.evaluate(async () =>
      // eslint-disable-next-line no-undef
      axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }),
    );
    const v = r.violations.map((x) => `${x.id} (${x.nodes.length}): ${x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
    check(`axe ${route} @${vp.width}`, v.length === 0, v.join("\n    "));
    await ctx.close();
  }
}

await browser.close();
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.detail && !r.ok ? `\n    ${r.detail}` : r.detail ? `  (${r.detail})` : ""}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
