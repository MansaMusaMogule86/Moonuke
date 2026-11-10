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
  check("mobile: header sign-in collapses into the menu", !(await desktopCta.isVisible()));
  check("mobile: hero sign-in visible", await page.locator("section[aria-labelledby=hero-title]").getByRole("link", { name: "Sign in" }).isVisible());

  await page.getByRole("button", { name: "Open menu" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  check("mobile: menu sheet opens as dialog", await dialog.isVisible());
  check("mobile: menu lists 4 sections", (await dialog.getByRole("navigation").getByRole("link").count()) === 4);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  check("mobile: Escape closes sheet", !(await dialog.isVisible().catch(() => false)));

  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "FAQ" }).click();
  await page.waitForTimeout(1200);
  check("mobile: menu link navigates to section", page.url().endsWith("#faq"));
  await ctx.close();
}

// ---- Layout: no horizontal overflow at the supported widths
for (const width of [360, 390, 768, 1024, 1440, 1920]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`layout: no horizontal overflow @${width}`, overflow <= 0, `${overflow}px`);
  await ctx.close();
}

// ---- Desktop interactions
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });

  const hero = page.locator("section[aria-labelledby=hero-title]");
  check("hero: headline states the product", /closer connection/i.test((await page.locator("#hero-title").textContent()) ?? ""));
  check("hero: sign-in goes to the real flow", (await hero.getByRole("link", { name: "Sign in" }).getAttribute("href")) === "/signin");
  check("hero: no public registration CTA", (await page.getByRole("link", { name: /request entry|register|sign up|apply/i }).count()) === 0);
  check("header: sign-in always visible", await page.getByRole("banner").getByRole("link", { name: "Sign in" }).isVisible());
  await page.locator("footer").scrollIntoViewIfNeeded();
  await page.waitForFunction(() => [...document.querySelectorAll("header img, footer img")].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 10000 }).catch(() => {});
  check("brand: header and footer logos load", await page.evaluate(() => [...document.querySelectorAll("header img, footer img")].every((i) => i.complete && i.naturalWidth > 0)));
  await page.evaluate(() => scrollTo(0, 0));
  check("old anchors still resolve", await page.evaluate(() => ["circle", "tiers", "vault", "privacy", "creators"].every((id) => document.getElementById(id))));

  // FAQ: native disclosure, keyboard operable
  const first = page.locator("#faq summary").first();
  await first.focus();
  await page.keyboard.press("Enter");
  check("faq: disclosure opens with keyboard", await page.locator("#faq details").first().evaluate((d) => d.open));

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
  const anim = await page.evaluate(() => getComputedStyle(document.querySelector(".mk-rise")).animationName);
  check("reduced motion: entrance animation off", anim === "none", anim);
  check("reduced motion: hero title visible", await page.locator("#hero-title").isVisible());
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
