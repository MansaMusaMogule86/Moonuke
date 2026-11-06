import "server-only";
import { asViewer } from "@/server/db";
import { sha256 } from "@/server/auth/crypto";
import type { Viewer } from "@/server/auth/permissions";
import { checkText } from "@/server/ai/safety";
import { AppError } from "@/server/errors";
import type { PortraitStudy } from "@/components/ui/Portrait";
import { audit } from "./audit";

// =====================================================================
// Creator studio — posts. Drafts, scheduling and publishing.
// Media stays placeholder (no storage yet): the server derives a study from
// the post id; clients never send media.
// =====================================================================

export const POST_LIMITS = {
  teaser: 140,
  body: 5000,
  /** PPV price bounds in cents. Default pending commercial decisions (P1). */
  priceMin: 100,
  priceMax: 100_000,
  setMax: 50,
  scheduleMaxDays: 365,
} as const;

export type PostAccess = "preview" | "members" | "vip" | "ppv";
export type PostState = "draft" | "scheduled" | "published";
export type StudioPost = {
  id: string;
  access: PostAccess;
  priceCents: number | null;
  teaser: string;
  body: string;
  mediaKind: "image" | "set" | "video";
  mediaCount: number;
  publishedAt: string | null;
  state: PostState;
  hidden: boolean;
  purchased: boolean;
  updatedAt: string;
  /** Pre-publication review: not_required | pending | approved | rejected. */
  review: "not_required" | "pending" | "approved" | "rejected";
  reviewNote: string | null;
  hiddenReason: string | null;
};

export type PostInput = {
  access: PostAccess;
  priceCents?: number | null;
  teaser: string;
  body?: string;
  mediaKind: "image" | "set" | "video";
  mediaCount?: number;
  /** draft: unpublished; now: publish immediately; schedule: publish at `scheduleAt`. */
  publish: "draft" | "now" | "schedule";
  scheduleAt?: Date;
};

function assertCreator(v: Viewer) {
  if (v.role !== "creator" || v.status !== "active") throw new AppError("forbidden", "Not allowed.");
}

function studyFor(postId: string): PortraitStudy {
  const b = sha256(`post:${postId}`);
  return {
    hair: (["long", "bun", "crop", "wrap"] as const)[b[0] % 4],
    adorn: (["hoops", "crown", "collar", "none"] as const)[b[1] % 4],
    light: b[2] % 2 ? "left" : "right",
    tilt: (b[3] % 9) - 4,
    glow: 0.55 + (b[4] % 40) / 100,
  };
}

const stateOf = (publishedAt: Date | null, now = Date.now()): PostState =>
  publishedAt == null ? "draft" : publishedAt.getTime() > now ? "scheduled" : "published";

