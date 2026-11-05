import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getEntitledMedia } from "@/server/services/club";
import { fanDashboard, myFollowing, myPurchases, mySubscriptions, myVault, setSubscriptionCancel, subscriptionState } from "@/server/services/fan";
import { deliverNotification, markAllRead, markRead, myNotifications, unreadCount } from "@/server/services/notifications";
import { block as blockUser } from "@/server/services/safety";
import { createPost, updatePost } from "@/server/services/studio";
import { proposeProfile } from "@/server/services/onboarding";
import type { SeedResult } from "@/server/seed";
import { asViewer, closePool, resetDb, rlsError, system, viewer } from "./helpers";

let s: SeedResult;
beforeEach(async () => {
  s = await resetDb();
});
afterAll(closePool);

const live = { access: "members" as const, teaser: "New letter for members", body: "Members-only words.", mediaKind: "image" as const, publish: "now" as const };

describe("fan access", () => {
  it("only active members and creators get the fan app; the owner and pending accounts don't", async () => {
    await expect(fanDashboard(await viewer(s.ownerId))).rejects.toMatchObject({ code: "forbidden" });
    await expect(fanDashboard(await viewer(s.pendingId))).rejects.toMatchObject({ code: "forbidden" });
    await expect(fanDashboard(await viewer(s.memberId))).resolves.toBeTruthy();
    await expect(fanDashboard(await viewer(s.creatorIds.isadora))).resolves.toBeTruthy();
  });
});

