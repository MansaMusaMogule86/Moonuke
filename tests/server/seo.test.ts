import { afterEach, describe, expect, it, vi } from "vitest";
import { _resetEnvCache } from "@/server/env";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

const setEnv = (vars: Record<string, string | undefined>) => {
  vi.stubEnv("DATABASE_URL", "postgres://x");
  vi.stubEnv("APP_SECRET", "x".repeat(40));
  vi.stubEnv("TRUSTED_PROXY", "vercel");
  vi.stubEnv("EMAIL_TRANSPORT", "disabled");
  for (const k of ["VERCEL", "VERCEL_ENV", "VERCEL_PROJECT_PRODUCTION_URL", "ALLOW_LOCAL_PRODUCTION"]) vi.stubEnv(k, undefined);
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
  _resetEnvCache();
};

afterEach(() => {
  vi.unstubAllEnvs();
  _resetEnvCache();
});

describe("robots.txt and sitemap", () => {
  it("live Vercel production: crawlable except API and token links; URLs use the public domain, not APP_URL", () => {
    setEnv({ NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "production", APP_URL: "https://club.example" });
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/invite/", "/reset/"] },
      sitemap: "https://www.divafans.io/sitemap.xml",
    });
    expect(sitemap()).toEqual([{ url: "https://www.divafans.io/" }]);
  });

  it("Vercel preview: blocks everything and lists nothing, even with an https URL", () => {
    setEnv({ NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "preview", APP_URL: "https://club.example" });
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    expect(sitemap()).toEqual([]);
  });

  it("local production build on http and dev: blocks everything", () => {
    setEnv({ NODE_ENV: "production", ALLOW_LOCAL_PRODUCTION: "true", APP_URL: "http://localhost:3000" });
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    setEnv({ NODE_ENV: "development", APP_URL: "https://club.example" });
    expect(sitemap()).toEqual([]);
  });

  it("rejects a verification value that isn't a bare token (no HTML injection into <head>)", () => {
    setEnv({ NODE_ENV: "development", GOOGLE_SITE_VERIFICATION: '"><script>alert(1)</script>' });
    return import("@/server/env").then(({ env }) => expect(() => env()).toThrow(/GOOGLE_SITE_VERIFICATION/));
  });
});
