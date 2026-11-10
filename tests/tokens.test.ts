import fs from "node:fs";
import path from "node:path";
import { color, contrastRatio } from "@/lib/tokens";

const css = fs.readFileSync(path.resolve(__dirname, "../src/styles/tokens.css"), "utf8");

describe("design tokens", () => {
  it("CSS and JS token sources agree", () => {
    const pairs: [string, string][] = [
      ["--mk-ink", color.ink], ["--mk-ink-2", color.ink2], ["--mk-ink-3", color.ink3],
      ["--mk-gold", color.gold], ["--mk-gold-soft", color.goldSoft], ["--mk-gold-muted", color.goldMuted],
      ["--mk-pink", color.pink], ["--mk-pink-soft", color.pinkSoft], ["--mk-ink-4", color.ink4],
      ["--mk-ivory", color.ivory], ["--mk-stone", color.stone], ["--mk-ash", color.ash],
    ];
    for (const [token, hex] of pairs) {
      expect(css).toMatch(new RegExp(`${token}:\\s*${hex}\\b`, "i"));
    }
  });

  it("matches the Diva Fans palette", () => {
    expect(color.ink).toBe("#050505");
    expect(color.ink2).toBe("#121217");
    expect(color.ink3).toBe("#1a1921");
    expect(color.gold).toBe("#d4af37");
    expect(color.goldSoft).toBe("#f5d58a");
    expect(color.goldMuted).toBe("#a88b45");
    expect(color.pink).toBe("#ff2d96");
    expect(color.ivory).toBe("#f8f5f0");
    expect(color.stone).toBe("#b9b4c0");
  });

  it.each([
    ["ivory on ink", color.ivory, color.ink, 7],
    ["stone on ink", color.stone, color.ink, 7],
    ["stone on ink-3", color.stone, color.ink3, 4.5],
    ["ash on ink", color.ash, color.ink, 4.5],
    ["ash on ink-2", color.ash, color.ink2, 4.5],
    ["gold on ink", color.gold, color.ink, 7],
    ["ink on gold (button label)", color.ink, color.gold, 7],
    ["ink on gold-soft (hover label)", color.ink, color.goldSoft, 7],
    ["ash on ink-3", color.ash, color.ink3, 4.5],
    ["ash on ink-4", color.ash, color.ink4, 4.5],
    ["pink on ink", color.pink, color.ink, 4.5],
    ["pink-soft on ink-3", color.pinkSoft, color.ink3, 4.5],
    ["ink on pink (button label)", color.ink, color.pink, 4.5],
  ])("%s", (_n, fg, bg, min) => {
    expect(contrastRatio(fg as string, bg as string)).toBeGreaterThanOrEqual(min as number);
  });
});
