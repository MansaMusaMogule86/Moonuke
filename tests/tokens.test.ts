import fs from "node:fs";
import path from "node:path";
import { color, contrastRatio } from "@/lib/tokens";

const css = fs.readFileSync(path.resolve(__dirname, "../src/styles/tokens.css"), "utf8");

describe("design tokens", () => {
  it("CSS and JS token sources agree", () => {
    const pairs: [string, string][] = [
      ["--mk-ink", color.ink], ["--mk-ink-2", color.ink2], ["--mk-ink-3", color.ink3],
      ["--mk-gold", color.gold], ["--mk-gold-soft", color.goldSoft], ["--mk-gold-muted", color.goldMuted],
      ["--mk-ivory", color.ivory], ["--mk-stone", color.stone], ["--mk-ash", color.ash],
    ];
    for (const [token, hex] of pairs) {
      expect(css).toMatch(new RegExp(`${token}:\\s*${hex}\\b`, "i"));
    }
  });

  it("matches the official palette", () => {
    expect(color.ink).toBe("#050505");
    expect(color.ink2).toBe("#101010");
    expect(color.ink3).toBe("#171717");
    expect(color.gold).toBe("#d6b56d");
    expect(color.goldSoft).toBe("#e8cc91");
    expect(color.goldMuted).toBe("#a88b45");
    expect(color.ivory).toBe("#f6f0e6");
    expect(color.stone).toBe("#aaa39a");
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
  ])("%s", (_n, fg, bg, min) => {
    expect(contrastRatio(fg as string, bg as string)).toBeGreaterThanOrEqual(min as number);
  });
});
