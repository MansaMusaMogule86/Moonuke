import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  captureCreatorReferralAtSignup,
  confirmCreatorReferralOnboarding,
  getOrCreateCreatorRecruitmentLink,
  myReferralAttribution,
  resolveRecruitmentCode,
} from "@/server/services/creatorReferralsAndWithdrawals";
import { createPost } from "@/server/services/studio";
import { processSandboxCheckout } from "@/server/services/checkout";
import type { SeedResult } from "@/server/seed";
import { allowCreatorFixture, asViewer, closePool, resetDb, system, viewer } from "./helpers";

let s: SeedResult;
beforeEach(async () => {
  s = await resetDb();
});
afterAll(closePool);

async function makeCreator(email: string, alias: string, handle: string) {
  await allowCreatorFixture(email);
  const row = await system((q) =>
    q.one<{ id: string }>(
      `insert into app.users (email, email_verified_at, password_hash, role, status, alias, adult_attested_at)
       values ($1, now(), 'x', 'creator', 'active', $2, now()) returning id`,
      [email, alias],
    ),
  );
  const id = row!.id;
  await system((q) =>
    q.query(
      `insert into app.creators (user_id, handle, display_name, discipline, category, city, tagline, bio, visibility, published_at)
       values ($1, $2, $3, 'Music', 'music', 'Berlin', 't', 'b', 'listed', now())`,
      [id, handle, alias],
    ),
  );
  return viewer(id);
}

