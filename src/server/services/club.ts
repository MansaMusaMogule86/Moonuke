import "server-only";
import { asViewer } from "@/server/db";
import { can, type Viewer } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { signMediaUrl } from "@/server/media/sign";
import { formatMoney, providerFor, type Money } from "@/server/payments";
import type { PortraitStudy } from "@/components/ui/Portrait";
import { formatCreatorPublicName } from "@/lib/creatorName";
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
  member_from_cents: number | null;
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
  const rows = await asViewer(viewer, (q) =>
    q.query<CreatorCard>(
      `select * from (
         select c.user_id as id, c.handle::text as handle, c.display_name, c.discipline, c.category, c.city, c.tagline,
                c.featured, c.cover, c.created_at,
                coalesce((select s.members from app.creator_stats(c.user_id) s), 0) as members,
                (select min(t.price_cents) from app.tiers t where t.creator_id = c.user_id and t.kind = 'member' and t.active) as member_from_cents,
                (select min(t.price_cents) from app.tiers t where t.creator_id = c.user_id and t.kind = 'vip' and t.active) as vip_from_cents,
                coalesce(
                  (select t.currency from app.tiers t where t.creator_id = c.user_id and t.active order by t.price_cents limit 1),
                  'USD'
                ) as currency
           from app.creators c
          where c.visibility = 'listed'
            and ($1::text is null or c.display_name ilike $1 or c.creator_name ilike $1 or c.handle::text ilike $1 or c.discipline ilike $1 or c.city ilike $1 or c.tagline ilike $1)
            and ($2::text is null or c.category = $2)
       ) c
       order by ${order}
       limit 48`,
      [opts.q ? `%${likeEscape(opts.q)}%` : null, opts.category ?? null],
    ),
  );
  return rows.map((r) => ({ ...r, display_name: formatCreatorPublicName(r.display_name) }));
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
      displayName: formatCreatorPublicName(c.display_name),
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

// ---------------------------------------------------------------- checkout quote

export type QuoteTarget = { kind: "tier" | "post" | "message"; id: string };

export type Quote = {
  kind: "tier" | "post" | "message";
  targetId: string;
  creatorId: string;
  creatorName: string;
  creatorHandle: string;
  title: string;
  subtitle: string;
  itemDescription: string;
  amountCents: number;
  currency: string;
  amountLabel: string;
  feeLabel: string;
  totalLabel: string;
  cadence: string | null;
  accessTerms: string;
  supportedMethods: string[];
  sandboxAvailable: boolean;
  available: false;
  reason: string;
};

/**
 * Prices come only from the database; the client sends an id, never an amount.
 * Live processor availability (`available`) remains false until an approved
 * processor is configured; in non-production environments `sandboxAvailable`
 * enables verified sandbox payment simulation through the ledger engine.
 */
