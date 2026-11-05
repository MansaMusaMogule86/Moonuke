// Capture desktop + mobile screenshots of key routes.
// Usage: BASE=http://localhost:3100 OUT=./screenshots node scripts/screenshots.mjs [route...]
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright"); // global install in CI image; or add as devDependency
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "screenshots";
const routes = process.argv.slice(2).length ? process.argv.slice(2) : ["/"];
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true },
];
const DPR = Number(process.env.DPR ?? 1);

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const errors = [];
for (const vp of viewports) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: DPR, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${vp.name}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${vp.name} console: ${m.text()}`));
  for (const r of routes) {
    await page.goto(BASE + r, { waitUntil: "networkidle" });
    await page.waitForTimeout(2600);
    const slug = r === "/" ? "home" : r.replace(/\//g, "_").replace(/^_/, "");
    await page.screenshot({ path: `${OUT}/${slug}-${vp.name}-fold.png` });
    // Scroll through to trigger in-view reveals, then capture full page.
    const h = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < h; y += vp.height * 0.6) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/${slug}-${vp.name}-full.png`, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) errors.push(`${vp.name} ${r}: horizontal overflow ${overflow}px`);
  }
  await ctx.close();
}
await browser.close();
console.log(errors.length ? errors.join("\n") : "no errors");
