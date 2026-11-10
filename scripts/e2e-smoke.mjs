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

  const desktopCta = page.getByRole("banner").getByRole("link", { name: "Log in" });
  check("mobile: header log-in collapses into the menu", !(await desktopCta.isVisible()));
  const primary = page.locator("section[aria-labelledby=hero-title]").getByRole("link", { name: "Join as a Creator" });
  check("mobile: primary CTA visible in the first screen", (await primary.isVisible()) && (await primary.boundingBox()).y + 56 <= 844);
  check("mobile: CTA touch targets ≥ 44px", (await primary.boundingBox()).height >= 44);

  await page.getByRole("button", { name: "Open menu" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  check("mobile: menu sheet opens as dialog", await dialog.isVisible());
  check("mobile: menu lists 4 sections", (await dialog.getByRole("navigation").getByRole("link").count()) === 4);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  check("mobile: Escape closes sheet", !(await dialog.isVisible().catch(() => false)));

  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Features" }).click();
  await page.waitForTimeout(1200);
  check("mobile: menu link navigates to section", page.url().endsWith("#features"));
  await ctx.close();
}

// ---- Layout: no horizontal overflow at the supported widths
for (const width of [320, 360, 375, 390, 430, 768, 1024, 1440, 1920]) {
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
  check("hero: headline states the product", /Premium Space for Exclusive Creators/.test((await page.locator("#hero-title").textContent()) ?? ""));
  check("hero: creator CTA goes to the creator section", (await hero.getByRole("link", { name: "Join as a Creator" }).getAttribute("href")) === "/#creators");
  check("hero: discover CTA goes to the real directory", (await hero.getByRole("link", { name: "Discover Creators" }).getAttribute("href")) === "/discover");
  check("hero: portrait is the prioritised image", await page.evaluate(() => { const i = document.querySelector("section[aria-labelledby=hero-title] img"); return !!i && i.complete && i.naturalWidth > 0 && i.getAttribute("fetchpriority") === "high"; }));
  check("hero: no public registration CTA", (await page.getByRole("link", { name: /request entry|register|sign up|apply/i }).count()) === 0);
  check("header: log in and join visible", (await page.getByRole("banner").getByRole("link", { name: "Log in" }).isVisible()) && (await page.getByRole("banner").getByRole("link", { name: /^Join / }).isVisible()));
  check("header: no pricing link (no pricing page exists)", (await page.getByRole("link", { name: /pricing/i }).count()) === 0);
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

// ---- SEO and social metadata, read from the raw server HTML (no JavaScript)
{
  const html = await (await fetch(BASE + "/")).text();
  const meta = (attr, key) => (html.match(new RegExp(`<meta[^>]*${attr}="${key}"[^>]*content="([^"]*)"`)) ?? [])[1];
  const TITLE = "DivaFans | Your World. Your Fans. Your Rules.";
  const DESC = "Exclusive content. Real connections. A private world for creators and their fans.";
  const OG = "https://www.divafans.io/og-divafans.jpg";
  check("seo: <title>", html.includes(`<title>${TITLE}</title>`));
  check("seo: meta description", meta("name", "description") === DESC);
  const HOME = ["https://www.divafans.io", "https://www.divafans.io/"];
  check("seo: canonical", HOME.some((u) => html.includes(`<link rel="canonical" href="${u}"/>`)));
  check("og: title, description, site_name, url, type", meta("property", "og:title") === TITLE && meta("property", "og:description") === DESC && meta("property", "og:site_name") === "DivaFans" && HOME.includes(meta("property", "og:url")) && meta("property", "og:type") === "website");
  check("og: image absolute https, 1200x630, jpeg", meta("property", "og:image") === OG && meta("property", "og:image:width") === "1200" && meta("property", "og:image:height") === "630" && meta("property", "og:image:type") === "image/jpeg");
  check("twitter: summary_large_image with title, description, image", meta("name", "twitter:card") === "summary_large_image" && meta("name", "twitter:title") === TITLE && meta("name", "twitter:description") === DESC && meta("name", "twitter:image") === OG);
  check("seo: JSON-LD organisation and website", /"@type":"Organization"[^]*"@type":"WebSite"/.test(html) && html.includes('"name":"DivaFans"'));
  check("brand: no legacy name in homepage HTML", !/moonuk/i.test(html));
  const img = await fetch(BASE + "/og-divafans.jpg");
  check("og: image file served as image/jpeg", img.ok && img.headers.get("content-type") === "image/jpeg", `${img.status} ${img.headers.get("content-type")}`);
  const mf = await fetch(BASE + "/manifest.webmanifest");
  const manifest = mf.ok ? await mf.json() : {};
  check("manifest: DivaFans with 192 and 512 icons", manifest.name === "DivaFans" && manifest.icons?.length === 2 && html.includes('rel="manifest"'));
  const assets = await Promise.all(["/favicon.ico", "/icon.png", "/apple-icon.png", "/icons/icon-192.png", "/icons/icon-512.png"].map((p) => fetch(BASE + p).then((r) => r.ok)));
  check("icons: favicon, icon, apple-icon and manifest icons served", assets.every(Boolean));
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
