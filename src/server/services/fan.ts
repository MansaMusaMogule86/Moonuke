import "server-only";
import { asViewer } from "@/server/db";
import type { Viewer } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { signMediaUrl } from "@/server/media/sign";
import { formatMoney } from "@/server/payments";
import type { PortraitStudy } from "@/components/ui/Portrait";
import { formatCreatorPublicName } from "@/lib/creatorName";
import { audit } from "./audit";
import { discover, type CreatorCard } from "./club";

// =====================================================================
// Fan app — dashboard, vault, purchases, subscriptions.
// Everything is read as the viewer under RLS; entitlement is decided by the
// database (can_view_post / has_active_sub), never by this code.
// Payments are inactive: nothing here charges, renews or refunds.
// =====================================================================

/** Members and creators are fans; the owner is an administrator only (D8). */
export function assertFan(v: Viewer) {
  if (!(v.role === "member" || v.role === "creator") || v.status !== "active") throw new AppError("forbidden", "Not allowed.");
}

export type CreatorRef = { id: string; handle: string; displayName: string; discipline: string; cover: PortraitStudy };

export type SubscriptionState = "active" | "ending" | "ended";
export type FanSubscription = {
  id: string;
  state: SubscriptionState;
  tierName: string;
  tierKind: "member" | "vip";
  periodEnd: string;
  canceledAt: string | null;
  startedAt: string;
  /** Null when the creator is no longer visible to this fan (blocked, suspended, unpublished). */
  creator: CreatorRef | null;
};

type SubRow = {
  id: string; status: string; cancel_at_period_end: boolean; canceled_at: Date | null; current_period_end: Date; created_at: Date;
  tier_name: string; tier_kind: "member" | "vip";
  creator_id: string | null; handle: string | null; display_name: string | null; discipline: string | null; cover: PortraitStudy | null;
};

const creatorOf = (r: { creator_id: string | null; handle: string | null; display_name: string | null; discipline: string | null; cover: PortraitStudy | null }): CreatorRef | null =>
  r.creator_id && r.handle ? { id: r.creator_id, handle: r.handle, displayName: formatCreatorPublicName(r.display_name), discipline: r.discipline!, cover: r.cover! } : null;

export function subscriptionState(r: { status: string; cancel_at_period_end: boolean; current_period_end: Date }, now = Date.now()): SubscriptionState {
  if (r.status !== "active" || new Date(r.current_period_end).getTime() <= now) return "ended";
  return r.cancel_at_period_end ? "ending" : "active";
}

export async function mySubscriptions(viewer: Viewer): Promise<FanSubscription[]> {
  assertFan(viewer);
  return asViewer(viewer, async (q) => {
    // Tier names are read through a join the subscription row already
    // authorises; the creator card is RLS-filtered and may be null.
    const rows = await q.query<SubRow>(
      `select s.id, s.status::text as status, s.cancel_at_period_end, s.canceled_at, s.current_period_end, s.created_at,
              t.name as tier_name, t.kind::text as tier_kind,
              c.user_id as creator_id, c.handle::text as handle, c.display_name, c.discipline, c.cover
         from app.subscriptions s
         left join app.tiers t on t.id = s.tier_id
         left join app.creators c on c.user_id = s.creator_id
        where s.fan_id = $1
        order by (s.status = 'active' and s.current_period_end > now()) desc, s.current_period_end desc
        limit 200`,
      [viewer.id],
    );
    return rows.map((r) => ({
      id: r.id,
      state: subscriptionState(r),
      tierName: r.tier_name ?? "Membership",
      tierKind: r.tier_kind ?? "member",
      periodEnd: new Date(r.current_period_end).toISOString(),
      canceledAt: r.canceled_at ? new Date(r.canceled_at).toISOString() : null,
      startedAt: new Date(r.created_at).toISOString(),
      creator: creatorOf(r),
    }));
  });
}

/**
 * Cancel at period end (or undo). Access continues until the period ends.
 * No refund or charge happens: payments are inactive.
 */