export async function quote(viewer: Viewer, target: QuoteTarget): Promise<Quote> {
  assertClub(viewer);
  const sandboxAvailable = process.env.NODE_ENV !== "production" && process.env.SANDBOX_CHECKOUT_ENABLED !== "false";
  const supportedMethods = sandboxAvailable ? ["Sandbox Card •••• 4242 (Verified Test Checkout)"] : [];

  return asViewer(viewer, async (q) => {
    if (target.kind === "tier") {
      const t = await q.one<{
        id: string;
        kind: string;
        name: string;
        price_cents: number;
        currency: string;
        seat_limit: number | null;
        seats_taken: number | null;
        display_name: string;
        handle: string;
        creator_id: string;
      }>(
        `select t.id, t.kind, t.name, t.price_cents, t.currency, t.seat_limit,
                app.tier_seats_taken(t.id) as seats_taken,
                c.display_name, c.handle::text as handle, c.user_id as creator_id
           from app.tiers t
           join app.creators c on c.user_id = t.creator_id
          where t.id = $1 and t.active`,
        [target.id],
      );
      if (!t) throw new AppError("not_found", "This membership is no longer available.");
      if (t.creator_id === viewer.id) throw new AppError("validation", "You can't join your own membership.");
      if (t.seat_limit != null && (t.seats_taken ?? 0) >= t.seat_limit) throw new AppError("conflict", "Every VIP seat is taken right now.");
      const provider = providerFor("subscription");
      const creatorName = formatCreatorPublicName(t.display_name);
      const amountLabel = formatMoney({ amountCents: t.price_cents, currency: t.currency });
      return {
        kind: "tier",
        targetId: t.id,
        creatorId: t.creator_id,
        creatorName,
        creatorHandle: t.handle,
        title: `${t.name} · ${creatorName}`,
        subtitle: t.kind === "vip" ? "VIP membership" : "Membership",
        itemDescription:
          t.kind === "vip"
            ? `Monthly VIP membership to ${creatorName} (includes all Member and VIP subscription posts; individual pay-per-view posts and locked messages are sold separately).`
            : `Monthly membership to ${creatorName} (includes all Member subscription posts; VIP posts, individual pay-per-view posts, and locked messages are sold separately).`,
        amountCents: t.price_cents,
        currency: t.currency,
        amountLabel,
        feeLabel: formatMoney({ amountCents: 0, currency: t.currency }),
        totalLabel: amountLabel,
        cadence: "per month",
        accessTerms: "Renews monthly until canceled. Cancel anytime from My Access.",
        supportedMethods,
        sandboxAvailable,
        available: false as const,
        reason: provider ? "Checkout is disabled in this build." : "Live card processing requires FEATURE_PAYMENTS=on and an approved payment provider adapter.",
      };
    }

    if (target.kind === "message") {
      const m = await q.one<{
        message_id: string;
        conversation_id: string;
        creator_id: string;
        fan_id: string;
        price_cents: number;
        preview_text: string;
        media_kind: string;
        unlocked: boolean;
      }>(`select * from app.paid_message_quote($1)`, [target.id]);
      if (!m) throw new AppError("not_found", "Locked message not found.");
      if (m.creator_id === viewer.id) throw new AppError("validation", "You sent this message.");
      if (m.unlocked) throw new AppError("conflict", "You already unlocked this message.");
      const c = await q.one<{ display_name: string; handle: string }>(
        `select display_name, handle::text as handle from app.creators where user_id = $1`,
        [m.creator_id],
      );
      const creatorName = formatCreatorPublicName(c?.display_name);
      const currency = "USD";
      const amountLabel = formatMoney({ amountCents: m.price_cents, currency });
      return {
        kind: "message",
        targetId: m.message_id,
        creatorId: m.creator_id,
        creatorName,
        creatorHandle: c?.handle ?? "",
        title: m.preview_text,
        subtitle: `Exclusive message unlock · ${creatorName}`,
        itemDescription: `One-time unlock for exclusive ${m.media_kind || "message"} from ${creatorName} in your private conversation.`,
        amountCents: m.price_cents,
        currency,
        amountLabel,
        feeLabel: formatMoney({ amountCents: 0, currency }),
        totalLabel: amountLabel,
        cadence: null,
        accessTerms: "One-time purchase. Permanent access in your conversation and My Access.",
        supportedMethods,
        sandboxAvailable,
        available: false as const,
        reason: "Live card processing requires FEATURE_PAYMENTS=on and an approved payment provider adapter.",
      };
    }

    const p = await q.one<{
      id: string;
      access: string;
      price_cents: number | null;
      currency: string;
      teaser: string;
      display_name: string;
      handle: string;
      creator_id: string;
      unlocked: boolean;
    }>(
      `select p.id, p.access, p.price_cents, p.currency, p.teaser,
              c.display_name, c.handle::text as handle, c.user_id as creator_id,
              app.can_view_post(p.id) as unlocked
         from app.posts p
         join app.creators c on c.user_id = p.creator_id
        where p.id = $1`,
      [target.id],
    );
    if (!p) throw new AppError("not_found", "Post not found.");
    if (p.access !== "ppv" || p.price_cents == null) throw new AppError("validation", "This post isn't sold individually.");
    if (p.creator_id === viewer.id) throw new AppError("validation", "You own this post.");
    if (p.unlocked) throw new AppError("conflict", "You already have this post.");
    const creatorName = formatCreatorPublicName(p.display_name);
    const amountLabel = formatMoney({ amountCents: p.price_cents, currency: p.currency });
    return {
      kind: "post",
      targetId: p.id,
      creatorId: p.creator_id,
      creatorName,
      creatorHandle: p.handle,
      title: p.teaser,
      subtitle: `Single unlock · ${creatorName}`,
      itemDescription: `One-time pay-per-view post unlock from ${creatorName}.`,
      amountCents: p.price_cents,
      currency: p.currency,
      amountLabel,
      feeLabel: formatMoney({ amountCents: 0, currency: p.currency }),
      totalLabel: amountLabel,
      cadence: null,
      accessTerms: "One-time purchase. Permanent access on the creator profile and in My Access.",
      supportedMethods,
      sandboxAvailable,
      available: false as const,
      reason: "Live card processing requires FEATURE_PAYMENTS=on and an approved payment provider adapter.",
    };
  });
}
