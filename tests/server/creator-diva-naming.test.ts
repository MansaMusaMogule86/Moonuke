import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  CREATOR_NAME_PREFIX,
  NEUTRAL_CREATOR_FALLBACK,
  formatCreatorPublicName,
  normalizeCreatorChosenName,
  validateCreatorChosenName,
} from "@/lib/creatorName";
import { discover, getProfile, quote } from "@/server/services/club";
import { createInvitation } from "@/server/services/admin";
import { redeemInvitation } from "@/server/services/accounts";
import { confirmEmail, emailVerificationToken } from "@/server/services/emailVerification";
import {
  getOnboarding,
  reviewVerification,
  saveProfile,
  submitVerification,
  updateCreatorName,
} from "@/server/services/creatorOnboarding";
import { fanDashboard, myFollowing, myPurchases, mySubscriptions, myVault } from "@/server/services/fan";
import { myConversations, openConversation, sendMessage } from "@/server/services/messaging";
import { myNotifications } from "@/server/services/notifications";
import { referralCreator } from "@/server/services/creatorReferral";
import { createPost } from "@/server/services/studio";
import { resolveSession, createSession } from "@/server/services/sessions";
import type { SeedResult } from "@/server/seed";
import { allowCreatorFixture, asViewer, closePool, resetDb, rlsError, system, viewer } from "./helpers";

let s: SeedResult;
const meta = { ipHash: "test-ip", userAgent: "vitest" };
const allChecks = { identity: true, age: true, consent_records: true } as const;

beforeAll(async () => {
  await resetDb();
});

beforeEach(async () => {
  s = await resetDb();
});

afterAll(closePool);