export async function setSubscriptionCancel(viewer: Viewer, subscriptionId: string, cancel: boolean): Promise<void> {
  assertFan(viewer);
  await asViewer(viewer, async (q) => {
    const r = await q.one<{ ok: boolean }>(`select app.set_my_subscription_cancel($1, $2) as ok`, [subscriptionId, cancel]);
    if (!r?.ok) {
      const s = await q.one<{ status: string; cancel_at_period_end: boolean; current_period_end: Date }>(
        `select status::text as status, cancel_at_period_end, current_period_end from app.subscriptions where id = $1 and fan_id = $2`,
        [subscriptionId, viewer.id],
      );
      if (!s) throw new AppError("not_found", "Subscription not found.");
      if (subscriptionState(s) === "ended") throw new AppError("conflict", "This membership has already ended.");
      throw new AppError("conflict", cancel ? "This membership is already set to end." : "This membership is already set to continue.");
    }
    await audit(q, { actorId: viewer.id, action: cancel ? "subscription.cancel" : "subscription.resume", targetType: "subscription", targetId: subscriptionId });
  });
}

// ---------------------------------------------------------------- following

export async function myFollowing(viewer: Viewer): Promise<CreatorRef[]> {
  assertFan(viewer);
  return asViewer(viewer, async (q) =>
    (
      await q.query<{ creator_id: string; handle: string; display_name: string; discipline: string; cover: PortraitStudy }>(
        `select c.user_id as creator_id, c.handle::text as handle, c.display_name, c.discipline, c.cover
           from app.follows f join app.creators c on c.user_id = f.creator_id
          where f.fan_id = $1 and c.published_at is not null
          order by f.created_at desc limit 200`,
        [viewer.id],
      )
    ).map((r) => creatorOf(r)!),
  );
}

// ---------------------------------------------------------------- vault

export type VaultItem = {
  id: string;
  access: "members" | "vip" | "ppv";
  /** Why the fan has it. Derived from the database, not from the client. */
  via: "purchase" | "vip" | "membership";
  teaser: string;
  body: string | null;
  mediaKind: "image" | "set" | "video";
  mediaCount: number;
  publishedAt: string;
  media: string[];
  creator: CreatorRef;
};

/**
 * Everything the fan has unlocked beyond free previews: members and VIP posts
 * of active memberships, and pay-per-view posts they own. post_content is
 * only readable when can_view_post() is true, so the inner join IS the
 * entitlement check; media URLs are signed for this viewer only.
 */
export async function myVault(viewer: Viewer, opts: { creatorHandle?: string; before?: string; limit?: number } = {}): Promise<{ items: VaultItem[]; next: string | null }> {
  assertFan(viewer);
  const limit = Math.min(Math.max(opts.limit ?? 24, 1), 48);
  const before = opts.before && !Number.isNaN(Date.parse(opts.before)) ? new Date(opts.before) : null;
  return asViewer(viewer, async (q) => {
    const rows = await q.query<{
      id: string; access: VaultItem["access"]; teaser: string; body: string | null; media_kind: VaultItem["mediaKind"]; media_count: number;
      published_at: Date; media: unknown[]; purchased: boolean;
      creator_id: string; handle: string; display_name: string; discipline: string; cover: PortraitStudy;
    }>(
      `select p.id, p.access::text as access, p.teaser, pc.body, p.media_kind, p.media_count, p.published_at, pc.media,
              exists (select 1 from app.purchases x where x.post_id = p.id and x.fan_id = $1) as purchased,
              c.user_id as creator_id, c.handle::text as handle, c.display_name, c.discipline, c.cover
         from app.posts p
         join app.post_content pc on pc.post_id = p.id
         join app.creators c on c.user_id = p.creator_id
        where p.access <> 'preview' and p.creator_id <> $1 and p.hidden_at is null
          and p.published_at <= now()
          and ($2::text is null or c.handle = $2::citext)
          and ($3::timestamptz is null or p.published_at < $3)
        order by p.published_at desc, p.id
        limit $4`,
      [viewer.id, opts.creatorHandle ?? null, before, limit + 1],
    );
    const page = rows.slice(0, limit);
    return {
      items: page.map((r) => ({
        id: r.id,
        access: r.access,
        via: r.purchased ? "purchase" : r.access === "vip" ? "vip" : "membership",
        teaser: r.teaser,
        body: r.body,
        mediaKind: r.media_kind,
        mediaCount: r.media_count,
        publishedAt: new Date(r.published_at).toISOString(),
        media: (r.media ?? []).map((_, i) => signMediaUrl(r.id, i, viewer.id)),
        creator: creatorOf(r)!,
      })),
      next: rows.length > limit ? new Date(page[page.length - 1].published_at).toISOString() : null,
    };
  });
}

// ---------------------------------------------------------------- purchases

