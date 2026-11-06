import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { applyEvent, attachProviderRef, createPayment, creatorBalance, payoutEligibility, reconcile } from "@/server/payments/engine";
import { postingsFor, splitFee } from "@/server/payments/ledger";
import { transition } from "@/server/payments/state";
import { signHmac, verifyHmac, type VerifiedEvent } from "@/server/payments/webhook";
import type { SeedResult } from "@/server/seed";
import { asViewer, closePool, resetDb, rlsError, system } from "./helpers";

let s: SeedResult;
beforeEach(async () => {
  s = await resetDb();
});
afterAll(closePool);

const T = { testing: true, feeBps: 2000 }; // 20% is a TEST value only; the real fee is undecided.
const ev = (eventId: string, type: VerifiedEvent["type"], ref: string, amountCents = 1200): VerifiedEvent => ({ eventId, type, providerRef: ref, amountCents, currency: "USD" });

describe("pure payment logic", () => {
  it("state machine allows only legal transitions", () => {
    expect(transition("created", "succeeded")).toBe("succeeded");
    expect(transition("succeeded", "refunded")).toBe("refunded");
    expect(transition("refunded", "succeeded")).toBeNull();
    expect(transition("failed", "succeeded")).toBeNull();
    expect(transition("disputed", "dispute_lost")).toBe("charged_back");
  });
  it("fee split rounds in the creator's favour and every posting balances", () => {
    expect(splitFee(999, 2000)).toEqual({ fee: 199, net: 800 });
    for (const e of ["succeeded", "refunded", "dispute_opened", "dispute_won", "dispute_lost"] as const) {
      expect(postingsFor(e, "00000000-0000-0000-0000-000000000001", 1234, 1500).reduce((n, p) => n + p.amountCents, 0)).toBe(0);
    }
    expect(() => splitFee(100, 10001)).toThrow();
  });
  it("webhook HMAC: valid, tampered, replayed, missing", () => {
    const now = 1_800_000_000;
    const h = signHmac("whsec_test", '{"a":1}', now);
    expect(verifyHmac("whsec_test", '{"a":1}', h, 300, now)).toBe(true);
    expect(verifyHmac("whsec_test", '{"a":2}', h, 300, now)).toBe(false);
    expect(verifyHmac("other", '{"a":1}', h, 300, now)).toBe(false);
    expect(verifyHmac("whsec_test", '{"a":1}', h, 300, now + 301)).toBe(false);
    expect(verifyHmac("whsec_test", '{"a":1}', null, 300, now)).toBe(false);
  });
});

