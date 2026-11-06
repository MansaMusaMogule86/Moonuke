import "server-only";
import { asViewer } from "@/server/db";
import { can, type Viewer } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";

// =====================================================================
// Pre-publication review. A post waiting for review (or rejected) is
// invisible to everyone but its creator and the owner, everywhere: profile,
// vault, notifications and signed media URLs (app.can_view_post, the posts
// RLS policy and app.post_is_live all check review_state).
//
// Mode 'flagged' (default): posts naming other participants wait for review.
// Mode 'all': every new or edited post waits for review.
// =====================================================================

export type ReviewMode = "flagged" | "all";

function assertOwner(v: Viewer) {
  if (!can(v, "moderation.review")) throw new AppError("forbidden", "Not allowed.");
}

export async function reviewMode(v: Viewer): Promise<ReviewMode> {
  assertOwner(v);
  return asViewer(v, async (q) => (await q.one<{ m: ReviewMode }>(`select app.review_mode() as m`))!.m);
}

export async function setReviewMode(v: Viewer, mode: ReviewMode) {
  assertOwner(v);
  if (mode !== "flagged" && mode !== "all") throw new AppError("validation", "Choose a review mode.");
  await asViewer(v, (q) => q.query(`select app.set_review_mode($1)`, [mode]));
}

export type ReviewItem = {
  id: string; creator_name: string; handle: string; access: string; teaser: string; body: string | null;
  media_kind: string; media_count: number; published_at: Date | null; updated_at: Date; reasons: string[]; participants: number;
};
export async function reviewQueue(v: Viewer): Promise<ReviewItem[]> {
  assertOwner(v);
  return asViewer(v, (q) =>
    q.query<ReviewItem>(
      `select p.id, c.display_name as creator_name, c.handle::text as handle, p.access, p.teaser, pc.body, p.media_kind, p.media_count,
              p.published_at, p.updated_at, p.review_reasons as reasons,
              (select count(*)::int from app.post_participant_list(p.id)) as participants
         from app.posts p join app.creators c on c.user_id = p.creator_id left join app.post_content pc on pc.post_id = p.id
        where p.review_state = 'pending' and p.hidden_at is null
        order by p.updated_at limit 100`,
    ),
  );
}

export async function decideReview(v: Viewer, postId: string, approve: boolean, note?: string): Promise<"approved" | "rejected"> {
  assertOwner(v);
  if (!approve && (note?.trim().length ?? 0) < 5) throw new AppError("validation", "Tell the creator why (5+ characters).", "note");
  return asViewer(v, async (q) => {
    try {
      return (await q.one<{ s: "approved" | "rejected" }>(`select app.decide_post_review($1, $2, $3) as s`, [postId, approve, note?.trim() ?? ""]))!.s;
    } catch (e) {
      if ((e as { code?: string }).code === "P0002") throw new AppError("conflict", "This post is no longer waiting for review.");
      throw e;
    }
  });
}
