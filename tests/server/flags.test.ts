import { describe, expect, it } from "vitest";
import { productionProblems } from "@/server/env";

describe("feature flags are refused in production until approved", () => {
  const base = { NODE_ENV: "production" as const, DATABASE_URL: "postgres://x", APP_SECRET: "x".repeat(40), APP_URL: "https://club.example", TRUSTED_PROXY: "vercel", EMAIL_TRANSPORT: "disabled" as const, AI_PROVIDER: "template" as const, AI_MODEL: "claude-opus-5-5", FEATURE_PAYMENTS: "off" as const, FEATURE_UPLOADS: "off" as const, AUTH_PROVIDER: "own" as const, STORAGE_PROVIDER: "none" as const, SCAN_PROVIDER: "none" as const, FEATURE_AGE_ASSURANCE: "off" as const, AGE_PROVIDER: "none" as const, FEATURE_GEO_RESTRICTIONS: "off" as const };
  process.env.TRUSTED_PROXY ??= "vercel";
  it("defaults are safe", () => {
    expect(productionProblems(base).filter((p) => /FEATURE|Mock|AUTH_PROVIDER/.test(p))).toEqual([]);
  });
  it.each([
    [{ FEATURE_PAYMENTS: "on" as const }, /FEATURE_PAYMENTS/],
    [{ FEATURE_UPLOADS: "on" as const }, /FEATURE_UPLOADS/],
    [{ STORAGE_PROVIDER: "mock" as const }, /Mock/],
    [{ SCAN_PROVIDER: "mock" as const }, /Mock/],
    [{ AUTH_PROVIDER: "supabase" as const }, /AUTH_PROVIDER=supabase/],
    [{ FEATURE_AGE_ASSURANCE: "on" as const }, /FEATURE_AGE_ASSURANCE/],
    [{ AGE_PROVIDER: "mock" as const }, /Mock age/],
    [{ FEATURE_GEO_RESTRICTIONS: "on" as const }, /FEATURE_GEO_RESTRICTIONS/],
  ])("%o is refused", (over, re) => {
    expect(productionProblems({ ...base, ...over }).some((p) => re.test(p))).toBe(true);
  });
});