export type PurchaseState = "available" | "under_review" | "unavailable";
export type FanPurchase = {
  id: string;
  postId: string;
  purchasedAt: string;
  state: PurchaseState;
  /** Only present when the post is available to this fan right now. */
  teaser: string | null;
  creator: CreatorRef | null;
};

/**
 * Purchase history with the entitlement as it stands NOW (decided in the
 * database). The amount paid isn't recorded because no payment has ever been
 * processed; the UI says so rather than guessing from today's price.
 */
export async function myPurchases(viewer: Viewer): Promise<FanPurchase[]> {
  assertFan(viewer);
  return asViewer(viewer, async (q) => {
    const rows = await q.query<{
      id: string; post_id: string; created_at: Date; unlocked: boolean; under_review: boolean; creator_visible: boolean; teaser: string | null;
      creator_id: string | null; handle: string | null; display_name: string | null; discipline: string | null; cover: PortraitStudy | null;
    }>(
      `select s.id, s.post_id, s.created_at, s.unlocked, s.under_review, s.creator_visible, p.teaser,
              c.user_id as creator_id, c.handle::text as handle, c.display_name, c.discipline, c.cover
         from app.my_purchase_states() s
         left join app.posts p on p.id = s.post_id
         left join app.creators c on c.user_id = p.creator_id
        order by s.created_at desc limit 500`,
    );
    return rows.map((r) => {
      const state: PurchaseState = r.unlocked && !r.under_review && r.creator_visible ? "available" : r.under_review ? "under_review" : "unavailable";
      const open = state === "available";
      return {
        id: r.id,
        postId: r.post_id,
        purchasedAt: new Date(r.created_at).toISOString(),
        state,
        // Teaser and creator come from RLS-filtered joins, and only when available.
        teaser: open ? r.teaser : null,
        creator: open ? creatorOf(r) : null,
      };
    });
  });
}

// ---------------------------------------------------------------- dashboard

export type FanDashboard = {
  memberships: FanSubscription[];
  following: CreatorRef[];
  latest: VaultItem[];
  counts: { vault: number; purchases: number; unread: number };
};

export async function fanDashboard(viewer: Viewer): Promise<FanDashboard> {
  assertFan(viewer);
  const [subs, following, vault, purchases] = [await mySubscriptions(viewer), await myFollowing(viewer), await myVault(viewer, { limit: 6 }), await myPurchases(viewer)];
  const counts = await asViewer(viewer, async (q) =>
    q.one<{ vault: number; unread: number }>(
      `select (select count(*)::int from app.posts p join app.post_content pc on pc.post_id = p.id
                where p.access <> 'preview' and p.creator_id <> $1 and p.hidden_at is null and p.published_at <= now()) as vault,
              (select count(*)::int from app.notifications where user_id = $1 and read_at is null) as unread`,
      [viewer.id],
    ),
  );
  return {
    memberships: subs.filter((s) => s.state !== "ended"),
    following,
    latest: vault.items,
    counts: { vault: counts?.vault ?? 0, purchases: purchases.length, unread: counts?.unread ?? 0 },
  };
}

// ---------------------------------------------------------------- Home Feed (Followed & Subscribed Creators)

export type HomeFeedItem = {
  id: string;
  access: "preview" | "members" | "vip" | "ppv";
  teaser: string;
  mediaKind: "image" | "set" | "video";
  mediaCount: number;
  publishedAt: string;
  priceLabel: string | null;
  unlocked: boolean;
  purchased: boolean;
  body?: string | null;
  media?: string[];
  creator: CreatorRef;
  requiredTier: { id: string; kind: "member" | "vip"; priceLabel: string } | null;
};

export type HomeFeed = {
  items: HomeFeedItem[];
  hasConnections: boolean;
  recommendedCreators: CreatorCard[];
};

