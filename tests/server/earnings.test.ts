import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { applyEvent, attachProviderRef, createPayment } from "@/server/payments/engine";
import { myEarnings } from "@/server/services/earnings";
import type { VerifiedEvent } from "@/server/payments/webhook";
import type { SeedResult } from "@/server/seed";
import { asViewer, closePool, resetDb, system, viewer } from "./helpers";

let s: SeedResult;
beforeEach(async () => {
  s = await resetDb();
});
afterAll(closePool);

const T = { testing: true, feeBps: 2000 }; // TEST fee only; the real fee is undecided.
const ev = (ref: string): VerifiedEvent => ({ eventId: `${ref}:ok`, type: "payment.succeeded", providerRef: ref, amountCents: 1200, currency: "USD" });

async function paidPpv(creatorId: string, fanId: string, ref: string, key: string) {
  const post = await system((q) => q.one<{ id: string }>(`select id from app.posts where creator_id = $1 limit 1`, [creatorId]));
  const p = await createPayment({ kind: "ppv", fanId, creatorId, targetId: post?.id ?? null, amountCents: 1200, currency: "USD", provider: "mock", idempotencyKey: key }, T);
  await attachProviderRef(p.id, ref, T);
  await applyEvent("mock", ev(ref), "{}", T);
}

describe("creator earnings read layer", () => {
  it("a creator sees only their own payments, with balances from the ledger", async () => {
    await paidPpv(s.creatorIds.isadora, s.member2Id, "mock_isa_1", "test:earn:isa:1");
    await paidPpv(s.creatorIds.zara, s.member2Id, "mock_zara_1", "test:earn:zara:1");

    const isa = await myEarnings(await viewer(s.creatorIds.isadora));
    expect(isa.payments).toHaveLength(1);
    expect(isa.payments[0].kind).toBe("ppv");
    expect(isa.payments[0].amountCents).toBe(1200);
    // 1200 gross − 20% TEST fee = 960 net, all available (no dispute).
    expect(isa.balances.find((b) => b.currency === "USD")?.available).toBe(960);

    // A different creator never sees isadora's rows.
    const zara = await myEarnings(await viewer(s.creatorIds.zara));
    expect(zara.payments).toHaveLength(1);
    expect(zara.payments[0].amountCents).toBe(1200);
  });

  it("payouts are creator-scoped", async () => {
    await system((q) => q.query(`insert into app.payouts (creator_id, amount_cents, currency) values ($1, 500, 'USD')`, [s.creatorIds.isadora]));
    const isa = await myEarnings(await viewer(s.creatorIds.isadora));
    expect(isa.payouts).toHaveLength(1);
    expect(isa.payouts[0]).toMatchObject({ amountCents: 500, currency: "USD", status: "requested" });
    const zara = await myEarnings(await viewer(s.creatorIds.zara));
    expect(zara.payouts).toHaveLength(0);
  });

  it("the service refuses a member, and the database readers return nothing to a member", async () => {
    await paidPpv(s.creatorIds.isadora, s.member2Id, "mock_isa_2", "test:earn:isa:2");

    // App layer: a member is not a creator.
    await expect(myEarnings(await viewer(s.member2Id))).rejects.toMatchObject({ code: "forbidden" });

    // Database layer: the SECURITY DEFINER readers expose nothing to a member.
    expect(await asViewer(s.member2Id, (q) => q.query(`select * from app.my_payments()`))).toHaveLength(0);
    expect(await asViewer(s.member2Id, (q) => q.query(`select * from app.my_payouts()`))).toHaveLength(0);
    // Anonymous callers get nothing either.
    expect(await asViewer(null, (q) => q.query(`select * from app.my_payments()`))).toHaveLength(0);
  });
});
