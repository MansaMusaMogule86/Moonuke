import "server-only";
import { asViewer } from "@/server/db";
import { can, type Viewer } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { signMediaUrl } from "@/server/media/sign";
import { formatMoney, providerFor, type Money } from "@/server/payments";
import type { PortraitStudy } from "@/components/ui/Portrait";
import { audit } from "./audit";

function assertClub(viewer: Viewer) {
  if (!can(viewer, "club.discover")) throw new AppError("forbidden", "Not allowed.");
}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

// ---------------------------------------------------------------- discovery

export type CreatorCard = {
  id: string;
  handle: string;
  display_name: string;
  discipline: string;
  category: string;
  city: string | null;
  tagline: string | null;
  featured: boolean;
  cover: PortraitStudy;
  members: number;
  vip_from_cents: number | null;
  currency: string | null;
};

export type Category = { slug: string; label: string };

export async function listCategories(viewer: Viewer): Promise<Category[]> {
  assertClub(viewer);
  return asViewer(viewer, (q) => q.query<Category>(`select slug, label from app.categories order by sort, label`));
}

/** Only `listed` creators appear — discreet and private profiles are never discoverable. */
export async function discover(
  viewer: Viewer,
  opts: { q?: string; category?: string; sort?: "featured" | "newest" | "members" },
): Promise<CreatorCard[]> {
  assertClub(viewer);
  const order =
    opts.sort === "newest" ? "c.created_at desc" : opts.sort === "members" ? "members desc, c.display_name" : "c.featured desc, members desc, c.display_name";
  return asViewer(viewer, (q) =>
    q.query<CreatorCard>(
      `select * from (
         select c.user_id as id, c.handle::text as handle, c.display_name, c.discipline, c.category, c.city, c.tagline,
                c.featured, c.cover, c.created_at,
                coalesce((select s.members from app.creator_stats(c.user_id) s), 0) as members,
                (select min(t.price_cents) from app.tiers t where t.creator_id = c.user_id and t.kind = 'vip' and t.active) as vip_from_cents,
                (select t.currency from app.tiers t where t.creator_id = c.user_id and t.kind = 'vip' and t.active order by t.price_cents limit 1) as currency
           from app.creators c
          where c.visibility = 'listed'
            and ($1::text is null or c.display_name ilike $1 or c.handle::text ilike $1 or c.discipline ilike $1 or c.city ilike $1 or c.tagline ilike $1)
            and ($2::text is null or c.category = $2)
       ) c
       order by ${order}
       limit 48`,
      [opts.q ? `%${likeEscape(opts.q)}%` : null, opts.category ?? null],
    ),
  );
}

// ---------------------------------------------------------------- profile

export type TierView = {
  id: string;
  kind: "member" | "vip";
  name: string;
  price: Money;
  priceLabel: string;
  seatLimit: number | null;
  seatsTaken: number | null;
  perks: string[];
};

export type PostView = {
  id: string;
  access: "preview" | "members" | "vip" | "ppv";
  teaser: string;
  mediaKind: "image" | "set" | "video";
  mediaCount: number;
  publishedAt: string;
  priceLabel: string | null;
  unlocked: boolean;
  /** Present only when unlocked. Locked bodies never leave the server. */
  body?: string | null;
  media?: string[];
};

export type Profile = {
  id: string;
  handle: string;
  displayName: string;
  discipline: string;
  category: string;
  city: string | null;
  tagline: string | null;
  bio: string | null;
  visibility: "listed" | "discreet" | "private";
  cover: PortraitStudy;
  stats: { members: number; followers: number; posts: number };
  tiers: TierView[];
  posts: PostView[];
  viewer: { following: boolean; tier: "member" | "vip" | null; isSelf: boolean };
};

