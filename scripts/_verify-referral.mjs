import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const browser = await chromium.launch();

{
  const page = await (await browser.newContext()).newPage();
  const r = await page.goto(`${BASE}/join/isadora`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const b = await page.content();
  console.log("/join/isadora:", r.status(), "| creator:", b.includes("Isadora"), "| Join as a fan:", b.includes("Join as a fan"));
}

{
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${BASE}/join/does-not-exist`, { waitUntil: "domcontentloaded" });
  console.log("/join/does-not-exist -> invitation-only:", (await page.content()).includes("Joining is by"));
}

{
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${BASE}/signup`, { waitUntil: "domcontentloaded" });
  console.log("/signup (no referral) refused:", (await page.content()).includes("invitation from a"));
}

{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/signup?creator=isadora`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Alias").fill("Flow Fan");
  await page.getByLabel("Email").fill("flow.fan@example.test");
  await page.getByLabel("Password").fill("a-long-enough-password");
  await page.getByRole("checkbox").nth(0).check();
  await page.getByRole("checkbox").nth(1).check();
  await page.getByRole("button", { name: "Create my account" }).click();
  await page.waitForURL(/\/c\/isadora/, { timeout: 30000 });
  console.log("after signup ->", new URL(page.url()).pathname, "| profile:", (await page.content()).includes("Isadora"));
  const s = await page.goto(`${BASE}/studio`, { waitUntil: "domcontentloaded" });
  console.log("new fan -> /studio:", s.status());
  await ctx.close();
}

await browser.close();
