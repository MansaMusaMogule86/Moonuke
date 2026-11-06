import { describe, expect, it } from "vitest";
import { clientIp } from "@/server/net/ip";
import { buildCsp, securityHeaders } from "@/server/net/csp";
import { productionProblems } from "@/server/env";

const H = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });

describe("clientIp", () => {
  it("trusts nothing in 'none' mode, even a forged header", () => {
    expect(clientIp(H({ "x-forwarded-for": "1.2.3.4" }), "none")).toBeNull();
  });
  it("hops:N reads the Nth entry from the right and ignores spoofed left-hand entries", () => {
    const h = H({ "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.0.0.1" });
    expect(clientIp(h, "hops:1")).toBe("10.0.0.1");
    expect(clientIp(h, "hops:2")).toBe("203.0.113.9");
    expect(clientIp(H({ "x-forwarded-for": "203.0.113.9" }), "hops:2")).toBeNull();
  });
  it("cloudflare uses cf-connecting-ip only", () => {
    expect(clientIp(H({ "cf-connecting-ip": "2001:db8::1", "x-forwarded-for": "6.6.6.6" }), "cloudflare")).toBe("2001:db8::1");
    expect(clientIp(H({ "x-forwarded-for": "6.6.6.6" }), "cloudflare")).toBeNull();
  });
  it("vercel prefers x-real-ip", () => {
    expect(clientIp(H({ "x-real-ip": "198.51.100.7", "x-forwarded-for": "6.6.6.6" }), "vercel")).toBe("198.51.100.7");
  });
  it("rejects malformed values", () => {
    expect(clientIp(H({ "cf-connecting-ip": "not-an-ip<script>" }), "cloudflare")).toBeNull();
    expect(clientIp(H({ "x-forwarded-for": "999.1.1.1" }), "hops:1")).toBeNull();
  });
});

describe("CSP & headers", () => {
  it("uses a nonce + strict-dynamic, no unsafe-inline scripts, no framing", () => {
    const csp = buildCsp("abc123");
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(buildCsp("x", { dev: true })).toContain("'unsafe-eval'");
    expect(buildCsp("x", { https: true })).toContain("upgrade-insecure-requests");
  });
  it("adds HSTS only over https", () => {
    expect(securityHeaders().some((h) => h.key === "Strict-Transport-Security")).toBe(false);
    expect(securityHeaders({ https: true }).some((h) => h.key === "Strict-Transport-Security")).toBe(true);
  });
});

describe("production env validation", () => {
  const base = { NODE_ENV: "production" as const, DATABASE_URL: "postgres://x", APP_URL: "https://club.example", TRUSTED_PROXY: "vercel", EMAIL_TRANSPORT: "smtp" as const, SMTP_URL: "smtp://x", EMAIL_FROM: "a@b.c", AI_PROVIDER: "template" as const, AI_MODEL: "claude-opus-5-5", FEATURE_PAYMENTS: "off" as const, FEATURE_UPLOADS: "off" as const, AUTH_PROVIDER: "own" as const, STORAGE_PROVIDER: "none" as const, SCAN_PROVIDER: "none" as const, FEATURE_AGE_ASSURANCE: "off" as const, AGE_PROVIDER: "none" as const, FEATURE_GEO_RESTRICTIONS: "off" as const, FEATURE_MODERATORS: "off" as const };
  it("rejects missing secret, http URL, dev email and smtp without settings", () => {
    const old = process.env.TRUSTED_PROXY;
    process.env.TRUSTED_PROXY = "vercel";
    expect(productionProblems({ ...base, APP_SECRET: "x".repeat(40) })).toEqual([]);
    expect(productionProblems({ ...base })).toContainEqual(expect.stringContaining("APP_SECRET"));
    expect(productionProblems({ ...base, APP_SECRET: "x".repeat(40), APP_URL: "http://club.example" })).toContainEqual(expect.stringContaining("https"));
    expect(productionProblems({ ...base, APP_SECRET: "x".repeat(40), EMAIL_TRANSPORT: "dev" })).toContainEqual(expect.stringContaining("EMAIL_TRANSPORT=dev"));
    expect(productionProblems({ ...base, APP_SECRET: "x".repeat(40), SMTP_URL: undefined })).toContainEqual(expect.stringContaining("SMTP_URL"));
    delete process.env.TRUSTED_PROXY;
    expect(productionProblems({ ...base, APP_SECRET: "x".repeat(40) })).toContainEqual(expect.stringContaining("TRUSTED_PROXY"));
    if (old) process.env.TRUSTED_PROXY = old;
  });
});