/** Returns null when the profile doesn't exist OR the viewer may not see it (callers 404 either way). */
export async function getProfile(viewer: Viewer, handle: string): Promise<Profile | null> {
  assertClub(viewer);
  if (!/^[a-z0-9_]{2,24}$/i.test(handle)) return null;
  return asViewer(viewer, async (q) => {
    const c = await q.one<{
      user_id: string; handle: string; display_name: string; discipline: string; category: string; city: string | null;
      tagline: string | null; bio: string | null; visibility: Profile["visibility"]; cover: PortraitStudy;
    }>(
      `select user_id, handle::text as handle, display_name, discipline, category, city, tagline, bio, visibility, cover
         from app.creators where handle = $1`,
      [handle],
    );
    if (!c) return null;

    // One client per transaction: queries run sequentially by design.
    const stats = await q.one<{ members: number; followers: number }>(`select coalesce(members,0) as members, coalesce(followers,0) as followers from app.creator_stats($1)`, [c.user_id]);
    const tiers = await q.query<{ id: string; kind: "member" | "vip"; name: string; price_cents: number; currency: string; seat_limit: number | null; perks: string[]; seats_taken: number | null }>(
        `select id, kind, name, price_cents, currency, seat_limit, perks, app.tier_seats_taken(id) as seats_taken
           from app.tiers where creator_id = $1 and active order by kind, sort, price_cents`,
        [c.user_id],
      );
    const posts = await q.query<{ id: string; access: PostView["access"]; teaser: string; media_kind: PostView["mediaKind"]; media_count: number; published_at: Date; price_cents: number | null; currency: string; unlocked: boolean; body: string | null; media: unknown[] | null }>(
        `select p.id, p.access, p.teaser, p.media_kind, p.media_count, p.published_at, p.price_cents, p.currency,
                (pc.post_id is not null) as unlocked, pc.body, pc.media
           from app.posts p left join app.post_content pc on pc.post_id = p.id
          where p.creator_id = $1 and p.published_at <= now() order by p.published_at desc limit 60`,
        [c.user_id],
      );
    const sub = await q.one<{ kind: "member" | "vip" }>(
        `select t.kind from app.subscriptions s join app.tiers t on t.id = s.tier_id
          where s.fan_id = $1 and s.creator_id = $2 and s.status = 'active' and s.current_period_end > now()`,
        [viewer.id, c.user_id],
      );
    const follow = await q.one(`select 1 from app.follows where fan_id = $1 and creator_id = $2`, [viewer.id, c.user_id]);

    return {
      id: c.user_id,
      handle: c.handle,
      displayName: c.display_name,
      discipline: c.discipline,
      category: c.category,
      city: c.city,
      tagline: c.tagline,
      bio: c.bio,
      visibility: c.visibility,
      cover: c.cover,
      stats: { members: stats?.members ?? 0, followers: stats?.followers ?? 0, posts: posts.length },
      tiers: tiers.map((t) => {
        const price = { amountCents: t.price_cents, currency: t.currency };
        return { id: t.id, kind: t.kind, name: t.name, price, priceLabel: formatMoney(price), seatLimit: t.seat_limit, seatsTaken: t.seats_taken, perks: t.perks };
      }),
      posts: posts.map((p) => {
        const base: PostView = {
          id: p.id,
          access: p.access,
          teaser: p.teaser,
          mediaKind: p.media_kind,
          mediaCount: p.media_count,
          publishedAt: new Date(p.published_at).toISOString(),
          priceLabel: p.price_cents != null ? formatMoney({ amountCents: p.price_cents, currency: p.currency }) : null,
          unlocked: p.unlocked,
        };
        if (!p.unlocked) return base;
        return { ...base, body: p.body, media: (p.media ?? []).map((_, i) => signMediaUrl(p.id, i, viewer.id)) };
      }),
      viewer: { following: !!follow, tier: sub?.kind ?? null, isSelf: viewer.id === c.user_id },
    };
  });
}

/** Media lookup for the signed media route — re-checked under RLS. */
export async function getEntitledMedia(viewer: Viewer, postId: string, index: number): Promise<PortraitStudy | null> {
  if (!can(viewer, "club.discover")) return null;
  return asViewer(viewer, async (q) => {
    const row = await q.one<{ media: { study: PortraitStudy }[] }>(`select media from app.post_content where post_id = $1`, [postId]);
    return row?.media?.[index]?.study ?? null;
  });
}

