import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { discover, getProfile, quote, setFollow } from "@/server/services/club";
import { processSandboxCheckout } from "@/server/services/checkout";
import {
  getUserPreferences,
  myHomeFeed,
  myPurchases,
  mySubscriptions,
  myTransactionHistory,
  myUnlockedMessages,
  myVault,
  saveUserPreferences,
} from "@/server/services/fan";
import {
  conversationMessages,
  myConversations,
  openConversation,
  sendPaidMessage,
  unreadMessagesCount,
} from "@/server/services/messaging";
import type { SeedResult } from "@/server/seed";
import { asViewer, closePool, resetDb, rlsError, system, viewer } from "./helpers";

let s: SeedResult;

beforeAll(async () => {
  s = await resetDb();
});

afterAll(closePool);

describe("Fan Dashboard, Paid Post Unlocks, Paid Message Unlocks & My Access", () => {
  it("1. New fan discovers available Diva creators and sees welcoming Home feed empty state before following", async () => {
    const velvet = await viewer(s.member2Id); // Velvet Hour: starts with no follows or subscriptions

    // Home empty state provides recommended listed creators
    const initialFeed = await myHomeFeed(velvet);
    expect(initialFeed.hasConnections).toBe(false);
    expect(initialFeed.items).toHaveLength(0);
    expect(initialFeed.recommendedCreators.length).toBeGreaterThan(0);
    for (const c of initialFeed.recommendedCreators) {
      expect(c.display_name.startsWith("Diva ")).toBe(true);
      expect(c.member_from_cents).toBeGreaterThan(0);
    }

    // Explore / Discover search by Diva name or handle
    const foundByDiva = await discover(velvet, { q: "Diva Isadora" });
    expect(foundByDiva.map((c) => c.handle)).toContain("isadora");
    expect(foundByDiva[0].display_name).toBe("Diva Isadora Lune");
  });

  it("2. Fan opens a creator profile, sees Diva name, handle, tiers, and posts distinguished by access type", async () => {
    const velvet = await viewer(s.member2Id);
    const profile = (await getProfile(velvet, "isadora"))!;
    expect(profile).not.toBeNull();
    expect(profile.displayName).toBe("Diva Isadora Lune");
    expect(profile.handle).toBe("isadora");
    expect(profile.tiers.map((t) => t.kind).sort()).toEqual(["member", "vip"]);

    const accessTypes = new Set(profile.posts.map((p) => p.access));
    expect(accessTypes.has("preview")).toBe(true);
    expect(accessTypes.has("members")).toBe(true);
    expect(accessTypes.has("vip")).toBe(true);
    expect(accessTypes.has("ppv")).toBe(true);

    // Only free preview posts are unlocked for a non-subscriber
    for (const post of profile.posts) {
      expect(post.unlocked).toBe(post.access === "preview");
      if (!post.unlocked) {
        expect(post.body).toBeUndefined();
        expect(post.media).toBeUndefined();
      }
    }
  });

  it("3 & 4. Fan unlocks a paid PPV post through verified checkout and keeps access after refresh", async () => {
    const velvet = await viewer(s.member2Id);
    const beforeProfile = (await getProfile(velvet, "isadora"))!;
    const ppvPost = beforeProfile.posts.find((p) => p.access === "ppv")!;
    expect(ppvPost.unlocked).toBe(false);
    expect(ppvPost.priceLabel).toBe("$12");

    // Quote comes from server
    const q = await quote(velvet, { kind: "post", id: ppvPost.id });
    expect(q.creatorName).toBe("Diva Isadora Lune");
    expect(q.amountCents).toBe(1200);
    expect(q.totalLabel).toBe("$12");

    // Execute verified checkout
    const res = await processSandboxCheckout(velvet, {
      kind: "post",
      targetId: ppvPost.id,
      idempotencyKey: "idem_velvet_ppv_isadora_01",
      outcome: "succeeded",
    });
    expect(res.status).toBe("succeeded");
    expect(res.duplicate).toBe(false);

    // Re-query profile (simulating page refresh / new request)
    const afterProfile = (await getProfile(velvet, "isadora"))!;
    const unlockedPost = afterProfile.posts.find((p) => p.id === ppvPost.id)!;
    expect(unlockedPost.unlocked).toBe(true);
    expect(unlockedPost.body).toBeTruthy();
    expect(unlockedPost.media?.length).toBeGreaterThan(0);

    // Membership and VIP posts remain locked (purchasing one PPV post does not grant subscription)
    expect(afterProfile.posts.filter((p) => p.access === "members").every((p) => !p.unlocked)).toBe(true);
  });

  it("5 & 6. Fan receives a locked paid message (body never leaked before purchase), unlocks it, and keeps access across sessions", async () => {
    const nocturne = await viewer(s.memberId); // Active VIP member of Diva Isadora Lune
    const isadora = await viewer(s.creatorIds.isadora);

    const convId = await openConversation(nocturne, isadora.id);

    // Creator sends a locked paid message ($8 = 800 cents)
    const secretBody = "Here is the private acoustic studio recording note and backstage pass code.";
    const safePreview = "Backstage acoustic note & lyrics sheet";
    const sent = await sendPaidMessage(isadora, convId, {
      body: secretBody,
      previewText: safePreview,
      priceCents: 800,
      mediaKind: "audio",
      clientKey: "paid_msg_isadora_001",
    });
    expect(sent.status).toBe("sent");

    // Unread message badge increments for the fan
    expect(await unreadMessagesCount(nocturne)).toBeGreaterThanOrEqual(1);

    // Conversation list preview NEVER leaks secretBody before unlock
    const convListBefore = await myConversations(nocturne);
    const convSummary = convListBefore.find((c) => c.id === convId)!;
    expect(convSummary.preview).toContain(safePreview);
    expect(convSummary.preview).not.toContain(secretBody);

    // Direct PostgreSQL SELECT on app.messages as the fan under RLS hides the locked row completely
    const rawLockedRows = await asViewer(nocturne, (q) =>
      q.query<{ id: string; body: string }>(`select id, body from app.messages where id = $1`, [sent.id]),
    );
    expect(rawLockedRows).toHaveLength(0);

    // Safe RPC conversationMessages returns the locked stub with body: null
    const threadBefore = await conversationMessages(nocturne, convId);
    const lockedMsg = threadBefore.find((m) => m.id === sent.id)!;
    expect(lockedMsg.unlocked).toBe(false);
    expect(lockedMsg.body).toBeNull();
    expect(lockedMsg.previewText).toBe(safePreview);
    expect(lockedMsg.priceCents).toBe(800);
    expect(lockedMsg.priceLabel).toBe("$8");
    expect(JSON.stringify(lockedMsg)).not.toContain(secretBody);

    // Quote the locked message
    const msgQuote = await quote(nocturne, { kind: "message", id: sent.id });
    expect(msgQuote.creatorName).toBe("Diva Isadora Lune");
    expect(msgQuote.amountCents).toBe(800);
    expect(msgQuote.totalLabel).toBe("$8");

    // Fan unlocks the paid message via verified checkout
    const unlockRes = await processSandboxCheckout(nocturne, {
      kind: "message",
      targetId: sent.id,
      idempotencyKey: "idem_nocturne_msg_unlock_01",
      outcome: "succeeded",
    });
    expect(unlockRes.status).toBe("succeeded");

    // Re-authenticate as a fresh viewer session and verify message body is revealed and persisted
    const freshNocturneSession = await viewer(s.memberId);
    const threadAfter = await conversationMessages(freshNocturneSession, convId);
    const unlockedMsg = threadAfter.find((m) => m.id === sent.id)!;
    expect(unlockedMsg.unlocked).toBe(true);
    expect(unlockedMsg.body).toBe(secretBody);
  });

  it("7 & 8. Subscribing unlocks membership posts (while keeping PPV posts distinct) and My Access lists all 4 sections", async () => {
    const velvet = await viewer(s.member2Id);
    await setFollow(velvet, s.creatorIds.zara, true);

    const zaraProfileBefore = (await getProfile(velvet, "zara"))!;
    const zaraMemberTier = zaraProfileBefore.tiers.find((t) => t.kind === "member")!;
    const zaraPpvPost = zaraProfileBefore.posts.find((p) => p.access === "ppv")!;

    // Subscribe Velvet Hour to Diva Zara Osei's Member tier
    const subRes = await processSandboxCheckout(velvet, {
      kind: "tier",
      targetId: zaraMemberTier.id,
      idempotencyKey: "idem_velvet_sub_zara_01",
      outcome: "succeeded",
    });
    expect(subRes.status).toBe("succeeded");

    // Member posts are now unlocked, while VIP and PPV posts remain distinct and locked
    const zaraProfileAfter = (await getProfile(velvet, "zara"))!;
    expect(zaraProfileAfter.viewer.tier).toBe("member");
    expect(zaraProfileAfter.posts.filter((p) => p.access === "members").every((p) => p.unlocked)).toBe(true);
    expect(zaraProfileAfter.posts.filter((p) => p.access === "vip").every((p) => !p.unlocked)).toBe(true);
    expect(zaraProfileAfter.posts.find((p) => p.id === zaraPpvPost.id)!.unlocked).toBe(false);

    // Home feed for Velvet Hour now includes posts from followed/subscribed creators
    const homeFeed = await myHomeFeed(velvet);
    expect(homeFeed.hasConnections).toBe(true);
    expect(homeFeed.items.length).toBeGreaterThan(0);

    // Check My Access sections for Nocturne (has active subscriptions, unlocked posts, unlocked message, and transaction history)
    const nocturne = await viewer(s.memberId);
    const [subs, vault, unlockedMsgs, txHistory] = await Promise.all([
      mySubscriptions(nocturne),
      myVault(nocturne),
      myUnlockedMessages(nocturne),
      myTransactionHistory(nocturne),
    ]);

    expect(subs.filter((x) => x.state === "active").length).toBeGreaterThanOrEqual(2);
    expect(vault.items.length).toBeGreaterThan(0);
    expect(unlockedMsgs.length).toBe(1);
    expect(unlockedMsgs[0].creator?.displayName).toBe("Diva Isadora Lune");
    expect(unlockedMsgs[0].body).toContain("private acoustic studio recording");

    // Transaction history distinguishes one-time unlocks from recurring subscriptions
    expect(txHistory.some((tx) => tx.kind === "paid_message" && tx.billingType === "one_time")).toBe(true);
    expect(txHistory.some((tx) => tx.kind === "ppv" && tx.billingType === "one_time")).toBe(true);

    const velvetHistory = await myTransactionHistory(velvet);
    expect(velvetHistory.some((tx) => tx.kind === "subscription" && tx.billingType === "recurring")).toBe(true);
    expect(velvetHistory.some((tx) => tx.kind === "ppv" && tx.billingType === "one_time")).toBe(true);
  });

  it("9 & 10. Canceled or failed payments grant no access, and repeated payment events create no duplicate entitlements", async () => {
    const velvet = await viewer(s.member2Id);
    const seleneProfile = (await getProfile(velvet, "selene"))!;
    const selenePpv = seleneProfile.posts.find((p) => p.access === "ppv")!;

    // Failed payment grants no access
    const failedRes = await processSandboxCheckout(velvet, {
      kind: "post",
      targetId: selenePpv.id,
      idempotencyKey: "idem_velvet_selene_failed_01",
      outcome: "failed",
    });
    expect(failedRes.status).toBe("failed");
    expect((await getProfile(velvet, "selene"))!.posts.find((p) => p.id === selenePpv.id)!.unlocked).toBe(false);

    // Canceled payment grants no access
    const canceledRes = await processSandboxCheckout(velvet, {
      kind: "post",
      targetId: selenePpv.id,
      idempotencyKey: "idem_velvet_selene_canceled_01",
      outcome: "canceled",
    });
    expect(canceledRes.status).toBe("canceled");
    expect((await getProfile(velvet, "selene"))!.posts.find((p) => p.id === selenePpv.id)!.unlocked).toBe(false);

    // Replaying an already-succeeded idempotency key returns duplicate: true and creates no duplicate ledger entries
    const ledgerCountBefore = await system((q) =>
      q.one<{ c: number }>(`select count(*)::int as c from app.ledger_entries`),
    );
    const replay = await processSandboxCheckout(velvet, {
      kind: "post",
      targetId: (await getProfile(velvet, "isadora"))!.posts.find((p) => p.access === "ppv")!.id,
      idempotencyKey: "idem_velvet_ppv_isadora_01",
      outcome: "succeeded",
    });
    expect(replay.duplicate).toBe(true);
    const ledgerCountAfter = await system((q) =>
      q.one<{ c: number }>(`select count(*)::int as c from app.ledger_entries`),
    );
    expect(ledgerCountAfter!.c).toBe(ledgerCountBefore!.c);
  });

  it("11 & 12. Another fan cannot read a fan's message purchases, post purchases, or receipts (RLS & service isolation)", async () => {
    const velvet = await viewer(s.member2Id);
    const nocturne = await viewer(s.memberId);

    // Velvet Hour cannot see Nocturne's unlocked messages in service or via direct RLS query
    const velvetUnlockedMsgs = await myUnlockedMessages(velvet);
    expect(velvetUnlockedMsgs).toHaveLength(0);

    const rlsMsgPurchases = await asViewer(velvet, (q) =>
      q.query<{ fan_id: string }>(`select fan_id from app.message_purchases`),
    );
    expect(rlsMsgPurchases).toHaveLength(0);

    // Direct writes to app.message_purchases by mk_app are forbidden (42501)
    expect(
      await rlsError(
        velvet.id,
        `insert into app.message_purchases (fan_id, message_id) select $1, id from app.messages limit 1`,
        [velvet.id],
      ),
    ).toBe("42501");

    // Velvet's purchases list does not include Nocturne's Mireille PPV purchase
    const velvetPurchases = await myPurchases(velvet);
    const nocturnePurchases = await myPurchases(nocturne);
    expect(velvetPurchases.some((p) => nocturnePurchases.some((np) => np.id === p.id))).toBe(false);

    // Account notification preferences persist per user under RLS
    const defaultPrefs = await getUserPreferences(velvet);
    expect(defaultPrefs).toEqual({ notifyNewPosts: true, notifyMessages: true, notifyBilling: true });
    await saveUserPreferences(velvet, { notifyNewPosts: false, notifyMessages: true, notifyBilling: false });
    expect(await getUserPreferences(velvet)).toEqual({
      notifyNewPosts: false,
      notifyMessages: true,
      notifyBilling: false,
    });
    expect(await getUserPreferences(nocturne)).toEqual({
      notifyNewPosts: true,
      notifyMessages: true,
      notifyBilling: true,
    });
  });
});