/** Validate and normalise; every rule here is also enforced (or stricter) in the database. */
export function normalizePost(input: PostInput, now = new Date()) {
  const teaser = input.teaser?.trim() ?? "";
  const body = (input.body ?? "").trim();
  if (!teaser) throw new AppError("validation", "Add a teaser — it's what members see before unlocking.", "teaser");
  if (teaser.length > POST_LIMITS.teaser) throw new AppError("validation", `Keep the teaser under ${POST_LIMITS.teaser} characters.`, "teaser");
  if (body.length > POST_LIMITS.body) throw new AppError("validation", `Keep the post under ${POST_LIMITS.body} characters.`, "body");
  if (!["preview", "members", "vip", "ppv"].includes(input.access)) throw new AppError("validation", "Choose who can see this.", "access");
  if (!["image", "set", "video"].includes(input.mediaKind)) throw new AppError("validation", "Choose a format.", "mediaKind");

  let priceCents: number | null = null;
  if (input.access === "ppv") {
    const p = input.priceCents;
    if (p == null || !Number.isInteger(p) || p < POST_LIMITS.priceMin || p > POST_LIMITS.priceMax) {
      throw new AppError("validation", `Set a price between $${POST_LIMITS.priceMin / 100} and $${(POST_LIMITS.priceMax / 100).toLocaleString("en")}.`, "price");
    }
    priceCents = p;
  }

  const mediaCount = input.mediaKind === "set" ? Math.trunc(input.mediaCount ?? 0) : 1;
  if (input.mediaKind === "set" && (mediaCount < 2 || mediaCount > POST_LIMITS.setMax)) {
    throw new AppError("validation", `A set has 2 to ${POST_LIMITS.setMax} pieces.`, "mediaCount");
  }

  let publishedAt: Date | null = null;
  if (input.publish === "now") publishedAt = now;
  else if (input.publish === "schedule") {
    const at = input.scheduleAt;
    if (!at || Number.isNaN(at.getTime())) throw new AppError("validation", "Choose when to publish.", "scheduleAt");
    if (at.getTime() <= now.getTime() + 60_000) throw new AppError("validation", "Choose a time at least a minute from now.", "scheduleAt");
    if (at.getTime() > now.getTime() + POST_LIMITS.scheduleMaxDays * 86_400_000) throw new AppError("validation", "Schedule within the next year.", "scheduleAt");
    publishedAt = at;
  } else if (input.publish !== "draft") throw new AppError("validation", "Choose when to publish.", "publish");

  const verdict = checkText(teaser, body);
  if (!verdict.ok) throw new AppError("validation", "That post can't be published here. Remove any reference to minors, youth or non-consent.", "body");

  return { access: input.access, priceCents, teaser, body, mediaKind: input.mediaKind, mediaCount, publishedAt };
}

type Row = { id: string; access: PostAccess; price_cents: number | null; teaser: string; body: string | null; media_kind: StudioPost["mediaKind"]; media_count: number; published_at: Date | null; hidden_at: Date | null; purchased: boolean; updated_at: Date; review_state: StudioPost["review"]; review_note: string | null; hidden_reason: string | null };
const toPost = (r: Row): StudioPost => ({
  id: r.id,
  access: r.access,
  priceCents: r.price_cents,
  teaser: r.teaser,
  body: r.body ?? "",
  mediaKind: r.media_kind,
  mediaCount: r.media_count,
  publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
  state: stateOf(r.published_at ? new Date(r.published_at) : null),
  hidden: !!r.hidden_at,
  purchased: r.purchased,
  updatedAt: new Date(r.updated_at).toISOString(),
  review: r.review_state,
  reviewNote: r.review_note,
  hiddenReason: r.hidden_reason,
});
const SELECT = `select p.id, p.access, p.price_cents, p.teaser, pc.body, p.media_kind, p.media_count, p.published_at, p.hidden_at,
                       app.post_has_purchases(p.id) as purchased, p.updated_at, p.review_state, p.review_note, p.hidden_reason
                  from app.posts p left join app.post_content pc on pc.post_id = p.id`;

export async function myPosts(creator: Viewer): Promise<StudioPost[]> {
  assertCreator(creator);
  return asViewer(creator, async (q) =>
    (await q.query<Row>(`${SELECT} where p.creator_id = $1 order by coalesce(p.published_at, p.updated_at) desc limit 200`, [creator.id])).map(toPost),
  );
}

export async function myPost(creator: Viewer, id: string): Promise<StudioPost | null> {
  assertCreator(creator);
  const r = await asViewer(creator, (q) => q.one<Row>(`${SELECT} where p.id = $1 and p.creator_id = $2`, [id, creator.id]));
  return r ? toPost(r) : null;
}

const dbError = (e: unknown): never => {
  const code = (e as { code?: string }).code;
  const hint = (e as { hint?: string }).hint;
  if (hint === "legal_hold") throw new AppError("conflict", "This post is preserved for a legal reason, so it can't be changed or deleted.");
  if (hint === "blocked_media") throw new AppError("validation", "This media can't be published here.");
  if (code === "42501") throw new AppError("conflict", "This post has been bought, so its access and publish time are fixed.");
  if (code === "23503") throw new AppError("validation", "Save your profile first.");
  throw e;
};