// ---------------------------------------------------------------- follow

export async function setFollow(viewer: Viewer, creatorId: string, follow: boolean) {
  if (!can(viewer, "club.follow")) throw new AppError("forbidden", "Not allowed.");
  return asViewer(viewer, async (q) => {
    if (follow) {
      try {
        await q.query(`insert into app.follows (fan_id, creator_id) values ($1, $2) on conflict do nothing`, [viewer.id, creatorId]);
      } catch (e) {
        // RLS with-check failure: creator not visible to this viewer, or self-follow.
        if ((e as { code?: string }).code === "42501") throw new AppError("not_found", "Creator not found.");
        throw e;
      }
      await audit(q, { actorId: viewer.id, action: "follow.create", targetType: "creator", targetId: creatorId });
    } else {
      await q.query(`delete from app.follows where fan_id = $1 and creator_id = $2`, [viewer.id, creatorId]);
      await audit(q, { actorId: viewer.id, action: "follow.delete", targetType: "creator", targetId: creatorId });
    }
  });
}

// ---------------------------------------------------------------- checkout (quote only)

export type Quote = {
  title: string;
  subtitle: string;
  amountLabel: string;
  cadence: string | null;
  available: false;
  reason: string;
};

/**
 * Prices come only from the database; the client sends an id, never an amount.
 * With no approved provider, the quote is always unavailable.
 */
export async function quote(viewer: Viewer, target: { kind: "tier" | "post"; id: string }): Promise<Quote> {
  assertClub(viewer);
  return asViewer(viewer, async (q) => {
    if (target.kind === "tier") {
      const t = await q.one<{ id: string; kind: string; name: string; price_cents: number; currency: string; seat_limit: number | null; seats_taken: number | null; display_name: string; creator_id: string }>(
        `select t.id, t.kind, t.name, t.price_cents, t.currency, t.seat_limit, app.tier_seats_taken(t.id) as seats_taken, c.display_name, c.user_id as creator_id
           from app.tiers t join app.creators c on c.user_id = t.creator_id where t.id = $1 and t.active`,
        [target.id],
      );
      if (!t) throw new AppError("not_found", "This membership is no longer available.");
      if (t.creator_id === viewer.id) throw new AppError("validation", "You can't join your own membership.");
      if (t.seat_limit != null && (t.seats_taken ?? 0) >= t.seat_limit) throw new AppError("conflict", "Every VIP seat is taken right now.");
      const provider = providerFor("subscription");
      return {
        title: `${t.name} · ${t.display_name}`,
        subtitle: t.kind === "vip" ? "VIP membership" : "Membership",
        amountLabel: formatMoney({ amountCents: t.price_cents, currency: t.currency }),
        cadence: "per month",
        available: false as const,
        reason: provider ? "Checkout is disabled in this build." : "Payments are not active yet. No payment provider has been approved.",
      };
    }
    const p = await q.one<{ id: string; access: string; price_cents: number | null; currency: string; teaser: string; display_name: string; unlocked: boolean }>(
      `select p.id, p.access, p.price_cents, p.currency, p.teaser, c.display_name, app.can_view_post(p.id) as unlocked
         from app.posts p join app.creators c on c.user_id = p.creator_id where p.id = $1`,
      [target.id],
    );
    if (!p) throw new AppError("not_found", "Post not found.");
    if (p.access !== "ppv" || p.price_cents == null) throw new AppError("validation", "This post isn't sold individually.");
    if (p.unlocked) throw new AppError("conflict", "You already have this post.");
    return {
      title: p.teaser,
      subtitle: `Single unlock · ${p.display_name}`,
      amountLabel: formatMoney({ amountCents: p.price_cents, currency: p.currency }),
      cadence: null,
      available: false as const,
      reason: "Payments are not active yet. No payment provider has been approved.",
    };
  });
}