export async function myHomeFeed(viewer: Viewer, opts: { limit?: number } = {}): Promise<HomeFeed> {
  assertFan(viewer);
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 60);

  const feedData = await asViewer(viewer, async (q) => {
    const conn = await q.one<{ count: number }>(
      `select (
         (select count(*)::int from app.follows f join app.creators c on c.user_id = f.creator_id where f.fan_id = $1 and c.published_at is not null)
         +
         (select count(*)::int from app.subscriptions s join app.creators c on c.user_id = s.creator_id where s.fan_id = $1 and s.status = 'active' and s.current_period_end > now() and c.published_at is not null)
       )::int as count`,
      [viewer.id],
    );
    const hasConnections = (conn?.count ?? 0) > 0;

    const rows = await q.query<{
      id: string;
      access: HomeFeedItem["access"];
      teaser: string;
      media_kind: HomeFeedItem["mediaKind"];
      media_count: number;
      published_at: Date;
      price_cents: number | null;
      currency: string;
      unlocked: boolean;
      purchased: boolean;
      body: string | null;
      media: unknown[] | null;
      creator_id: string;
      handle: string;
      display_name: string;
      discipline: string;
      cover: PortraitStudy;
      req_tier_id: string | null;
      req_tier_kind: "member" | "vip" | null;
      req_tier_price: number | null;
      req_tier_currency: string | null;
    }>(
      `select p.id, p.access::text as access, p.teaser, p.media_kind, p.media_count, p.published_at,
              p.price_cents, p.currency,
              (pc.post_id is not null) as unlocked,
              exists (select 1 from app.purchases pu where pu.post_id = p.id and pu.fan_id = $1) as purchased,
              pc.body, pc.media,
              c.user_id as creator_id, c.handle::text as handle, c.display_name, c.discipline, c.cover,
              rt.id as req_tier_id, rt.kind::text as req_tier_kind, rt.price_cents as req_tier_price, rt.currency as req_tier_currency
         from app.posts p
         join app.creators c on c.user_id = p.creator_id
         left join app.post_content pc on pc.post_id = p.id
         left join lateral (
           select t.id, t.kind, t.price_cents, t.currency
             from app.tiers t
            where t.creator_id = p.creator_id
              and t.active
              and (
                (p.access = 'members' and t.kind = 'member')
                or (p.access = 'vip' and t.kind = 'vip')
              )
            order by t.price_cents asc
            limit 1
         ) rt on true
        where p.creator_id <> $1
          and p.hidden_at is null
          and p.published_at <= now()
          and (
            exists (select 1 from app.follows f where f.fan_id = $1 and f.creator_id = p.creator_id)
            or exists (
              select 1 from app.subscriptions s
               where s.fan_id = $1 and s.creator_id = p.creator_id
                 and s.status = 'active' and s.current_period_end > now()
            )
            or exists (select 1 from app.purchases pu where pu.fan_id = $1 and pu.post_id = p.id)
          )
        order by p.published_at desc, p.id
        limit $2`,
      [viewer.id, limit],
    );

    const items: HomeFeedItem[] = rows.map((r) => {
      const base: HomeFeedItem = {
        id: r.id,
        access: r.access,
        teaser: r.teaser,
        mediaKind: r.media_kind,
        mediaCount: r.media_count,
        publishedAt: new Date(r.published_at).toISOString(),
        priceLabel: r.price_cents != null ? formatMoney({ amountCents: r.price_cents, currency: r.currency }) : null,
        unlocked: r.unlocked,
        purchased: r.purchased,
        creator: creatorOf(r)!,
        requiredTier:
          r.req_tier_id && r.req_tier_kind && r.req_tier_price != null
            ? {
                id: r.req_tier_id,
                kind: r.req_tier_kind,
                priceLabel: formatMoney({ amountCents: r.req_tier_price, currency: r.req_tier_currency ?? "USD" }),
              }
            : null,
      };
      if (!r.unlocked) return base;
      return {
        ...base,
        body: r.body,
        media: (r.media ?? []).map((_, i) => signMediaUrl(r.id, i, viewer.id)),
      };
    });

    return { items, hasConnections };
  });

  const recommendedCreators = feedData.hasConnections ? [] : (await discover(viewer, { sort: "featured" })).slice(0, 6);
  return {
    items: feedData.items,
    hasConnections: feedData.hasConnections,
    recommendedCreators,
  };
}

// ---------------------------------------------------------------- Unlocked Messages & Transaction History (My Access)

export type UnlockedMessageItem = {
  id: string;
  messageId: string;
  conversationId: string;
  unlockedAt: string;
  body: string | null;
  previewText: string | null;
  mediaKind: string;
  priceLabel: string;
  creator: CreatorRef | null;
};

