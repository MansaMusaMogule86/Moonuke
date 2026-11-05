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

type Row = { id: string; access: PostAccess; price_cents: number | null; teaser: string; body: string | null; media_kind: StudioPost["mediaKind"]; media_count: number; published_at: Date | null; hidden_at: Date | null; purchased: boolean; updated_at: Date };
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
});
const SELECT = `select p.id, p.access, p.price_cents, p.teaser, pc.body, p.media_kind, p.media_count, p.published_at, p.hidden_at,
                       app.post_has_purchases(p.id) as purchased, p.updated_at
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
    await q.query(`update app.post_content set body = $2 where post_id = $1`, [id, p.body || null]);
    await audit(q, { actorId: creator.id, action: "post.update", targetType: "post", targetId: id, metadata: { access: p.access, state: stateOf(publishedAt) } });
  });
}

export async function deletePost(creator: Viewer, id: string): Promise<void> {
  assertCreator(creator);
  await asViewer(creator, async (q) => {
    const cur = await q.one<{ purchased: boolean }>(`select app.post_has_purchases(id) as purchased from app.posts where id = $1 and creator_id = $2`, [id, creator.id]);
    if (!cur) throw new AppError("not_found", "Post not found.");
    if (cur.purchased) throw new AppError("conflict", "This post has been bought, so it can't be deleted.");
    const r = await q.one(`delete from app.posts where id = $1 and creator_id = $2 returning 1`, [id, creator.id]);
    if (!r) throw new AppError("not_found", "Post not found.");
    await audit(q, { actorId: creator.id, action: "post.delete", targetType: "post", targetId: id });
  });
}