describe("creator recruitment redemption journey", () => {
  it("resolves only live recruitment links", async () => {
    const link = await getOrCreateCreatorRecruitmentLink(await viewer(s.creatorIds.isadora));
    expect(link.recruitmentPath).toBe(`/recruit/${link.recruitmentCode}`);
    expect(await resolveRecruitmentCode(link.recruitmentCode)).toMatchObject({ creatorId: s.creatorIds.isadora });
    expect(await resolveRecruitmentCode("nope-missing")).toBeNull();
    expect(await resolveRecruitmentCode("!!!")).toBeNull();
  });

  it("captures attribution at signup with self, duplicate, and cycle guards", async () => {
    const referrer = await viewer(s.creatorIds.isadora);
    const link = await getOrCreateCreatorRecruitmentLink(referrer);
    const referred = await makeCreator("recruit.a@test.local", "Recruit A", "recruita");

    const first = await captureCreatorReferralAtSignup({ referredUserId: referred.id, recruitmentCode: link.recruitmentCode });
    expect(first).toMatchObject({ referredCreatorId: referred.id, referrerCreatorId: s.creatorIds.isadora, status: "captured" });

    // Idempotent for the same referrer.
    const again = await captureCreatorReferralAtSignup({ referredUserId: referred.id, recruitmentCode: link.recruitmentCode });
    expect(again.referrerCreatorId).toBe(s.creatorIds.isadora);

    // A different referrer can never silently replace the attribution.
    const other = await getOrCreateCreatorRecruitmentLink(await viewer(s.creatorIds.zara));
    await expect(
      captureCreatorReferralAtSignup({ referredUserId: referred.id, recruitmentCode: other.recruitmentCode }),
    ).rejects.toMatchObject({ code: "conflict" });

    // Self-referral is refused.
    await expect(
      captureCreatorReferralAtSignup({ referredUserId: s.creatorIds.isadora, recruitmentCode: link.recruitmentCode }),
    ).rejects.toMatchObject({ code: "validation" });

    // Cycles are refused: B refers A back after A referred B.
    const b = await makeCreator("recruit.b@test.local", "Recruit B", "recruitb");
    await captureCreatorReferralAtSignup({ referredUserId: b.id, recruitmentCode: link.recruitmentCode });
    const bViewer = await viewer(b.id);
    const bOwn = await getOrCreateCreatorRecruitmentLink(bViewer);
    await expect(
      captureCreatorReferralAtSignup({ referredUserId: s.creatorIds.isadora, recruitmentCode: bOwn.recruitmentCode }),
    ).rejects.toMatchObject({ code: "validation" });

    // Members cannot hold creator attribution.
    await expect(
      captureCreatorReferralAtSignup({ referredUserId: s.memberId, recruitmentCode: link.recruitmentCode }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("confirmation requires explicit terms and exposes only the creator's own attribution", async () => {
    const referrer = await viewer(s.creatorIds.isadora);
    const link = await getOrCreateCreatorRecruitmentLink(referrer);
    const referred = await makeCreator("recruit.c@test.local", "Recruit C", "recruitc");
    await captureCreatorReferralAtSignup({ referredUserId: referred.id, recruitmentCode: link.recruitmentCode });

    // Terms are mandatory.
    await expect(confirmCreatorReferralOnboarding(referred, { acceptReferralTerms: false })).rejects.toMatchObject({
      code: "validation",
    });
    const before = await myReferralAttribution(referred);
    expect(before).toMatchObject({ status: "captured", referrerCreatorId: s.creatorIds.isadora });

    const done = await confirmCreatorReferralOnboarding(referred, { acceptReferralTerms: true });
    expect(done).toMatchObject({ status: "confirmed" });
    expect(done!.agreementAcceptedAt).toBeTruthy();

    // Isolation: another creator sees none of it, a fan is refused.
    expect(await myReferralAttribution(await viewer(s.creatorIds.zara))).toBeNull();
    await expect(myReferralAttribution(await viewer(s.memberId))).rejects.toMatchObject({ code: "forbidden" });
  });

  it("commissions accrue only on confirmed attribution (1.5% of eligible sale)", async () => {
    const referrer = await viewer(s.creatorIds.isadora);
    const link = await getOrCreateCreatorRecruitmentLink(referrer);
    const referred = await makeCreator("recruit.d@test.local", "Recruit D", "recruitd");
    await system((q) =>
      q.query(`update app.users set created_at = now() - interval '30 days' where id = any ($1)`, [[referred.id, s.memberId]]),
    );
    const postId = await createPost(referred, {
      access: "ppv",
      priceCents: 10000,
      teaser: "Exclusive track",
      mediaKind: "image",
      publish: "now",
    });

    // Captured but NOT confirmed: the $100 sale allocates $85/$15, no referral commission.
    await captureCreatorReferralAtSignup({ referredUserId: referred.id, recruitmentCode: link.recruitmentCode });
    const fan = await viewer(s.memberId);
    await processSandboxCheckout(fan, { kind: "post", targetId: postId, idempotencyKey: "idem-recruit-noconfirm-01", outcome: "succeeded" });
    const none = await system((q) =>
      q.one<{ n: number }>(`select count(*)::int as n from app.referral_commissions where referred_creator_id = $1`, [referred.id]),
    );
    expect(none?.n ?? -1).toBe(0);

    // Confirmed: the same fan unlock (idempotent replay path) funds a $1.50 commission.
    await confirmCreatorReferralOnboarding(referred, { acceptReferralTerms: true });
    const post2 = await createPost(referred, {
      access: "ppv",
      priceCents: 10000,
      teaser: "Second exclusive",
      mediaKind: "image",
      publish: "now",
    });
    await processSandboxCheckout(fan, { kind: "post", targetId: post2, idempotencyKey: "idem-recruit-confirm-01", outcome: "succeeded" });
    const paid = await system((q) =>
      q.query<{ commission_cents: string | number }>(
        `select commission_cents from app.referral_commissions where referred_creator_id = $1 order by created_at`,
        [referred.id],
      ),
    );
    expect(paid.map((r) => Number(r.commission_cents))).toEqual([150]);
  });

  it("fan invite links stay separate from creator recruitment links", async () => {
    const link = await getOrCreateCreatorRecruitmentLink(await viewer(s.creatorIds.isadora));
    expect(link.recruitmentPath.startsWith("/recruit/")).toBe(true);
    expect(link.recruitmentPath.startsWith("/join/")).toBe(false);
    // Recruitment codes never resolve as fan invite handles and vice versa.
    expect(await resolveRecruitmentCode("isadora")).toBeNull();
  });
});