export async function myUnlockedMessages(viewer: Viewer): Promise<UnlockedMessageItem[]> {
  assertFan(viewer);
  return asViewer(viewer, async (q) => {
    const rows = await q.query<{
      id: string;
      message_id: string;
      conversation_id: string;
      created_at: Date;
      body: string | null;
      preview_text: string | null;
      media_kind: string | null;
      price_cents: number | null;
      creator_id: string | null;
      handle: string | null;
      display_name: string | null;
      discipline: string | null;
      cover: PortraitStudy | null;
    }>(
      `select mp.id, mp.message_id, m.conversation_id, mp.created_at,
              m.body, m.preview_text, m.media_kind, m.price_cents,
              c.user_id as creator_id, c.handle::text as handle, c.display_name, c.discipline, c.cover
         from app.message_purchases mp
         join app.messages m on m.id = mp.message_id
         join app.conversations conv on conv.id = m.conversation_id
         left join app.creators c on c.user_id = conv.creator_id
        where mp.fan_id = $1
          and m.status = 'sent'
        order by mp.created_at desc
        limit 200`,
      [viewer.id],
    );

    return rows.map((r) => ({
      id: r.id,
      messageId: r.message_id,
      conversationId: r.conversation_id,
      unlockedAt: new Date(r.created_at).toISOString(),
      body: r.body,
      previewText: r.preview_text,
      mediaKind: r.media_kind ?? "text",
      priceLabel: formatMoney({ amountCents: r.price_cents ?? 0, currency: "USD" }),
      creator: creatorOf(r),
    }));
  });
}

export type TransactionReceipt = {
  id: string;
  kind: "subscription" | "ppv" | "paid_message" | "tip";
  kindLabel: string;
  billingType: "recurring" | "one_time";
  title: string;
  creatorName: string;
  creatorHandle: string | null;
  amountLabel: string | null;
  currency: string;
  status: string;
  createdAt: string;
  href: string | null;
};

export async function myTransactionHistory(viewer: Viewer): Promise<TransactionReceipt[]> {
  assertFan(viewer);
  return asViewer(viewer, async (q) => {
    const receipts = await q.query<{
      id: string;
      kind: "subscription" | "ppv" | "paid_message" | "tip";
      creator_id: string;
      target_id: string | null;
      amount_cents: number;
      currency: string;
      status: string;
      created_at: Date;
      display_name: string | null;
      handle: string | null;
      post_teaser: string | null;
      tier_name: string | null;
      msg_preview: string | null;
      msg_conv_id: string | null;
    }>(
      `select r.id, r.kind::text as kind, r.creator_id, r.target_id, r.amount_cents, r.currency, r.status, r.created_at,
              c.display_name, c.handle::text as handle,
              p.teaser as post_teaser,
              t.name as tier_name,
              mq.preview_text as msg_preview,
              mq.conversation_id as msg_conv_id
         from app.my_payment_receipts() r
         left join app.creators c on c.user_id = r.creator_id
         left join app.posts p on r.kind = 'ppv' and p.id = r.target_id
         left join app.tiers t on r.kind = 'subscription' and t.id = r.target_id
         left join lateral (
           select qm.preview_text, qm.conversation_id
             from app.paid_message_quote(r.target_id) qm
            where r.kind = 'paid_message' and r.target_id is not null
         ) mq on true
        order by r.created_at desc
        limit 100`,
    );

    const out: TransactionReceipt[] = receipts.map((r) => {
      const creatorName = r.display_name ? formatCreatorPublicName(r.display_name) : "Diva Creator";
      const amountLabel = formatMoney({ amountCents: r.amount_cents, currency: r.currency });
      const kindLabel =
        r.kind === "subscription"
          ? "Recurring subscription"
          : r.kind === "paid_message"
            ? "One-time message unlock"
            : "One-time post unlock";
      const title =
        r.kind === "subscription"
          ? `${r.tier_name ?? "Membership"} · ${creatorName}`
          : r.kind === "paid_message"
            ? r.msg_preview ?? `Exclusive message from ${creatorName}`
            : r.post_teaser ?? `Unlocked post from ${creatorName}`;
      const href =
        r.kind === "paid_message" && r.msg_conv_id
          ? `/messages/${r.msg_conv_id}`
          : r.handle
            ? r.kind === "ppv" && r.target_id
              ? `/c/${r.handle}#post-${r.target_id}`
              : `/c/${r.handle}`
            : null;
      return {
        id: r.id,
        kind: r.kind,
        kindLabel,
        billingType: r.kind === "subscription" ? "recurring" : "one_time",
        title,
        creatorName,
        creatorHandle: r.handle,
        amountLabel,
        currency: r.currency,
        status: r.status,
        createdAt: new Date(r.created_at).toISOString(),
        href,
      };
    });

    // Include any seeded/pre-existing post purchases not yet backed by a payment row
    const coveredPostIds = new Set(
      receipts.filter((r) => r.kind === "ppv" && r.status === "succeeded" && r.target_id).map((r) => r.target_id!),
    );
    const legacyPurchases = await myPurchases(viewer);
    for (const lp of legacyPurchases) {
      if (coveredPostIds.has(lp.postId)) continue;
      out.push({
        id: lp.id,
        kind: "ppv",
        kindLabel: "One-time post unlock",
        billingType: "one_time",
        title: lp.teaser ?? "Unlocked post",
        creatorName: lp.creator?.displayName ?? "Diva Creator",
        creatorHandle: lp.creator?.handle ?? null,
        amountLabel: null,
        currency: "USD",
        status: lp.state === "available" ? "succeeded" : lp.state,
        createdAt: lp.purchasedAt,
        href: lp.creator ? `/c/${lp.creator.handle}#post-${lp.postId}` : null,
      });
    }

    return out.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  });
}

