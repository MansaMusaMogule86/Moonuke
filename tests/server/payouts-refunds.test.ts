import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { applyEvent, attachProviderRef, createPayment, payoutEligibility } from "@/server/payments/engine";
import { PAYMENT_POLICY, PROPOSED_PAYOUT_HOLD_DAYS } from "@/server/payments/policy";
import { featureEnabled } from "@/server/flags";
import type { VerifiedEvent } from "@/server/payments/webhook";
import type { SeedResult } from "@/server/seed";
import { closePool, resetDb, system } from "./helpers";

let s: SeedResult;
beforeEach(async () => {
  s = await resetDb();
});
afterAll(closePool);

const T = { testing: true, feeBps: 2000 }; // TEST fee only; the real fee is undecided.
const ev = (eventId: string, type: VerifiedEvent["type"], ref: string, amountCents = 1200): VerifiedEvent => ({ eventId, type, providerRef: ref, amountCents, currency: "USD" });
const purchased = async (postId: string) => (await system((q) => q.query(`select 1 from app.purchases where fan_id = $1 and post_id = $2`, [s.member2Id, postId]))).length === 1;

async function paidPpv(ref = "mock_ref_1", key = "test:ppv:velvet:1") {
  const post = await system((q) => q.one<{ id: string }>(`select id from app.posts where creator_id = $1 and access = 'ppv' limit 1`, [s.creatorIds.isadora]));
  const p = await createPayment({ kind: "ppv", fanId: s.member2Id, creatorId: s.creatorIds.isadora, targetId: post!.id, amountCents: 1200, currency: "USD", provider: "mock", idempotencyKey: key }, T);
  await attachProviderRef(p.id, ref, T);
  await applyEvent("mock", ev(`${ref}:ok`, "payment.succeeded", ref), "{}", T);
  return post!.id;
}
const verify = () => system((q) => q.query(`update app.creator_verifications set status = 'verified' where user_id = $1`, [s.creatorIds.isadora]));
const later = (days: number) => new Date(Date.now() + days * 86_400_000);

describe("as shipped", () => {
  it("payments stay disabled, PAY2 holds (no revocation), and the proposed 14-day hold is not applied by default", () => {
    expect(featureEnabled("payments")).toBe(false);
    expect(PAYMENT_POLICY.refundRevokesAccess).toBe(false);
    expect(PROPOSED_PAYOUT_HOLD_DAYS).toBe(14);
  });
});

describe("payout hold", () => {
  it("an undecided hold means not eligible; funds inside the hold aren't payable", async () => {
    await paidPpv();
    await verify();
    const id = s.creatorIds.isadora;
    expect((await payoutEligibility(id, { minimumCents: 500, holdDays: null })).reasons).toContain("hold period not decided");
    const fresh = await payoutEligibility(id, { minimumCents: 500, holdDays: 14 });
    expect(fresh).toMatchObject({ eligible: false, available: 960, matured: 0, holding: 960, reasons: ["funds still in hold period"] });
    expect((await payoutEligibility(id, { minimumCents: 500, holdDays: 14, asOf: later(13) })).eligible).toBe(false);
    expect(await payoutEligibility(id, { minimumCents: 500, holdDays: 14, asOf: later(15) })).toMatchObject({ eligible: true, matured: 960, holding: 0 });
    expect((await payoutEligibility(id, { minimumCents: 5000, holdDays: 14, asOf: later(15) })).reasons).toEqual(["below minimum"]);
    await expect(payoutEligibility(id, { minimumCents: 500, holdDays: -1 })).rejects.toMatchObject({ code: "validation" });
  });

  it("a recent refund reduces matured funds at once (debits are never deferred)", async () => {
    await paidPpv();
    await verify();
    await applyEvent("mock", ev("r1", "payment.refunded", "mock_ref_1"), "{}", T);
    // Even judged 20 days later, when the original credit has matured, the refund cancels it.
    const e = await payoutEligibility(s.creatorIds.isadora, { minimumCents: 100, holdDays: 14, asOf: later(20) });
    expect(e).toMatchObject({ eligible: false, available: 0, matured: 0 });
  });
});

describe("refunds and access", () => {
  it("default (PAY2): the purchase stays after a refund or chargeback", async () => {
    const post = await paidPpv();
    await applyEvent("mock", ev("r1", "payment.refunded", "mock_ref_1"), "{}", T);
    expect(await purchased(post)).toBe(true);
  });

  it("with the policy switched (tests only): a refund revokes access, audited", async () => {
    const post = await paidPpv();
    await applyEvent("mock", ev("r1", "payment.refunded", "mock_ref_1"), "{}", { ...T, refundRevokesAccess: true });
    expect(await purchased(post)).toBe(false);
    expect((await system((q) => q.query(`select 1 from app.audit_log where action = 'purchase.revoked'`))).length).toBe(1);
  });

  it("with the policy switched: a chargeback revokes, but not while another successful payment covers the post", async () => {
    const post = await paidPpv();
    await paidPpv("mock_ref_2", "test:ppv:velvet:2");
    const O = { ...T, refundRevokesAccess: true };
    await applyEvent("mock", ev("d1", "dispute.opened", "mock_ref_1"), "{}", O);
    await applyEvent("mock", ev("d2", "dispute.lost", "mock_ref_1"), "{}", O);
    expect(await purchased(post)).toBe(true);
    await applyEvent("mock", ev("r2", "payment.refunded", "mock_ref_2"), "{}", O);
    expect(await purchased(post)).toBe(false);
  });

  it("without an override, the shipped policy (PAY2) applies", async () => {
    const post = await paidPpv();
    await applyEvent("mock", ev("r1", "payment.refunded", "mock_ref_1"), "{}", { feeBps: 2000, testing: true });
    expect(await purchased(post)).toBe(true);
  });
});
