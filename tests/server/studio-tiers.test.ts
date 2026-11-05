import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getProfile } from "@/server/services/club";
import { createTier, deleteTier, myTiers, normalizeTier, updateTier, type TierInput } from "@/server/services/studio";
import type { SeedResult } from "@/server/seed";
import { asViewer, closePool, resetDb, rlsError, system, viewer } from "./helpers";

let s: SeedResult;
beforeEach(async () => {
  s = await resetDb();
});
afterAll(closePool);

const base: TierInput = { kind: "member", name: "Atelier", priceCents: 1500, perks: ["Monthly letter", "Studio sessions"], seatLimit: null, active: true };

describe("tier validation", () => {
  it("enforces name, price, perks and seats", () => {
    expect(() => normalizeTier({ ...base, name: " " })).toThrow(/Name/);
    expect(() => normalizeTier({ ...base, name: "x".repeat(41) })).toThrow();
    expect(() => normalizeTier({ ...base, priceCents: 0 })).toThrow(/price/);
    expect(() => normalizeTier({ ...base, priceCents: 99 })).toThrow(/price/);
    expect(() => normalizeTier({ ...base, priceCents: 100_001 })).toThrow(/price/);
    expect(() => normalizeTier({ ...base, priceCents: 10.5 })).toThrow(/price/);
    expect(() => normalizeTier({ ...base, perks: Array.from({ length: 9 }, (_, i) => `p${i}`) })).toThrow(/perks/);
    expect(() => normalizeTier({ ...base, perks: ["x".repeat(81)] })).toThrow();
    expect(() => normalizeTier({ ...base, perks: ["Letter", "letter"] })).toThrow(/different/);
    expect(() => normalizeTier({ ...base, seatLimit: 0 })).toThrow(/Seats/);
    expect(() => normalizeTier({ ...base, kind: "admin" as never })).toThrow();
    expect(() => normalizeTier({ ...base, perks: ["schoolgirl looks"] })).toThrow(/can't be used/);
    expect(normalizeTier({ ...base, name: "  Inner   circle ", perks: [" a ", "", "b"] })).toMatchObject({ name: "Inner circle", perks: ["a", "b"] });
  });
});

describe("creator tiers (PostgreSQL)", () => {
  it("create, edit and turn off a tier; members see only active tiers at the new price", async () => {
    const isadora = await viewer(s.creatorIds.isadora);
    const member2 = await viewer(s.member2Id);
    const id = await createTier(isadora, base);
    await updateTier(isadora, id, { ...base, priceCents: 1800, perks: ["Monthly letter"] });
    let tiers = (await getProfile(member2, "isadora"))!.tiers;
    expect(tiers.find((t) => t.id === id)).toMatchObject({ name: "Atelier", price: { amountCents: 1800 }, perks: ["Monthly letter"] });
    await updateTier(isadora, id, { ...base, active: false });
    tiers = (await getProfile(member2, "isadora"))!.tiers;
    expect(tiers.find((t) => t.id === id)).toBeUndefined();
    expect((await myTiers(isadora)).find((t) => t.id === id)).toMatchObject({ active: false, hasSubscribers: false });
    await deleteTier(isadora, id);
    expect((await myTiers(isadora)).find((t) => t.id === id)).toBeUndefined();
  });

  it("a subscribed tier keeps its kind, can't be deleted, and seats can't drop below members", async () => {
    const isadora = await viewer(s.creatorIds.isadora);
    const vip = (await myTiers(isadora)).find((t) => t.kind === "vip")!;
    expect(vip.hasSubscribers).toBe(true);
    expect(vip.seatsTaken).toBeGreaterThanOrEqual(1);
    await expect(updateTier(isadora, vip.id, { kind: "member", name: vip.name, priceCents: vip.priceCents, perks: vip.perks, seatLimit: vip.seatLimit, active: true })).rejects.toMatchObject({ code: "conflict" });
    await expect(deleteTier(isadora, vip.id)).rejects.toMatchObject({ code: "conflict" });
    await system((q) => q.query(`insert into app.subscriptions (fan_id, creator_id, tier_id, current_period_end) values ($1, $2, $3, now() + interval '30 days')`, [s.member2Id, isadora.id, vip.id]));
    const taken = (await myTiers(isadora)).find((t) => t.id === vip.id)!.seatsTaken;
    expect(taken).toBeGreaterThanOrEqual(2);
    await expect(updateTier(isadora, vip.id, { kind: "vip", name: vip.name, priceCents: vip.priceCents, perks: vip.perks, seatLimit: taken - 1, active: true })).rejects.toMatchObject({ field: "seatLimit" });
    // Price and copy may change (payments are not active; nobody is charged).
    await updateTier(isadora, vip.id, { kind: "vip", name: "VIP Salon", priceCents: vip.priceCents + 500, perks: vip.perks, seatLimit: vip.seatLimit, active: true });
    // The subscriber keeps VIP access.
    const member = await viewer(s.memberId);
    expect((await getProfile(member, "isadora"))!.viewer.tier).toBe("vip");
  });

  it("duplicate names, the tier cap and the last active tier are guarded", async () => {
    const isadora = await viewer(s.creatorIds.isadora);
    await createTier(isadora, base);
    await expect(createTier(isadora, base)).rejects.toMatchObject({ code: "conflict", field: "name" });
    for (let i = (await myTiers(isadora)).length; i < 8; i++) await createTier(isadora, { ...base, name: `Tier ${i}` });
    await expect(createTier(isadora, { ...base, name: "One too many" })).rejects.toMatchObject({ code: "conflict" });

    const rhea = await viewer(s.creatorIds.rhea);
    const only = await createTier(rhea, base);
    await expect(updateTier(rhea, only, { ...base, active: false })).rejects.toMatchObject({ field: "active" });
    await expect(deleteTier(rhea, only)).rejects.toMatchObject({ code: "validation" });
  });

  it("app layer: members can't create tiers; creators can't touch another creator's tiers", async () => {
    const member = await viewer(s.memberId);
    const zara = await viewer(s.creatorIds.zara);
    const isadora = await viewer(s.creatorIds.isadora);
    await expect(createTier(member, base)).rejects.toMatchObject({ code: "forbidden" });
    const id = await createTier(isadora, base);
    await expect(updateTier(zara, id, { ...base, priceCents: 100 })).rejects.toMatchObject({ code: "not_found" });
    await expect(deleteTier(zara, id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("RLS: no inserting for others, no moving tiers, no owner edits, no deleting subscribed tiers", async () => {
    const isadora = s.creatorIds.isadora;
    const zara = s.creatorIds.zara;
    const ins = `insert into app.tiers (creator_id, kind, name, price_cents) values ($1, 'member', 'Forged', 100)`;
    expect(await rlsError(zara, ins, [isadora], 1)).toBe("42501");
    expect(await rlsError(s.memberId, ins, [s.memberId], 1)).toBe("42501");
    expect(await rlsError(s.ownerId, ins, [isadora], 2)).toBe("42501");

    const vip = (await myTiers(await viewer(isadora))).find((t) => t.kind === "vip")!;
    expect(await rlsError(isadora, `update app.tiers set kind = 'member' where id = $1`, [vip.id], 1)).toBe("42501");
    expect(await rlsError(isadora, `update app.tiers set creator_id = $2 where id = $1`, [vip.id, zara], 1)).toBe("42501");
    // Owner has no update policy on tiers: the update matches nothing.
    await asViewer(await viewer(s.ownerId), (q) => q.query(`update app.tiers set price_cents = 100 where id = $1`, [vip.id]));
    await asViewer({ id: zara, aal: 1 }, (q) => q.query(`update app.tiers set price_cents = 100 where id = $1`, [vip.id]));
    await asViewer({ id: isadora, aal: 1 }, (q) => q.query(`delete from app.tiers where id = $1`, [vip.id]));
    const after = await system((q) => q.one<{ price_cents: number; kind: string }>(`select price_cents, kind from app.tiers where id = $1`, [vip.id]));
    expect(after).toEqual({ price_cents: vip.priceCents, kind: "vip" });
  });
});