// ---------------------------------------------------------------- Account Notification Preferences

export type UserPreferences = {
  notifyNewPosts: boolean;
  notifyMessages: boolean;
  notifyBilling: boolean;
  notifyTips: boolean;
  notifySubscriptions: boolean;
  notifyReferrals: boolean;
  notifyPayouts: boolean;
  notifySecurity: boolean;
  emailDigest: "off" | "daily" | "weekly";
  timezone: string;
};

export async function getUserPreferences(viewer: Viewer): Promise<UserPreferences> {
  return asViewer(viewer, async (q) => {
    const r = await q.one<{
      notify_new_posts: boolean;
      notify_messages: boolean;
      notify_billing: boolean;
      notify_tips: boolean;
      notify_subscriptions: boolean;
      notify_referrals: boolean;
      notify_payouts: boolean;
      notify_security: boolean;
      email_digest: "off" | "daily" | "weekly";
      timezone: string;
    }>(
      `select notify_new_posts, notify_messages, notify_billing, notify_tips, notify_subscriptions,
              notify_referrals, notify_payouts, notify_security, email_digest, timezone
         from app.user_preferences
        where user_id = $1`,
      [viewer.id],
    );
    return {
      notifyNewPosts: r?.notify_new_posts ?? true,
      notifyMessages: r?.notify_messages ?? true,
      notifyBilling: r?.notify_billing ?? true,
      notifyTips: r?.notify_tips ?? true,
      notifySubscriptions: r?.notify_subscriptions ?? true,
      notifyReferrals: r?.notify_referrals ?? true,
      notifyPayouts: r?.notify_payouts ?? true,
      notifySecurity: r?.notify_security ?? true,
      emailDigest: r?.email_digest ?? "off",
      timezone: r?.timezone ?? "UTC",
    };
  });
}

export async function saveUserPreferences(viewer: Viewer, prefs: UserPreferences): Promise<void> {
  const digest = prefs.emailDigest === "daily" || prefs.emailDigest === "weekly" ? prefs.emailDigest : "off";
  const tz = prefs.timezone.trim().slice(0, 60) || "UTC";
  await asViewer(viewer, async (q) => {
    await q.query(
      `insert into app.user_preferences (user_id, notify_new_posts, notify_messages, notify_billing, notify_tips,
              notify_subscriptions, notify_referrals, notify_payouts, notify_security, email_digest, timezone, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
       on conflict (user_id) do update
          set notify_new_posts = excluded.notify_new_posts,
              notify_messages = excluded.notify_messages,
              notify_billing = excluded.notify_billing,
              notify_tips = excluded.notify_tips,
              notify_subscriptions = excluded.notify_subscriptions,
              notify_referrals = excluded.notify_referrals,
              notify_payouts = excluded.notify_payouts,
              notify_security = excluded.notify_security,
              email_digest = excluded.email_digest,
              timezone = excluded.timezone,
              updated_at = now()`,
      [
        viewer.id,
        prefs.notifyNewPosts,
        prefs.notifyMessages,
        prefs.notifyBilling,
        prefs.notifyTips,
        prefs.notifySubscriptions,
        prefs.notifyReferrals,
        prefs.notifyPayouts,
        prefs.notifySecurity,
        digest,
        tz,
      ],
    );
  });
}
