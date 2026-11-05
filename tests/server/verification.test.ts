import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { discover, getProfile } from "@/server/services/club";
import { getOnboarding, reviewVerification, saveProfile, submitVerification, verificationQueue } from "@/server/services/creatorOnboarding";
import { createInvitation } from "@/server/services/admin";
import { redeemInvitation } from "@/server/services/accounts";
import type { SeedResult } from "@/server/seed";
import { asViewer, closePool, meta, resetDb, rlsError, system, viewer } from "./helpers";

let s: SeedResult;
beforeEach(async () => {
  s = await resetDb();
});
afterAll(closePool);

const all = { identity: true, age: true, consent_records: true };

describe("creator verification gates profile visibility", () => {
  it("an unverified, unpublished creator is invisible to members (profile, search, discovery)", async () => {
    const m = await viewer(s.member2Id);
    expect(await getProfile(m, "rhea")).toBeNull();
    expect(await discover(m, { q: "Rhea" })).toHaveLength(0);
    // …but the creator and the owner can see the draft.
    expect(await getProfile(await viewer(s.creatorIds.rhea), "rhea")).not.toBeNull();
    expect(await getProfile(await viewer(s.ownerId), "rhea")).not.toBeNull();
  });

  it("verify requires every owner check, then publishes atomically", async () => {
    const owner = await viewer(s.ownerId);
    await expect(reviewVerification(owner, s.creatorIds.rhea, "verify", { checks: { identity: true, age: true } })).rejects.toMatchObject({ field: "checks" });
    expect(await getProfile(await viewer(s.member2Id), "rhea")).toBeNull();
    expect(await reviewVerification(owner, s.creatorIds.rhea, "verify", { checks: all })).toMatchObject({ status: "verified", published: true });
    expect(await getProfile(await viewer(s.member2Id), "rhea")).not.toBeNull();
    const mail = await system((q) => q.one(`select 1 from app.email_outbox where template = 'creator_verified' and to_email = 'rhea@moonuke.test'`));
    expect(mail).toBeTruthy();
    await reviewVerification(owner, s.creatorIds.rhea, "unpublish");
    expect(await getProfile(await viewer(s.member2Id), "rhea")).toBeNull();
  });

  it("a creator cannot publish, feature or verify themselves (trigger + RLS)", async () => {
    expect(await rlsError(s.creatorIds.rhea, `update app.creators set published_at = now() where user_id = $1`, [s.creatorIds.rhea], 1)).toBe("42501");
    expect(await rlsError(s.creatorIds.rhea, `update app.creators set featured = true where user_id = $1`, [s.creatorIds.rhea], 1)).toBe("42501");
    const forged = await asViewer(s.creatorIds.rhea, (q) =>
      q.query(`update app.creator_verifications set status = 'verified', checks = '{"identity":true}' where user_id = $1 returning 1`, [s.creatorIds.rhea]),
    ).catch((e) => e.code);
    expect(forged === "42501" || (Array.isArray(forged) && forged.length === 0)).toBe(true);
    await expect(reviewVerification(await viewer(s.creatorIds.rhea), s.creatorIds.rhea, "verify", { checks: all })).rejects.toMatchObject({ code: "forbidden" });
    await expect(verificationQueue(await viewer(s.memberId))).rejects.toMatchObject({ code: "forbidden" });
  });

  it("a creator cannot edit another creator's profile", async () => {
    const r = await asViewer(s.creatorIds.rhea, (q) => q.query(`update app.creators set display_name = 'Hacked' where handle = 'isadora' returning 1`));
    expect(r).toHaveLength(0);
  });
});

describe("full onboarding: invitation → approval → profile → verification", () => {
  it("a newly invited creator builds a draft, submits, and is verified by the owner", async () => {
    const owner = await viewer(s.ownerId);
    const inv = await createInvitation(owner, { role: "creator", maxUses: 1, expiresInDays: 3 });
    const { userId } = await redeemInvitation(inv.token, { alias: "Nova Reyes", email: "nova@example.com", password: "a-long-enough-password" }, meta);
    await system((q) => q.query(`update app.users set status = 'active' where id = $1`, [userId]));
    const creator = await viewer(userId);

    await expect(submitVerification(creator)).rejects.toMatchObject({ code: "validation" });
    await expect(saveProfile(creator, { handle: "isadora", displayName: "Nova", discipline: "Dancer", category: "movement", visibility: "listed" })).rejects.toMatchObject({ field: "handle" });
    await saveProfile(creator, { handle: "nova", displayName: "Nova Reyes", discipline: "Dancer", category: "movement", visibility: "listed" });
    await submitVerification(creator);
    await expect(submitVerification(creator)).rejects.toMatchObject({ code: "conflict" });
    expect((await getOnboarding(creator)).verification.status).toBe("submitted");

    await reviewVerification(owner, userId, "needs_more_info", { note: "Please book a video call." });
    const ob = await getOnboarding(creator);
    expect(ob.verification).toMatchObject({ status: "needs_more_info", reviewNote: "Please book a video call." });
    await submitVerification(creator);
    await reviewVerification(owner, userId, "verify", { checks: all });
    expect((await discover(await viewer(s.member2Id), { q: "Nova" })).map((c) => c.handle)).toEqual(["nova"]);
  });

  it("members (non-creators) cannot create creator profiles", async () => {
    await expect(saveProfile(await viewer(s.memberId), { handle: "nope", displayName: "x", discipline: "x", category: "art", visibility: "listed" })).rejects.toMatchObject({ code: "forbidden" });
    expect(await rlsError(s.memberId, `insert into app.creators (user_id, handle, display_name, discipline, category) values ($1, 'nope', 'x', 'x', 'art')`, [s.memberId], 1)).toBe("42501");
  });
});
