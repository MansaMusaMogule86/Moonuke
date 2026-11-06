import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { countryFrom, evaluateAccess, type AccessFlags } from "@/server/compliance/access";
import { mockAgeProvider, signMockResult } from "@/server/compliance/ageProvider";
import { featureEnabled } from "@/server/flags";
import { completeAgeCheck, listRules, myAgeStatus, removeRule, setAgeScope, setRule, startAgeCheck } from "@/server/services/access";
import type { SeedResult } from "@/server/seed";
import { asViewer, closePool, resetDb, rlsError, system, viewer } from "./helpers";

let s: SeedResult;
beforeEach(async () => {
  s = await resetDb();
});
afterAll(closePool);

const ON: AccessFlags = { geo: true, age: true };
const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
const pass = async (userId: string, result: "passed" | "failed" = "passed") => {
  const p = mockAgeProvider();
  const { checkId } = await startAgeCheck(await viewer(userId), p, { testing: true });
  const signed = signMockResult({ checkId, providerRef: `ref-${checkId}`, result, method: "mock", assurance: "high" });
  return { p, checkId, signed, result: await completeAgeCheck(p, signed.body, signed.signature, { testing: true }) };
};

describe("off by default", () => {
  it("flags are off, and the gate allows everyone without any lookup, even with rules in place", async () => {
    expect(featureEnabled("age_assurance")).toBe(false);
    expect(featureEnabled("geo_restrictions")).toBe(false);
    await setRule(await viewer(s.ownerId), "GB", "block");
    expect(await evaluateAccess(await viewer(s.memberId), "GB")).toEqual({ allowed: true });
    await expect(startAgeCheck(await viewer(s.memberId), mockAgeProvider())).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("country detection", () => {
  it("reads only the trusted proxy's header and ignores unknown or malformed values", () => {
    expect(countryFrom(h({ "cf-ipcountry": "GB" }), "none")).toBeNull();
    expect(countryFrom(h({ "cf-ipcountry": "gb" }), "cloudflare")).toBe("GB");
    expect(countryFrom(h({ "cf-ipcountry": "XX" }), "cloudflare")).toBeNull();
    expect(countryFrom(h({ "cf-ipcountry": "T1" }), "cloudflare")).toBeNull();
    expect(countryFrom(h({ "x-vercel-ip-country": "DE", "cf-ipcountry": "GB" }), "vercel")).toBe("DE");
    expect(countryFrom(h({ "x-vercel-ip-country": "<script>" }), "vercel")).toBeNull();
  });
});

describe("regional rules (forced on in tests)", () => {
  it("blocks listed countries, treats unknown as XX, and never gates the owner", async () => {
    const owner = await viewer(s.ownerId);
    await setRule(owner, "GB", "block", "Example only");
    const m = await viewer(s.memberId);
    expect(await evaluateAccess(m, "GB", { testing: ON })).toEqual({ allowed: false, reason: "region_blocked" });
    expect(await evaluateAccess(m, "FR", { testing: ON })).toEqual({ allowed: true });
    expect(await evaluateAccess(m, null, { testing: ON })).toEqual({ allowed: true });
    await setRule(owner, "XX", "block");
    expect(await evaluateAccess(m, null, { testing: ON })).toEqual({ allowed: false, reason: "region_blocked" });
    expect(await evaluateAccess(owner, "GB", { testing: ON })).toEqual({ allowed: true });
    // Geo on, age off: an age rule does nothing.
    await setRule(owner, "FR", "age_assurance");
    expect(await evaluateAccess(m, "FR", { testing: { geo: true, age: false } })).toEqual({ allowed: true });
  });

  it("only the owner at AAL2 manages rules (app layer and RLS); every change is audited", async () => {
    await expect(setRule(await viewer(s.memberId), "GB", "block")).rejects.toMatchObject({ code: "forbidden" });
    await expect(listRules(await viewer(s.creatorIds.isadora))).rejects.toMatchObject({ code: "forbidden" });
    expect(await rlsError(s.memberId, `insert into app.jurisdiction_rules (country, rule, updated_by) values ('GB', 'block', $1)`, [s.memberId])).toBe("42501");
    expect(await rlsError(s.ownerId, `insert into app.jurisdiction_rules (country, rule, updated_by) values ('GB', 'block', $1)`, [s.ownerId], 1)).toBe("42501");
    expect(await rlsError(s.memberId, `select app.set_age_assurance_scope('everywhere')`)).toBe("42501");
    const owner = await viewer(s.ownerId);
    await setRule(owner, "gb", "age_assurance", "Online Safety Act");
    await expect(setRule(owner, "GBR", "block")).rejects.toMatchObject({ field: "country" });
    expect((await listRules(owner)).rules).toMatchObject([{ country: "GB", rule: "age_assurance" }]);
    await removeRule(owner, "GB");
    expect((await listRules(owner)).rules).toHaveLength(0);
    expect((await system((q) => q.one<{ n: number }>(`select count(*)::int as n from app.audit_log where action like 'access.rule_%'`)))!.n).toBe(2);
  });
});

describe("age assurance (forced on in tests, mock provider)", () => {
  it("requires a passed check where a rule (or 'everywhere') applies", async () => {
    const owner = await viewer(s.ownerId);
    await setRule(owner, "GB", "age_assurance");
    const m = await viewer(s.memberId);
    expect(await evaluateAccess(m, "GB", { testing: ON })).toEqual({ allowed: false, reason: "age_required" });
    expect(await evaluateAccess(m, "FR", { testing: ON })).toEqual({ allowed: true });
    await setAgeScope(owner, "everywhere");
    expect(await evaluateAccess(m, "FR", { testing: ON })).toEqual({ allowed: false, reason: "age_required" });
    expect(await evaluateAccess(null, "FR", { testing: ON })).toEqual({ allowed: false, reason: "age_required" });
    expect((await pass(s.memberId)).result).toBe("passed");
    expect(await evaluateAccess(m, "GB", { testing: ON })).toEqual({ allowed: true });
    expect(await myAgeStatus(m)).toEqual({ passed: true, lastStatus: "passed" });
    // Someone else's pass doesn't count for anyone else.
    expect(await evaluateAccess(await viewer(s.member2Id), "GB", { testing: ON })).toEqual({ allowed: false, reason: "age_required" });
  });

  it("a failed check doesn't grant access; only outcomes are stored", async () => {
    await setAgeScope(await viewer(s.ownerId), "everywhere");
    expect((await pass(s.memberId, "failed")).result).toBe("failed");
    expect(await evaluateAccess(await viewer(s.memberId), "GB", { testing: ON })).toEqual({ allowed: false, reason: "age_required" });
    const cols = await system((q) => q.query<{ c: string }>(`select column_name as c from information_schema.columns where table_schema = 'app' and table_name = 'age_checks'`));
    expect(cols.map((c) => c.c).filter((c) => /birth|dob|document|image|name/.test(c))).toEqual([]);
  });

  it("rejects forged, tampered or replayed results, and results for unknown checks", async () => {
    const p = mockAgeProvider();
    const { checkId } = await startAgeCheck(await viewer(s.memberId), p, { testing: true });
    const good = signMockResult({ checkId, providerRef: "ref-1", result: "passed", method: "mock", assurance: "high" });
    await expect(completeAgeCheck(p, good.body.replace("passed", "failed"), good.signature, { testing: true })).rejects.toMatchObject({ code: "validation" });
    await expect(completeAgeCheck(p, good.body, null, { testing: true })).rejects.toMatchObject({ code: "validation" });
    const old = signMockResult({ checkId, providerRef: "ref-1", result: "passed", method: "mock", assurance: "high" }, Math.floor(Date.now() / 1000) - 3600);
    await expect(completeAgeCheck(p, old.body, old.signature, { testing: true })).rejects.toMatchObject({ code: "validation" });
    const ghost = signMockResult({ checkId: "00000000-0000-0000-0000-000000000000", providerRef: "ref-x", result: "passed", method: "mock", assurance: "high" });
    await expect(completeAgeCheck(p, ghost.body, ghost.signature, { testing: true })).rejects.toMatchObject({ code: "not_found" });
    expect(await completeAgeCheck(p, good.body, good.signature, { testing: true })).toBe("passed");
    // The same delivery again is idempotent; a different result for a decided check is refused.
    expect(await completeAgeCheck(p, good.body, good.signature, { testing: true })).toBe("passed");
    const other = signMockResult({ checkId, providerRef: "ref-2", result: "failed", method: "mock", assurance: "high" });
    await expect(completeAgeCheck(p, other.body, other.signature, { testing: true })).rejects.toMatchObject({ code: "conflict" });
    // One provider result can't be reused for another person's check.
    const second = await startAgeCheck(await viewer(s.member2Id), p, { testing: true });
    const reuse = signMockResult({ checkId: second.checkId, providerRef: "ref-1", result: "passed", method: "mock", assurance: "high" });
    await expect(completeAgeCheck(p, reuse.body, reuse.signature, { testing: true })).rejects.toMatchObject({ code: "conflict" });
  });

  it("viewers can't write checks and see only their own", async () => {
    await pass(s.memberId);
    expect(await rlsError(s.member2Id, `insert into app.age_checks (user_id, provider, status, decided_at) values ($1, 'mock', 'passed', now())`, [s.member2Id])).toBe("42501");
    expect(await rlsError(s.memberId, `update app.age_checks set status = 'passed'`)).toBe("42501");
    expect(await asViewer(s.member2Id, (q) => q.query(`select * from app.age_checks`))).toHaveLength(0);
    expect(await asViewer(s.memberId, (q) => q.query(`select * from app.age_checks`))).toHaveLength(1);
  });
});