export async function createPost(creator: Viewer, input: PostInput): Promise<string> {
  assertCreator(creator);
  const p = normalizePost(input);
  return asViewer(creator, async (q) => {
    const profile = await q.one(`select 1 from app.creators where user_id = $1`, [creator.id]);
    if (!profile) throw new AppError("validation", "Save your profile first.");
    const row = await q
      .one<{ id: string }>(
        `insert into app.posts (creator_id, access, price_cents, teaser, media_kind, media_count, published_at) values ($1, $2, $3, $4, $5, $6, $7) returning id`,
        [creator.id, p.access, p.priceCents, p.teaser, p.mediaKind, p.mediaCount, p.publishedAt],
      )
      .catch(dbError);
    await q.query(`insert into app.post_content (post_id, body, media) values ($1, $2, $3)`, [row!.id, p.body || null, JSON.stringify([{ study: studyFor(row!.id) }])]);
    await audit(q, { actorId: creator.id, action: "post.create", targetType: "post", targetId: row!.id, metadata: { access: p.access, state: stateOf(p.publishedAt) } });
    return row!.id;
  });
}

export async function updatePost(creator: Viewer, id: string, input: PostInput): Promise<void> {
  assertCreator(creator);
  const p = normalizePost(input);
  await asViewer(creator, async (q) => {
    const cur = await q.one<{ published_at: Date | null; purchased: boolean; hidden_at: Date | null }>(
      `select published_at, hidden_at, app.post_has_purchases(id) as purchased from app.posts where id = $1 and creator_id = $2`,
      [id, creator.id],
    );
    if (!cur) throw new AppError("not_found", "Post not found.");
    // Editing an already-published post keeps its original publish time.
    // (Kept in SQL: JS Dates would drop Postgres microseconds.)
    const keep = input.publish === "now" && !!cur.published_at && cur.published_at.getTime() <= Date.now();
    const publishedAt = keep ? cur.published_at : p.publishedAt;
    const r = await q
      .one(
        `update app.posts set access = $3, price_cents = $4, teaser = $5, media_kind = $6, media_count = $7,
                published_at = case when $9::boolean then published_at else $8::timestamptz end
          where id = $1 and creator_id = $2 returning 1`,
        [id, creator.id, p.access, p.priceCents, p.teaser, p.mediaKind, p.mediaCount, p.publishedAt, keep],
      )
      .catch(dbError);
    if (!r) throw new AppError("not_found", "Post not found.");
    await q.query(`update app.post_content set body = $2 where post_id = $1`, [id, p.body || null]).catch(dbError);
    await audit(q, { actorId: creator.id, action: "post.update", targetType: "post", targetId: id, metadata: { access: p.access, state: stateOf(publishedAt) } });
  });
}

export async function deletePost(creator: Viewer, id: string): Promise<void> {
  assertCreator(creator);
  await asViewer(creator, async (q) => {
    const cur = await q.one<{ purchased: boolean }>(`select app.post_has_purchases(id) as purchased from app.posts where id = $1 and creator_id = $2`, [id, creator.id]);
    if (!cur) throw new AppError("not_found", "Post not found.");
    if (cur.purchased) throw new AppError("conflict", "This post has been bought, so it can't be deleted.");
    const r = await q.one(`delete from app.posts where id = $1 and creator_id = $2 returning 1`, [id, creator.id]).catch(dbError);
    if (!r) throw new AppError("not_found", "Post not found.");
    await audit(q, { actorId: creator.id, action: "post.delete", targetType: "post", targetId: id });
  });
}

// =====================================================================
// Creator studio — membership tiers. Prices are quoted, never charged.
// =====================================================================
export const TIER_LIMITS = { name: 40, perks: 8, perk: 80, priceMin: 100, priceMax: 100_000, maxTiers: 8, seatMax: 100_000 } as const;

export type StudioTier = {
  id: string;
  kind: "member" | "vip";
  name: string;
  priceCents: number;
  perks: string[];
  seatLimit: number | null;
  seatsTaken: number;
  active: boolean;
  sort: number;
  hasSubscribers: boolean;
};
export type TierInput = { kind: "member" | "vip"; name: string; priceCents: number; perks: string[]; seatLimit: number | null; active: boolean };