describe("payment engine (mock provider, test DB)", () => {
  async function ppv() {
    const post = await system((q) => q.one<{ id: string }>(`select id from app.posts where creator_id = $1 and access = 'ppv' limit 1`, [s.creatorIds.isadora]));
    const p = await createPayment({ kind: "ppv", fanId: s.member2Id, creatorId: s.creatorIds.isadora, targetId: post!.id, amountCents: 1200, currency: "USD", provider: "mock", idempotencyKey: "test:ppv:velvet:1" }, T);
    await attachProviderRef(p.id, "mock_ref_1", T);
    return { p, postId: post!.id };
  }

  it("is OFF by default: public entry points refuse without the flag", async () => {
    await expect(createPayment({ kind: "tip", fanId: s.memberId, creatorId: s.creatorIds.isadora, targetId: null, amountCents: 500, currency: "USD", provider: "mock", idempotencyKey: "test:tip:x" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(applyEvent("mock", ev("e0", "payment.succeeded", "r"), "{}")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("idempotent creation; success grants the purchase and posts a balanced ledger", async () => {
    const { p, postId } = await ppv();
    const again = await createPayment({ kind: "ppv", fanId: s.member2Id, creatorId: s.creatorIds.isadora, targetId: postId, amountCents: 1200, currency: "USD", provider: "mock", idempotencyKey: "test:ppv:velvet:1" }, T);
    expect(again).toMatchObject({ id: p.id, created: false });
    await expect(createPayment({ kind: "ppv", fanId: s.member2Id, creatorId: s.creatorIds.isadora, targetId: postId, amountCents: 9999, currency: "USD", provider: "mock", idempotencyKey: "test:ppv:velvet:1" }, T)).rejects.toMatchObject({ code: "conflict" });
    expect(await applyEvent("mock", ev("e1", "payment.succeeded", "mock_ref_1"), "{1}", T)).toBe("applied");
    expect(await applyEvent("mock", ev("e1", "payment.succeeded", "mock_ref_1"), "{1}", T)).toBe("duplicate");
    expect(await system((q) => q.query(`select 1 from app.purchases where fan_id = $1 and post_id = $2`, [s.member2Id, postId]))).toHaveLength(1);
    expect(await creatorBalance(s.creatorIds.isadora)).toEqual({ available: 960, onHold: 0 });
    const sum = await system((q) => q.one<{ n: string }>(`select coalesce(sum(amount_cents), 0) as n from app.ledger_entries`));
    expect(Number(sum!.n)).toBe(0);
  });

  it("rejects mismatched amounts, ignores illegal transitions, handles refund and dispute flows", async () => {
    await ppv();
    expect(await applyEvent("mock", ev("e2", "payment.succeeded", "mock_ref_1", 1), "{}", T)).toBe("rejected");
    expect(await applyEvent("mock", ev("e3", "payment.refunded", "mock_ref_1"), "{}", T)).toBe("ignored"); // not yet succeeded
    expect(await applyEvent("mock", ev("e4", "payment.succeeded", "unknown_ref"), "{}", T)).toBe("rejected");
    await applyEvent("mock", ev("e5", "payment.succeeded", "mock_ref_1"), "{}", T);
    await applyEvent("mock", ev("e6", "dispute.opened", "mock_ref_1"), "{}", T);
    expect(await creatorBalance(s.creatorIds.isadora)).toEqual({ available: 0, onHold: 960 });
    expect((await payoutEligibility(s.creatorIds.isadora, { minimumCents: 100, holdDays: 0 })).reasons).toContain("open dispute");
    await applyEvent("mock", ev("e7", "dispute.lost", "mock_ref_1"), "{}", T);
    expect(await creatorBalance(s.creatorIds.isadora)).toEqual({ available: 0, onHold: 0 });
    const st = await system((q) => q.one<{ status: string }>(`select status from app.payments where provider_ref = 'mock_ref_1'`));
    expect(st!.status).toBe("charged_back");
  });

  it("payout eligibility needs a decided minimum; reconciliation finds drift", async () => {
    await ppv();
    await applyEvent("mock", ev("e8", "payment.succeeded", "mock_ref_1"), "{}", T);
    const undecided = await payoutEligibility(s.creatorIds.isadora, { minimumCents: null, holdDays: 0 });
    expect(undecided).toMatchObject({ eligible: false, reasons: ["payout minimum not decided"] });
    expect((await payoutEligibility(s.creatorIds.isadora, { minimumCents: 500, holdDays: null })).reasons).toContain("hold period not decided");
    expect((await payoutEligibility(s.creatorIds.isadora, { minimumCents: 500, holdDays: 0 })).eligible).toBe(true);
    const drift = await reconcile("mock", [{ providerRef: "mock_ref_1", status: "refunded", amountCents: 1200 }, { providerRef: "ghost", status: "succeeded", amountCents: 5 }]);
    expect(drift.map((d) => d.providerRef).sort()).toEqual(["ghost", "mock_ref_1"]);
  });

  it("ledger is append-only and must balance; viewers can't read or write payment tables", async () => {
    await ppv();
    await applyEvent("mock", ev("e9", "payment.succeeded", "mock_ref_1"), "{}", T);
    await expect(system((q) => q.query(`update app.ledger_entries set amount_cents = 1`))).rejects.toMatchObject({ code: "42501" });
    await expect(system((q) => q.query(`insert into app.ledger_entries (txn_id, account, amount_cents, currency, memo) values (gen_random_uuid(), 'platform_fees', 5, 'USD', 'unbalanced')`))).rejects.toMatchObject({ code: "23514" });
    for (const t of ["payments", "ledger_entries", "payment_events", "payouts"]) {
      expect(await rlsError(s.creatorIds.isadora, `select * from app.${t}`, [], 1)).toBe("42501");
      expect(await rlsError(s.ownerId, `select * from app.${t}`, [], 2)).toBe("42501");
    }
    const mine = await asViewer({ id: s.creatorIds.isadora, aal: 1 }, (q) => q.query<{ available: string }>(`select * from app.my_balances()`));
    expect(Number(mine[0].available)).toBe(960);
    expect(await asViewer({ id: s.creatorIds.zara, aal: 1 }, (q) => q.query(`select * from app.my_balances()`))).toEqual([]);
  });
});
