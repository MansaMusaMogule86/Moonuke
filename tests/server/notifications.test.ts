import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { deliverNotification, myNotifications, unreadCount } from "@/server/services/notifications";
import { getUserPreferences, saveUserPreferences } from "@/server/services/fan";
import type { SeedResult } from "@/server/seed";
import { closePool, resetDb, system, viewer } from "./helpers";

let s: SeedResult;
beforeEach(async () => {
  s = await resetDb();
});
afterAll(closePool);

describe("notification centre", () => {
  it("filters by kind and pages history", async () => {
    const velvet = await viewer(s.member2Id);
    await deliverNotification({ userId: velvet.id, kind: "system", data: { title: "Welcome note" }, idempotencyKey: "n-filter-1" });
    await deliverNotification({ userId: velvet.id, kind: "payout.available", idempotencyKey: "n-filter-2" });
    await deliverNotification({ userId: velvet.id, kind: "system", data: { title: "House update" }, idempotencyKey: "n-filter-3" });
    expect(await unreadCount(velvet)).toBe(3);
    const payouts = await myNotifications(velvet, { kind: "payout.available" });
    expect(payouts).toHaveLength(1);
    expect(payouts[0].href).toBe("/studio/earnings");
    const first = await myNotifications(velvet, { limit: 2, offset: 0 });
    const rest = await myNotifications(velvet, { limit: 2, offset: 2 });
    expect(first).toHaveLength(2);
    expect(rest).toHaveLength(1);
    expect(rest[0].id).not.toBe(first[0].id);
  });

  it("respects preferences but always delivers security", async () => {
    const velvet = await viewer(s.member2Id);
    expect((await getUserPreferences(velvet)).notifyBilling).toBe(true);
    await saveUserPreferences(velvet, { ...(await getUserPreferences(velvet)), notifyBilling: false });
    expect(await deliverNotification({ userId: velvet.id, kind: "payment.succeeded", idempotencyKey: "n-pref-1" })).toBeNull();
    const sec = await deliverNotification({ userId: velvet.id, kind: "security.alert", data: { title: "New sign-in" }, idempotencyKey: "n-pref-2" });
    expect(sec?.id).toBeTruthy();
    expect(await myNotifications(velvet)).toHaveLength(1);
  });

  it("dedupes by idempotency key and never states amounts", async () => {
    const velvet = await viewer(s.member2Id);
    const a = await deliverNotification({ userId: velvet.id, kind: "tip.received", creatorId: s.creatorIds.isadora, idempotencyKey: "n-dedupe-1" });
    const b = await deliverNotification({ userId: velvet.id, kind: "tip.received", creatorId: s.creatorIds.isadora, idempotencyKey: "n-dedupe-1" });
    expect(a?.id).toBe(b?.id);
    const count = await system((q) =>
      q.one<{ n: number }>(`select count(*)::int as n from app.notifications where user_id = $1 and kind = 'tip.received'`, [velvet.id]),
    );
    expect(count?.n).toBe(1);
    await deliverNotification({ userId: velvet.id, kind: "payout.paid", idempotencyKey: "n-dedupe-2" });
    for (const n of await myNotifications(velvet)) {
      expect(`${n.title} ${n.detail ?? ""}`).not.toMatch(/\$\d|\d+\.\d{2}/);
      expect(n.href == null || n.href.startsWith("/")).toBe(true);
    }
  });
});