export function normalizeTier(input: TierInput): TierInput {
  const name = input.name?.trim().replace(/\s+/g, " ") ?? "";
  if (!name) throw new AppError("validation", "Name the tier.", "name");
  if (name.length > TIER_LIMITS.name) throw new AppError("validation", `Keep the name under ${TIER_LIMITS.name} characters.`, "name");
  if (!["member", "vip"].includes(input.kind)) throw new AppError("validation", "Choose a tier type.", "kind");
  const p = input.priceCents;
  if (!Number.isInteger(p) || p < TIER_LIMITS.priceMin || p > TIER_LIMITS.priceMax) {
    throw new AppError("validation", `Set a monthly price between $${TIER_LIMITS.priceMin / 100} and $${(TIER_LIMITS.priceMax / 100).toLocaleString("en")}.`, "price");
  }
  const perks = (input.perks ?? []).map((x) => x.trim().replace(/\s+/g, " ")).filter(Boolean);
  if (perks.length > TIER_LIMITS.perks) throw new AppError("validation", `Up to ${TIER_LIMITS.perks} perks.`, "perks");
  if (perks.some((x) => x.length > TIER_LIMITS.perk)) throw new AppError("validation", `Keep each perk under ${TIER_LIMITS.perk} characters.`, "perks");
  if (new Set(perks.map((x) => x.toLowerCase())).size !== perks.length) throw new AppError("validation", "Each perk should be different.", "perks");
  const seat = input.seatLimit;
  if (seat != null && (!Number.isInteger(seat) || seat < 1 || seat > TIER_LIMITS.seatMax)) {
    throw new AppError("validation", "Seats must be a whole number of 1 or more, or left empty for unlimited.", "seatLimit");
  }
  const verdict = checkText(name, ...perks);
  if (!verdict.ok) throw new AppError("validation", "That copy can't be used here. Remove any reference to minors, youth or non-consent.", "name");
  return { kind: input.kind, name, priceCents: p, perks, seatLimit: seat ?? null, active: !!input.active };
}

type TierRow = { id: string; kind: "member" | "vip"; name: string; price_cents: number; perks: string[]; seat_limit: number | null; seats_taken: number | null; active: boolean; sort: number; has_subscribers: boolean };

export async function myTiers(creator: Viewer): Promise<StudioTier[]> {
  assertCreator(creator);
  return asViewer(creator, async (q) =>
    (
      await q.query<TierRow>(
        `select id, kind, name, price_cents, perks, seat_limit, app.tier_seats_taken(id) as seats_taken, active, sort,
                app.tier_has_subscribers(id) as has_subscribers
           from app.tiers where creator_id = $1 order by kind, sort, price_cents`,
        [creator.id],
      )
    ).map((r) => ({
      id: r.id, kind: r.kind, name: r.name, priceCents: r.price_cents, perks: r.perks, seatLimit: r.seat_limit,
      seatsTaken: r.seats_taken ?? 0, active: r.active, sort: r.sort, hasSubscribers: r.has_subscribers,
    })),
  );
}

const tierDbError = (e: unknown): never => {
  const err = e as { code?: string; message?: string };
  if (err.code === "23505") throw new AppError("conflict", "You already have a tier with that name.", "name");
  if (err.code === "23514" && /seat/.test(err.message ?? "")) throw new AppError("validation", "That's fewer seats than current members.", "seatLimit");
  if (err.code === "42501") throw new AppError("conflict", "This tier has members, so its type is fixed.", "kind");
  if (err.code === "23503") throw new AppError("validation", "Save your profile first.");
  throw e;
};

async function otherActiveTiers(q: { one: <R>(t: string, p?: unknown[]) => Promise<R | undefined> }, creatorId: string, id: string) {
  const r = await q.one<{ n: number }>(`select count(*)::int as n from app.tiers where creator_id = $1 and active and id <> $2`, [creatorId, id]);
  return r?.n ?? 0;
}

