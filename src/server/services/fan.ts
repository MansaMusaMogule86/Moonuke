import "server-only";
import { asViewer } from "@/server/db";
import type { Viewer } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { signMediaUrl } from "@/server/media/sign";
import type { PortraitStudy } from "@/components/ui/Portrait";
import { audit } from "./audit";

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
  r.creator_id && r.handle ? { id: r.creator_id, handle: r.handle, displayName: r.display_name!, discipline: r.discipline!, cover: r.cover! } : null;

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