describe("vault", () => {
  it("contains exactly the non-preview posts the database unlocks, with media signed for this viewer", async () => {
    const nocturne = await viewer(s.memberId);
    const { items } = await myVault(nocturne, { limit: 48 });
    const truth = await asViewer(nocturne, (q) =>
      q.query<{ id: string }>(
        `select p.id from app.posts p where p.access <> 'preview' and p.creator_id <> $1 and app.can_view_post(p.id) and p.hidden_at is null and p.published_at <= now()`,
        [nocturne.id],
      ),
    );
    expect(items.map((i) => i.id).sort()).toEqual(truth.map((t) => t.id).sort());
    expect(items.some((i) => i.via === "purchase" && i.creator.handle === "mireille")).toBe(true);
    expect(items.some((i) => i.via === "vip" && i.creator.handle === "isadora")).toBe(true);
    for (const i of items) for (const m of i.media) expect(m).toMatch(new RegExp(`^/api/media/${i.id}/\\d+\\?exp=\\d+&sig=`));
    // Velvet (no memberships) has an empty vault and can't fetch any vault media.
    const velvet = await viewer(s.member2Id);
    expect((await myVault(velvet)).items).toEqual([]);
    for (const i of items.slice(0, 5)) expect(await getEntitledMedia(velvet, i.id, 0)).toBeNull();
  });

  it("paginates and filters by creator", async () => {
    const nocturne = await viewer(s.memberId);
    const first = await myVault(nocturne, { limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.next).not.toBeNull();
    const second = await myVault(nocturne, { limit: 2, before: first.next! });
    expect(second.items.map((i) => i.id)).not.toContain(first.items[0].id);
    const only = await myVault(nocturne, { creatorHandle: "isadora", limit: 48 });
    expect(only.items.every((i) => i.creator.handle === "isadora")).toBe(true);
  });

  it("drops a post the moment it is hidden, the membership ends, or the fan is blocked", async () => {
    const nocturne = await viewer(s.memberId);
    const isadora = await viewer(s.creatorIds.isadora);
    const id = await createPost(isadora, live);
    expect((await myVault(nocturne, { limit: 48 })).items.some((i) => i.id === id)).toBe(true);
    await asViewer(await viewer(s.ownerId), (q) => q.query(`update app.posts set hidden_at = now(), hidden_reason = 'review' where id = $1`, [id]));
    expect((await myVault(nocturne, { limit: 48 })).items.some((i) => i.id === id)).toBe(false);
    await system((q) => q.query(`update app.subscriptions set current_period_end = now() - interval '1 minute' where fan_id = $1 and creator_id = $2`, [nocturne.id, isadora.id]));
    expect((await myVault(nocturne, { creatorHandle: "isadora" })).items).toEqual([]);
    const zaraItems = (await myVault(nocturne, { creatorHandle: "zara" })).items.length;
    expect(zaraItems).toBeGreaterThan(0);
    await blockUser(nocturne, s.creatorIds.zara);
    expect((await myVault(nocturne, { creatorHandle: "zara" })).items).toEqual([]);
  });
});

describe("purchases", () => {
  it("shows the live entitlement state and never a price", async () => {
    const nocturne = await viewer(s.memberId);
    const [p] = await myPurchases(nocturne);
    expect(p).toMatchObject({ state: "available" });
    expect(p.teaser).toBeTruthy();
    expect(JSON.stringify(p)).not.toMatch(/price|amount|cents/i);
    await asViewer(await viewer(s.ownerId), (q) => q.query(`update app.posts set hidden_at = now(), hidden_reason = 'review' where id = $1`, [p.postId]));
    expect((await myPurchases(nocturne))[0]).toMatchObject({ state: "under_review", teaser: null, creator: null });
    await asViewer(await viewer(s.ownerId), (q) => q.query(`update app.posts set hidden_at = null, hidden_reason = null where id = $1`, [p.postId]));
    await blockUser(nocturne, s.creatorIds.mireille);
    expect((await myPurchases(nocturne))[0]).toMatchObject({ state: "unavailable", teaser: null });
  });

  it("other people's purchases are invisible (app and RLS)", async () => {
    expect(await myPurchases(await viewer(s.member2Id))).toEqual([]);
    expect(await asViewer({ id: s.member2Id, aal: 1 }, (q) => q.query(`select * from app.my_purchase_states()`))).toHaveLength(0);
    expect(await asViewer({ id: s.member2Id, aal: 1 }, (q) => q.query(`select * from app.purchases`))).toHaveLength(0);
    expect(await rlsError(s.member2Id, `insert into app.purchases (fan_id, post_id) select $1, id from app.posts limit 1`, [s.member2Id], 1)).toBe("42501");
  });
});

describe("subscriptions", () => {
  it("cancel at period end keeps access until the end; resume undoes it", async () => {
    const nocturne = await viewer(s.memberId);
    const subs = await mySubscriptions(nocturne);
    const isa = subs.find((x) => x.creator?.handle === "isadora")!;
    expect(isa).toMatchObject({ state: "active", tierKind: "vip", canceledAt: null });
    await setSubscriptionCancel(nocturne, isa.id, true);
    const after = (await mySubscriptions(nocturne)).find((x) => x.id === isa.id)!;
    expect(after.state).toBe("ending");
    expect(after.periodEnd).toBe(isa.periodEnd);
    expect((await myVault(nocturne, { creatorHandle: "isadora" })).items.length).toBeGreaterThan(0);
    await expect(setSubscriptionCancel(nocturne, isa.id, true)).rejects.toMatchObject({ code: "conflict" });
    await setSubscriptionCancel(nocturne, isa.id, false);
    expect((await mySubscriptions(nocturne)).find((x) => x.id === isa.id)!.state).toBe("active");
    const actions = await system((q) => q.query<{ action: string }>(`select action from app.audit_log where target_id = $1 order by id`, [isa.id]));
    expect(actions.map((a) => a.action)).toEqual(["subscription.cancel", "subscription.resume"]);
  });

  it("ended memberships can't be changed; derived state is correct", async () => {
    const nocturne = await viewer(s.memberId);
    const isa = (await mySubscriptions(nocturne)).find((x) => x.creator?.handle === "isadora")!;
    await system((q) => q.query(`update app.subscriptions set current_period_end = now() - interval '1 day' where id = $1`, [isa.id]));
    expect((await mySubscriptions(nocturne)).find((x) => x.id === isa.id)!.state).toBe("ended");
    await expect(setSubscriptionCancel(nocturne, isa.id, true)).rejects.toMatchObject({ code: "conflict" });
    expect(subscriptionState({ status: "canceled", cancel_at_period_end: false, current_period_end: new Date(Date.now() + 1e6) })).toBe("ended");
  });

  it("nobody can cancel someone else's membership or write subscriptions directly", async () => {
    const isa = (await mySubscriptions(await viewer(s.memberId))).find((x) => x.creator?.handle === "isadora")!;
    await expect(setSubscriptionCancel(await viewer(s.member2Id), isa.id, true)).rejects.toMatchObject({ code: "not_found" });
    const r = await asViewer({ id: s.member2Id, aal: 1 }, (q) => q.one<{ ok: boolean }>(`select app.set_my_subscription_cancel($1, true) as ok`, [isa.id]));
    expect(r!.ok).toBe(false);
    expect(await rlsError(s.memberId, `update app.subscriptions set current_period_end = now() + interval '10 years' where id = $1`, [isa.id], 1)).toBe("42501");
    expect(await rlsError(s.memberId, `update app.subscriptions set cancel_at_period_end = true where id = $1`, [isa.id], 1)).toBe("42501");
    expect(await rlsError(s.creatorIds.isadora, `update app.subscriptions set status = 'canceled' where id = $1`, [isa.id], 1)).toBe("42501");
  });
});

describe("following", () => {
  it("lists followed creators that are visible", async () => {
    const f = await myFollowing(await viewer(s.memberId));
    expect(f.map((c) => c.handle).sort()).toEqual(["kaiasol", "valentin"]);
  });
});

describe("notifications", () => {
  it("publishing notifies followers and members, not the creator, and never carries post content", async () => {
    const isadora = await viewer(s.creatorIds.isadora);
    const nocturne = await viewer(s.memberId);
    const velvet = await viewer(s.member2Id);
    const id = await createPost(isadora, live);
    const [n] = await myNotifications(nocturne);
    expect(n).toMatchObject({ kind: "post.published", read: false, creator: { handle: "isadora" } });
    expect(n.detail).toContain("New letter for members");
    expect(JSON.stringify(n)).not.toContain("Members-only words.");
    expect(await myNotifications(velvet)).toEqual([]);
    expect(await myNotifications(isadora)).toEqual([]);
    const raw = await system((q) => q.query<{ data: object }>(`select data from app.notifications where post_id = $1`, [id]));
    expect(raw.every((r) => JSON.stringify(r.data) === "{}")).toBe(true);
  });

  it("scheduled posts notify only once live; un-publishing and hiding remove them; drafts never notify", async () => {
    const isadora = await viewer(s.creatorIds.isadora);
    const nocturne = await viewer(s.memberId);
    await createPost(isadora, { ...live, teaser: "Draft", publish: "draft" });
    const later = await createPost(isadora, { ...live, teaser: "Later", publish: "schedule", scheduleAt: new Date(Date.now() + 3_600_000) });
    expect(await myNotifications(nocturne)).toEqual([]);
    // Time passes: the post goes live (the trigger re-files the notification at its publish time).
    await system((q) => q.query(`update app.posts set published_at = now() - interval '1 second' where id = $1`, [later]));
    expect((await myNotifications(nocturne)).map((x) => x.detail)).toEqual([expect.stringContaining("Later")]);
    await updatePost(isadora, later, { ...live, teaser: "Later", publish: "draft" });
    expect(await myNotifications(nocturne)).toEqual([]);
    const now = await createPost(isadora, { ...live, teaser: "Now" });
    await asViewer(await viewer(s.ownerId), (q) => q.query(`update app.posts set hidden_at = now(), hidden_reason = 'x' where id = $1`, [now]));
    expect(await myNotifications(nocturne)).toEqual([]);
  });

  it("blocked fans get nothing; blocking later hides existing ones", async () => {
    const isadora = await viewer(s.creatorIds.isadora);
    const nocturne = await viewer(s.memberId);
    await createPost(isadora, live);
    expect(await myNotifications(nocturne)).toHaveLength(1);
    await blockUser(nocturne, isadora.id);
    expect(await myNotifications(nocturne)).toEqual([]);
    await createPost(isadora, { ...live, teaser: "After block" });
    expect(await system((q) => q.query(`select 1 from app.notifications n join app.posts p on p.id = n.post_id where n.user_id = $1 and p.teaser = 'After block'`, [nocturne.id]))).toHaveLength(0);
  });

  it("read state: mark one, mark all, unread count; only your own", async () => {
    const isadora = await viewer(s.creatorIds.isadora);
    const nocturne = await viewer(s.memberId);
    await createPost(isadora, { ...live, teaser: "One" });
    await createPost(isadora, { ...live, teaser: "Two" });
    expect(await unreadCount(nocturne)).toBe(2);
    const [a] = await myNotifications(nocturne);
    await markRead(nocturne, a.id);
    expect(await unreadCount(nocturne)).toBe(1);
    await expect(markRead(await viewer(s.member2Id), a.id)).rejects.toMatchObject({ code: "not_found" });
    expect(await markAllRead(nocturne)).toBe(1);
    expect(await unreadCount(nocturne)).toBe(0);
    expect((await myNotifications(nocturne, { unreadOnly: true }))).toEqual([]);
  });

  it("RLS: no inserting, no reading others', no changing anything but read_at", async () => {
    const isadora = await viewer(s.creatorIds.isadora);
    await createPost(isadora, live);
    const n = (await myNotifications(await viewer(s.memberId)))[0];
    expect(await rlsError(s.member2Id, `insert into app.notifications (user_id, kind) values ($1, 'system')`, [s.member2Id], 1)).toBe("42501");
    expect(await rlsError(s.memberId, `delete from app.notifications where id = $1`, [n.id], 1)).toBe("42501");
    expect(await rlsError(s.memberId, `update app.notifications set kind = 'system' where id = $1`, [n.id], 1)).toBe("42501");
    expect(await asViewer({ id: s.member2Id, aal: 1 }, (q) => q.query(`select * from app.notifications`))).toHaveLength(0);
    await asViewer({ id: s.member2Id, aal: 1 }, (q) => q.query(`update app.notifications set read_at = now() where id = $1`, [n.id]));
    expect((await myNotifications(await viewer(s.memberId)))[0].read).toBe(false);
  });

  it("house proposals notify the creator; future kinds can be delivered by the server only", async () => {
    await proposeProfile(await viewer(s.ownerId), s.creatorIds.rhea, { tagline: "Draft from the house" });
    const rhea = await viewer(s.creatorIds.rhea);
    expect((await myNotifications(rhea)).map((x) => x.kind)).toEqual(["proposal.received"]);
    await deliverNotification({ userId: s.member2Id, kind: "system", data: { title: "Welcome to the club" } });
    expect((await myNotifications(await viewer(s.member2Id)))[0]).toMatchObject({ kind: "system", title: "Welcome to the club" });
  });
});