export async function createTier(creator: Viewer, input: TierInput): Promise<string> {
  assertCreator(creator);
  const t = normalizeTier(input);
  return asViewer(creator, async (q) => {
    const profile = await q.one(`select 1 from app.creators where user_id = $1`, [creator.id]);
    if (!profile) throw new AppError("validation", "Save your profile first.");
    const n = await q.one<{ n: number }>(`select count(*)::int as n from app.tiers where creator_id = $1`, [creator.id]);
    if ((n?.n ?? 0) >= TIER_LIMITS.maxTiers) throw new AppError("conflict", `You can have up to ${TIER_LIMITS.maxTiers} tiers. Edit or remove one first.`);
    const row = await q
      .one<{ id: string }>(
        `insert into app.tiers (creator_id, kind, name, price_cents, perks, seat_limit, active, sort)
         values ($1, $2, $3, $4, $5, $6, $7, coalesce((select max(sort) + 1 from app.tiers where creator_id = $1), 1)) returning id`,
        [creator.id, t.kind, t.name, t.priceCents, t.perks, t.seatLimit, t.active],
      )
      .catch(tierDbError);
    await audit(q, { actorId: creator.id, action: "tier.create", targetType: "tier", targetId: row!.id, metadata: { kind: t.kind, priceCents: t.priceCents } });
    return row!.id;
  });
}

export async function updateTier(creator: Viewer, id: string, input: TierInput): Promise<void> {
  assertCreator(creator);
  const t = normalizeTier(input);
  await asViewer(creator, async (q) => {
    const cur = await q.one<{ price_cents: number; active: boolean }>(`select price_cents, active from app.tiers where id = $1 and creator_id = $2`, [id, creator.id]);
    if (!cur) throw new AppError("not_found", "Tier not found.");
    if (cur.active && !t.active && !(await otherActiveTiers(q, creator.id, id))) {
      throw new AppError("validation", "Keep at least one tier active so members can join.", "active");
    }
    await q
      .query(`update app.tiers set kind = $3, name = $4, price_cents = $5, perks = $6, seat_limit = $7, active = $8 where id = $1 and creator_id = $2`, [
        id, creator.id, t.kind, t.name, t.priceCents, t.perks, t.seatLimit, t.active,
      ])
      .catch(tierDbError);
    await audit(q, { actorId: creator.id, action: "tier.update", targetType: "tier", targetId: id, metadata: { priceFrom: cur.price_cents, priceTo: t.priceCents, active: t.active } });
  });
}

export async function deleteTier(creator: Viewer, id: string): Promise<void> {
  assertCreator(creator);
  await asViewer(creator, async (q) => {
    const cur = await q.one<{ has: boolean; active: boolean }>(`select app.tier_has_subscribers(id) as has, active from app.tiers where id = $1 and creator_id = $2`, [id, creator.id]);
    if (!cur) throw new AppError("not_found", "Tier not found.");
    if (cur.has) throw new AppError("conflict", "This tier has had members, so it can't be deleted. Turn it off instead.");
    if (cur.active && !(await otherActiveTiers(q, creator.id, id))) throw new AppError("validation", "Keep at least one tier active so members can join.");
    const r = await q.one(`delete from app.tiers where id = $1 and creator_id = $2 returning 1`, [id, creator.id]);
    if (!r) throw new AppError("not_found", "Tier not found.");
    await audit(q, { actorId: creator.id, action: "tier.delete", targetType: "tier", targetId: id });
  });
}

// =====================================================================
// Creator studio — analytics from existing data only (Phase 5c).
// Aggregates only: never fan identities, no view tracking, no money figures
// (payments are inactive, so revenue would be fiction).
// =====================================================================
export type StudioAnalytics = {
  members: { active: number; vip: number; new30: number };
  followers: { total: number; new30: number };
  weeks: { weekStart: string; members: number; followers: number }[];
  tiers: { id: string; name: string; kind: "member" | "vip"; active: boolean; members: number; seatLimit: number | null }[];
  posts: { published: number; scheduled: number; draft: number; hidden: number; byAccess: Record<PostAccess, number> };
  unlocks: { postId: string; teaser: string; unlocks: number }[];
};