describe("Mandatory 'Diva [chosen name]' creator naming", () => {
  it("1. Shared formatter & validator normalize prefixes, whitespace, and Unicode (including Arabic)", () => {
    expect(CREATOR_NAME_PREFIX).toBe("Diva");
    expect(formatCreatorPublicName("Miriam")).toBe("Diva Miriam");
    expect(formatCreatorPublicName("  Miriam  ")).toBe("Diva Miriam");
    expect(formatCreatorPublicName("Diva Miriam")).toBe("Diva Miriam");
    expect(formatCreatorPublicName("diva   diva  Miriam")).toBe("Diva Miriam");
    expect(formatCreatorPublicName("DIVA: Miriam")).toBe("Diva Miriam");
    expect(formatCreatorPublicName("Divana")).toBe("Diva Divana");
    expect(formatCreatorPublicName("مريم")).toBe("Diva مريم");
    expect(formatCreatorPublicName("Diva مريم")).toBe("Diva مريم");
    expect(formatCreatorPublicName("")).toBe(NEUTRAL_CREATOR_FALLBACK);
    expect(formatCreatorPublicName("private@example.com")).toBe(NEUTRAL_CREATOR_FALLBACK);

    expect(normalizeCreatorChosenName("Diva Britney")).toBe("Britney");
    expect(normalizeCreatorChosenName("Diva Diva Jade")).toBe("Jade");
    expect(normalizeCreatorChosenName("  مريم   النور ")).toBe("مريم النور");

    expect(validateCreatorChosenName("Miriam")).toEqual({
      ok: true,
      chosenName: "Miriam",
      publicName: "Diva Miriam",
    });
    expect(validateCreatorChosenName("Diva Miriam")).toEqual({
      ok: true,
      chosenName: "Miriam",
      publicName: "Diva Miriam",
    });
    expect(validateCreatorChosenName("مريم")).toEqual({
      ok: true,
      chosenName: "مريم",
      publicName: "Diva مريم",
    });

    // Rejects blank, only-prefix, control characters, HTML tags, emails, over-length, and reserved words
    expect(validateCreatorChosenName("   ").ok).toBe(false);
    expect(validateCreatorChosenName("Diva").ok).toBe(false);
    expect(validateCreatorChosenName("Miriam\u0000").ok).toBe(false);
    expect(validateCreatorChosenName("<script>alert(1)</script>").ok).toBe(false);
    expect(validateCreatorChosenName("miriam@example.com").ok).toBe(false);
    expect(validateCreatorChosenName("a".repeat(51)).ok).toBe(false);
    expect(validateCreatorChosenName("Admin").ok).toBe(false);
  });

  it("2. A new creator choosing 'Miriam' during onboarding appears publicly as 'Diva Miriam'", async () => {
    const owner = await viewer(s.ownerId);
    await allowCreatorFixture("miriam.private@example.com");
    const inv = await createInvitation(owner, {
      role: "creator",
      email: "miriam.private@example.com",
      maxUses: 1,
      expiresInDays: 7,
    });

    const { userId, sessionToken } = await redeemInvitation(
      inv.token,
      { alias: "Miriam", email: "miriam.private@example.com", password: "a-long-enough-password" },
      meta,
    );
    expect(await confirmEmail(emailVerificationToken(userId), meta)).toBe(true);
    await system((q) => q.query(`update app.users set status = 'active' where id = $1`, [userId]));

    const resolved = await resolveSession(sessionToken);
    expect(resolved?.alias).toBe("Diva Miriam");

    const creator = await viewer(userId);
    await saveProfile(creator, {
      handle: "divamiriam",
      displayName: "Miriam",
      discipline: "Vocalist",
      category: "music",
      city: "Cairo",
      tagline: "Live studio sessions.",
      visibility: "listed",
    });

    const ob = await getOnboarding(creator);
    expect(ob.profile).toMatchObject({
      handle: "divamiriam",
      creatorName: "Miriam",
      displayName: "Diva Miriam",
      needsNameSetup: false,
    });

    await submitVerification(creator);
    await reviewVerification(owner, userId, "verify", { checks: allChecks });

    const fan = await viewer(s.memberId);
    const publicProfile = await getProfile(fan, "divamiriam");
    expect(publicProfile?.displayName).toBe("Diva Miriam");
    expect(publicProfile?.handle).toBe("divamiriam");
    // Private email is never exposed on public profile
    expect(JSON.stringify(publicProfile)).not.toContain("miriam.private@example.com");

    // Discovery search finds "Diva Miriam" by either "Miriam" or "Diva Miriam"
    const byChosen = await discover(fan, { q: "Miriam" });
    expect(byChosen.find((c) => c.handle === "divamiriam")?.display_name).toBe("Diva Miriam");
    const byFull = await discover(fan, { q: "Diva Miriam" });
    expect(byFull.find((c) => c.handle === "divamiriam")?.display_name).toBe("Diva Miriam");
  });

  it("3. Entering 'Diva Miriam' produces only one 'Diva' prefix in both service and database triggers", async () => {
    const isadora = await viewer(s.creatorIds.isadora);
    await saveProfile(isadora, {
      handle: "isadora",
      displayName: "Diva Miriam",
      discipline: "Couture & Muse",
      category: "couture",
      visibility: "listed",
    });

    const row = await system((q) =>
      q.one<{ creator_name: string; display_name: string }>(
        `select creator_name, display_name from app.creators where user_id = $1`,
        [isadora.id],
      ),
    );
    expect(row).toEqual({
      creator_name: "Miriam",
      display_name: "Diva Miriam",
    });

    // Even a direct SQL update with duplicate prefixes is normalized by app.creators_guard()
    await asViewer(isadora, (q) =>
      q.query(`update app.creators set display_name = 'Diva   Diva   Miriam' where user_id = $1`, [isadora.id]),
    );
    const afterSql = await system((q) =>
      q.one<{ creator_name: string; display_name: string }>(
        `select creator_name, display_name from app.creators where user_id = $1`,
        [isadora.id],
      ),
    );
    expect(afterSql).toEqual({
      creator_name: "Miriam",
      display_name: "Diva Miriam",
    });
  });

  it("4. Changing 'Miriam' to 'Britney' updates the public identity across profiles, discovery, posts, messages, notifications, referrals, and fan library while preserving @handle, subscriptions, and ownership", async () => {
    const creator = await viewer(s.creatorIds.isadora);
    const fan = await viewer(s.memberId); // Active VIP subscriber of isadora

    // Step A: Set name to Miriam
    const step1 = await updateCreatorName(creator, creator.id, "Miriam");
    expect(step1).toEqual({
      userId: creator.id,
      handle: "isadora",
      creatorName: "Miriam",
      displayName: "Diva Miriam",
    });

    // Record existing relationships before rename to Britney
    const subsBefore = await mySubscriptions(fan);
    const isadoraSubBefore = subsBefore.find((sub) => sub.creator?.id === creator.id)!;
    expect(isadoraSubBefore.creator?.displayName).toBe("Diva Miriam");

    // Open conversation and send a message from creator to fan
    const convId = await openConversation(fan, creator.id);
    await sendMessage(creator, convId, "Welcome to the studio.", "client-key-0001");

    // Create a new published post to trigger notification
    const postId = await createPost(creator, {
      access: "members",
      teaser: "New couture fitting.",
      body: "Full fitting notes inside.",
      mediaKind: "image",
      mediaCount: 1,
      publish: "now",
    });

    // Step B: Change creator name from Miriam to Britney
    const step2 = await updateCreatorName(creator, creator.id, "Britney");
    expect(step2).toEqual({
      userId: creator.id,
      handle: "isadora",
      creatorName: "Britney",
      displayName: "Diva Britney",
    });

    // 1) Public creator profile (/c/isadora) shows "Diva Britney" and handle remains "isadora"
    const profile = await getProfile(fan, "isadora");
    expect(profile?.displayName).toBe("Diva Britney");
    expect(profile?.handle).toBe("isadora");
    expect(profile?.id).toBe(creator.id);

    // 2) Discovery & search show "Diva Britney"
    const disc = await discover(fan, { q: "Britney" });
    expect(disc.find((c) => c.id === creator.id)?.display_name).toBe("Diva Britney");

    // 3) Subscriptions, Vault, and Fan Dashboard show "Diva Britney" and subscription ID is unchanged
    const subsAfter = await mySubscriptions(fan);
    const isadoraSubAfter = subsAfter.find((sub) => sub.creator?.id === creator.id)!;
    expect(isadoraSubAfter.id).toBe(isadoraSubBefore.id);
    expect(isadoraSubAfter.creator?.displayName).toBe("Diva Britney");

    const vault = await myVault(fan, { creatorHandle: "isadora" });
    expect(vault.items.length).toBeGreaterThan(0);
    expect(vault.items[0].creator.displayName).toBe("Diva Britney");
    expect(vault.items.some((i) => i.id === postId)).toBe(true);

    const dash = await fanDashboard(fan);
    expect(dash.memberships.find((m) => m.creator?.id === creator.id)?.creator?.displayName).toBe("Diva Britney");

    // 4) Messages and conversation list show "Diva Britney" with same conversation ID
    const convs = await myConversations(fan);
    const conv = convs.find((c) => c.id === convId)!;
    expect(conv.peer.name).toBe("Diva Britney");
    expect(conv.peer.handle).toBe("isadora");

    // 5) Notifications show "Diva Britney"
    const notes = await myNotifications(fan);
    const postNote = notes.find((n) => n.kind === "post.published" && n.creator?.handle === "isadora");
    expect(postNote?.title).toBe("Diva Britney posted");
    const msgNote = notes.find((n) => n.kind === "message.received" && n.creator?.handle === "isadora");
    expect(msgNote?.title).toBe("New message from Diva Britney");

    // 6) Creator referral landing page (/join/isadora) shows "Diva Britney" and same handle
    const ref = await referralCreator("isadora");
    expect(ref?.displayName).toBe("Diva Britney");
    expect(ref?.handle).toBe("isadora");

    // 7) Checkout quote shows "Diva Britney"
    const ppvPost = await system((q) =>
      q.one<{ id: string }>(`select id from app.posts where creator_id = $1 and access = 'ppv' limit 1`, [
        s.creatorIds.kaiasol,
      ]),
    );
    const qQuote = await quote(fan, { kind: "post", id: ppvPost!.id });
    expect(qQuote.subtitle).toContain("Diva Kaia Sol");

    // 8) Purchases and Following lists show "Diva [name]"
    const purchases = await myPurchases(fan);
    expect(purchases[0]?.creator?.displayName).toBe("Diva Mireille Dusk");
    const following = await myFollowing(fan);
    expect(following.map((f) => f.displayName)).toEqual(
      expect.arrayContaining(["Diva Kaia Sol", "Diva Valentin Ash"]),
    );
  });

  it("5. Fan accounts keep their existing naming behavior and do not receive the Diva prefix", async () => {
    const { userId, sessionToken } = await redeemInvitation(
      s.inviteToken,
      { alias: "Celeste Lune", email: "celeste.fan@example.com", password: "a-long-enough-password" },
      meta,
    );
    await system((q) => q.query(`update app.users set status = 'active' where id = $1`, [userId]));

    const resolvedFan = await resolveSession(sessionToken);
    expect(resolvedFan?.role).toBe("member");
    expect(resolvedFan?.alias).toBe("Celeste Lune");
    expect(resolvedFan?.alias.startsWith("Diva ")).toBe(false);

    // Seeded fan accounts also keep their unprefixed aliases
    const nocturneToken = await createSession(s.memberId, "vitest");
    const resolvedNocturne = await resolveSession(nocturneToken);
    expect(resolvedNocturne?.alias).toBe("Nocturne");

    // In a creator's conversation list, the fan peer appears as "Nocturne", never "Diva Nocturne"
    const creator = await viewer(s.creatorIds.isadora);
    const fan = await viewer(s.memberId);
    await openConversation(fan, creator.id);
    const creatorConvs = await myConversations(creator);
    expect(creatorConvs[0]?.peer.name).toBe("Nocturne");
  });

  it("6. Arabic creator names save, format, and display accurately", async () => {
    const creator = await viewer(s.creatorIds.zara);
    const fan = await viewer(s.memberId);

    const updated = await updateCreatorName(creator, creator.id, "  مريم النور  ");
    expect(updated).toEqual({
      userId: creator.id,
      handle: "zara",
      creatorName: "مريم النور",
      displayName: "Diva مريم النور",
    });

    const profile = await getProfile(fan, "zara");
    expect(profile?.displayName).toBe("Diva مريم النور");

    const found = await discover(fan, { q: "مريم" });
    expect(found.find((c) => c.handle === "zara")?.display_name).toBe("Diva مريم النور");

    // Entering "Diva مريم" strips the duplicate prefix
    const updated2 = await updateCreatorName(creator, creator.id, "Diva مريم");
    expect(updated2.creatorName).toBe("مريم");
    expect(updated2.displayName).toBe("Diva مريم");
  });

  it("7. Authorization: unauthorized users cannot rename another creator; only the creator or an authorized owner can", async () => {
    const isadora = await viewer(s.creatorIds.isadora);
    const zara = await viewer(s.creatorIds.zara);
    const fan = await viewer(s.memberId);
    const owner = await viewer(s.ownerId);

    // Fan cannot rename a creator
    await expect(updateCreatorName(fan, isadora.id, "Hacked")).rejects.toMatchObject({
      code: "forbidden",
    });

    // Another creator cannot rename Isadora via service
    await expect(updateCreatorName(zara, isadora.id, "Hacked")).rejects.toMatchObject({
      code: "forbidden",
    });

    // Another creator cannot rename Isadora via direct SQL under RLS
    const directRows = await asViewer(zara, (q) =>
      q.query(
        `update app.creators set creator_name = 'Hacked', display_name = 'Diva Hacked' where user_id = $1 returning 1`,
        [isadora.id],
      ),
    );
    expect(directRows).toHaveLength(0);

    // Fan cannot update or insert app.creators via direct SQL under RLS
    const fanUpdateRows = await asViewer(fan, (q) =>
      q.query(
        `update app.creators set creator_name = 'Hacked', display_name = 'Diva Hacked' where user_id = $1 returning 1`,
        [isadora.id],
      ),
    );
    expect(fanUpdateRows).toHaveLength(0);
    expect(
      await rlsError(
        fan.id,
        `insert into app.creators (user_id, handle, creator_name, display_name, discipline, category) values ($1, 'fan_hack', 'Hacked', 'Diva Hacked', 'Art', 'art')`,
        [fan.id],
      ),
    ).toBe("42501");

    // Authorized owner CAN update a creator's name
    const adminRes = await updateCreatorName(owner, isadora.id, "Jade Star");
    expect(adminRes).toEqual({
      userId: isadora.id,
      handle: "isadora",
      creatorName: "Jade Star",
      displayName: "Diva Jade Star",
    });
  });

  it("8. Existing creator backfill is idempotent and never derives public names from private emails", async () => {
    const rows = await system((q) =>
      q.query<{ handle: string; creator_name: string; display_name: string; needs_name_setup: boolean }>(
        `select handle::text as handle, creator_name, display_name, needs_name_setup from app.creators order by handle`,
      ),
    );
    expect(rows.length).toBeGreaterThanOrEqual(12);
    for (const r of rows) {
      expect(r.display_name).toBe(`Diva ${r.creator_name}`);
      expect(r.display_name.startsWith("Diva ")).toBe(true);
      expect(r.display_name).not.toMatch(/^Diva\s+Diva(\s|$)/i);
      expect(r.display_name).not.toContain("@");
      expect(r.needs_name_setup).toBe(false);
    }

    // Re-running the backfill SQL statement is completely idempotent
    await system((q) =>
      q.query(`
        update app.creators c
           set creator_name = btrim(left(app.normalize_creator_name(coalesce(nullif(btrim(c.creator_name), ''), c.display_name)), 50)),
               display_name = app.format_creator_display_name(coalesce(nullif(btrim(c.creator_name), ''), c.display_name))
      `),
    );

    const rowsAfter = await system((q) =>
      q.query<{ handle: string; creator_name: string; display_name: string }>(
        `select handle::text as handle, creator_name, display_name from app.creators order by handle`,
      ),
    );
    expect(rowsAfter).toEqual(
      rows.map(({ handle, creator_name, display_name }) => ({ handle, creator_name, display_name })),
    );
  });
});