export const ANALYTICS_WEEKS = 8;

export async function myAnalytics(creator: Viewer): Promise<StudioAnalytics> {
  assertCreator(creator);
  return asViewer(creator, async (q) => {
    const m = await q.one<{ active: number; vip: number; new30: number }>(
      `select count(*) filter (where s.status = 'active' and s.current_period_end > now())::int as active,
              count(*) filter (where s.status = 'active' and s.current_period_end > now() and t.kind = 'vip')::int as vip,
              count(*) filter (where s.created_at > now() - interval '30 days')::int as new30
         from app.subscriptions s join app.tiers t on t.id = s.tier_id where s.creator_id = $1`,
      [creator.id],
    );
    const f = await q.one<{ total: number; new30: number }>(
      `select count(*)::int as total, count(*) filter (where created_at > now() - interval '30 days')::int as new30 from app.follows where creator_id = $1`,
      [creator.id],
    );
    const weeks = await q.query<{ week_start: Date; members: number; followers: number }>(
      `with w as (select generate_series(date_trunc('week', now()) - interval '${ANALYTICS_WEEKS - 1} weeks', date_trunc('week', now()), interval '1 week') as week_start)
       select w.week_start,
              (select count(*)::int from app.subscriptions s where s.creator_id = $1 and s.created_at >= w.week_start and s.created_at < w.week_start + interval '1 week') as members,
              (select count(*)::int from app.follows x where x.creator_id = $1 and x.created_at >= w.week_start and x.created_at < w.week_start + interval '1 week') as followers
         from w order by w.week_start`,
      [creator.id],
    );
    const tiers = await q.query<{ id: string; name: string; kind: "member" | "vip"; active: boolean; members: number; seat_limit: number | null }>(
      `select t.id, t.name, t.kind, t.active, t.seat_limit,
              (select count(*)::int from app.subscriptions s where s.tier_id = t.id and s.status = 'active' and s.current_period_end > now()) as members
         from app.tiers t where t.creator_id = $1 order by t.kind, t.sort`,
      [creator.id],
    );
    const p = await q.one<{ published: number; scheduled: number; draft: number; hidden: number; preview: number; members: number; vip: number; ppv: number }>(
      `select count(*) filter (where published_at <= now())::int as published,
              count(*) filter (where published_at > now())::int as scheduled,
              count(*) filter (where published_at is null)::int as draft,
              count(*) filter (where hidden_at is not null)::int as hidden,
              count(*) filter (where access = 'preview')::int as preview,
              count(*) filter (where access = 'members')::int as members,
              count(*) filter (where access = 'vip')::int as vip,
              count(*) filter (where access = 'ppv')::int as ppv
         from app.posts where creator_id = $1`,
      [creator.id],
    );
    const unlocks = await q.query<{ post_id: string; teaser: string; unlocks: number }>(
      `select u.post_id, p.teaser, u.unlocks from app.my_post_unlocks() u join app.posts p on p.id = u.post_id order by u.unlocks desc, p.published_at desc nulls last limit 20`,
    );
    return {
      members: { active: m?.active ?? 0, vip: m?.vip ?? 0, new30: m?.new30 ?? 0 },
      followers: { total: f?.total ?? 0, new30: f?.new30 ?? 0 },
      weeks: weeks.map((w) => ({ weekStart: new Date(w.week_start).toISOString(), members: w.members, followers: w.followers })),
      tiers: tiers.map((t) => ({ id: t.id, name: t.name, kind: t.kind, active: t.active, members: t.members, seatLimit: t.seat_limit })),
      posts: {
        published: p?.published ?? 0,
        scheduled: p?.scheduled ?? 0,
        draft: p?.draft ?? 0,
        hidden: p?.hidden ?? 0,
        byAccess: { preview: p?.preview ?? 0, members: p?.members ?? 0, vip: p?.vip ?? 0, ppv: p?.ppv ?? 0 },
      },
      unlocks: unlocks.map((u) => ({ postId: u.post_id, teaser: u.teaser, unlocks: u.unlocks })),
    };
  });
}
