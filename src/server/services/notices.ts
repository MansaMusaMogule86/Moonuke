import "server-only";
import { asViewer, system, type Q } from "@/server/db";
import { can, type Viewer } from "@/server/auth/permissions";
import { appUrl } from "@/server/env";
import { AppError } from "@/server/errors";
import { enqueue } from "@/server/email/outbox";
import { emails } from "@/server/email/templates";
import { audit, auditStaffView } from "./audit";
import { assertOwnerOrStaff, canStaff } from "@/server/auth/staff";
import { openCaseFor } from "./safeguarding";

// =====================================================================
// Statements of reasons and appeals (EU DSA Art. 17 and 20, REPORTED).
// Every house decision that restricts a creator's content issues a notice
// to that creator, inside the same transaction as the decision. The creator
// can appeal once, within APPEAL_DAYS. Requesters are never identified.
// No notice is issued while the content is under a safeguarding hold
// (it could compromise a report or an investigation).
// =====================================================================

/** DSA Art. 20(1): appeals must be possible for at least six months. */
export const APPEAL_DAYS = 183;

export type NoticeKind = "takedown_removed" | "review_rejected" | "moderation_removed" | "verification_revoked" | "consent_withdrawn";
export type Statement = { decision: string; facts: string; ground: string; automated: string; redress: string[] };

const GROUNDS: Record<string, string> = {
  ncii: "Intimate images shared without the consent of the person shown. This is prohibited by our content rules and, in the US, by the TAKE IT DOWN Act.",
  consent_withdrawn: "A person who appears in the content withdrew their consent. Our content rules require consent from everyone shown.",
  impersonation: "Impersonation of another person, which our content rules prohibit.",
  other_illegal: "Content reported as illegal, which our content rules prohibit.",
};
const REDRESS = [
  `You can appeal this decision once, within ${Math.round(APPEAL_DAYS / 30)} months, from Studio → Notices. A person reviews every appeal.`,
  "Depending on where you live, you may also be able to use a certified out-of-court dispute settlement body, or go to court.",
];

export function statementFor(kind: NoticeKind, ctx: { label?: string | null; note?: string | null; category?: string; copy?: boolean }): Statement {
  const what = ctx.label ? `“${ctx.label.slice(0, 80)}”` : "your content";
  const note = ctx.note?.trim() ? ` The house noted: “${ctx.note.trim().slice(0, 400)}”` : "";
  const person = "No. A person made this decision.";
  switch (kind) {
    case "takedown_removed":
      return {
        decision: `Your post ${what} was removed. Members can no longer see it, and the same media can't be published again.`,
        facts: ctx.copy
          ? "We acted on a valid takedown notice about other content. Your post contains identical media, so it was removed too."
          : `We received a takedown notice about this post and found it valid.${note}`,
        ground: GROUNDS[ctx.category ?? ""] ?? GROUNDS.other_illegal,
        automated: ctx.copy ? "Partly. A person decided the notice; identical copies were found automatically by matching media fingerprints." : person,
        redress: REDRESS,
      };
    case "review_rejected":
      return {
        decision: `Your post ${what} wasn't approved for publication. Members can't see it.`,
        facts: `The house reviewed the post before publication and didn't approve it.${note}`,
        ground: "Our content rules and pre-publication review.",
        automated: person,
        redress: [...REDRESS, "You can also edit the post, which sends it for review again."],
      };
    case "moderation_removed":
      return {
        decision: `Your post ${what} was hidden. Members can't see it.`,
        facts: `A report about this post was reviewed and upheld.${note}`,
        ground: "Our content rules.",
        automated: person,
        redress: REDRESS,
      };
    case "verification_revoked":
      return {
        decision: `The verification of ${what} was revoked. Posts that name them are hidden.`,
        facts: `The house reviewed this person's identity and age record and could no longer accept it.${note}`,
        ground: "Our content rules require a verified identity and age record for everyone who appears in content.",
        automated: person,
        redress: REDRESS,
      };
    case "consent_withdrawn":
      return {
        decision: `A consent recorded for ${what} was withdrawn. Posts that relied on it are hidden.`,
        facts: `The house recorded a withdrawal of consent by the person shown.${note}`,
        ground: GROUNDS.consent_withdrawn,
        automated: person,
        redress: [
          "You can appeal, but the house can't restore content without consent from the person shown. You can record a new consent if they give one.",
          REDRESS[1],
        ],
      };
  }
}

export type Issued = { id: string; userId: string };

/**
 * Issue a notice inside the owner's decision transaction. Returns null when
 * no notice is due (the content is under a safeguarding hold, the recipient
 * is the owner, or a notice for this decision already exists).
 */
export async function issueNotice(
  q: Q,
  input: { kind: NoticeKind; userId: string; postId?: string | null; participantId?: string | null; sourceType: "takedown" | "review" | "report" | "participant" | "consent"; sourceId?: string | null; label?: string | null; note?: string | null; category?: string; copy?: boolean },
): Promise<Issued | null> {
  if (input.postId) {
    const held = await q.one<{ h: boolean }>(`select app.under_hold('post', $1) as h`, [input.postId]);
    if (held?.h) return null;
  }
  const r = await q.one<{ id: string; issued_by: string }>(
    `insert into app.moderation_notices (user_id, kind, post_id, participant_id, source_type, source_id, statement, automated, appeal_until, issued_by)
     select $1, $2, $3, $4, $5, $6, $7, $8, now() + make_interval(days => $9), app.uid()
      where not app.is_owner_account($1)
     on conflict do nothing returning id, issued_by`,
    [input.userId, input.kind, input.postId ?? null, input.participantId ?? null, input.sourceType, input.sourceId ?? null,
     JSON.stringify(statementFor(input.kind, input)), !!input.copy, APPEAL_DAYS],
  );
  if (!r) return null;
  await audit(q, { actorId: r.issued_by, action: "notice.issue", targetType: "notice", targetId: r.id, metadata: { kind: input.kind } });
  return { id: r.id, userId: input.userId };
}

/** After the decision commits: an in-app notification and an email with no details. */
export async function announceNotices(issued: (Issued | null)[]) {
  const list = issued.filter((x): x is Issued => !!x);
  if (!list.length) return;
  await system(async (q) => {
    for (const n of list) {
      await q.query(`insert into app.notifications (user_id, kind, data) values ($1, 'system', $2)`, [n.userId, JSON.stringify({ title: "A decision about your content", href: "/studio/notices" })]);
      const u = await q.one<{ email: string }>(`select email::text as email from app.users where id = $1`, [n.userId]);
      if (u) await enqueue(q, u.email, emails.decisionNotice({ url: `${appUrl()}/studio/notices` }), n.userId);
    }
  });
}

// ---------------------------------------------------------------- recipient

export type NoticeRow = {
  id: string; kind: NoticeKind; post_id: string | null; statement: Statement; automated: boolean;
  appeal_until: Date; created_at: Date; read_at: Date | null;
  appeal_status: "open" | "upheld" | "overturned" | null; appeal_note: string | null; can_appeal: boolean;
};
export async function myNotices(v: Viewer): Promise<NoticeRow[]> {
  if (v.status !== "active" || v.role === "owner") throw new AppError("forbidden", "Not allowed.");
  return asViewer(v, (q) =>
    q.query<NoticeRow>(
      `select n.id, n.kind, n.post_id, n.statement, n.automated, n.appeal_until, n.created_at, n.read_at,
              a.status as appeal_status, a.decision_note as appeal_note, (a.id is null and n.appeal_until > now()) as can_appeal
         from app.moderation_notices n left join app.decision_appeals a on a.notice_id = n.id
        where n.user_id = $1 order by n.created_at desc limit 100`,
      [v.id],
    ),
  );
}

export async function unreadNotices(v: Viewer): Promise<number> {
  if (v.role !== "creator" || v.status !== "active") return 0;
  return asViewer(v, async (q) => (await q.one<{ n: number }>(`select count(*)::int as n from app.moderation_notices where user_id = $1 and read_at is null`, [v.id]))!.n);
}

export async function markNoticesRead(v: Viewer) {
  await asViewer(v, (q) => q.query(`update app.moderation_notices set read_at = now() where user_id = $1 and read_at is null`, [v.id]));
}

export async function fileAppeal(v: Viewer, noticeId: string, body: string): Promise<string> {
  if (v.status !== "active" || v.role === "owner") throw new AppError("forbidden", "Not allowed.");
  const b = body.trim();
  if (b.length < 10 || b.length > 2000) throw new AppError("validation", "Explain your appeal in 10 to 2,000 characters.", "body");
  return asViewer(v, async (q) => {
    try {
      return (await q.one<{ id: string }>(`select app.file_decision_appeal($1, $2) as id`, [noticeId, b]))!.id;
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "P0002") throw new AppError("not_found", "Notice not found.");
      if (code === "23505") throw new AppError("conflict", "You've already appealed this decision.");
      if (code === "22023") throw new AppError("validation", "The appeal window for this decision has closed.");
      throw e;
    }
  });
}

// ---------------------------------------------------------------- owner

function assertOwner(v: Viewer) {
  if (!can(v, "moderation.review")) throw new AppError("forbidden", "Not allowed.");
}

export type AppealRow = {
  id: string; body: string; created_at: Date; notice_id: string; kind: NoticeKind; statement: Statement;
  post_id: string | null; participant_id: string | null; source_id: string | null; alias: string | null;
};
/** Participant and consent cases involve identity records: owner only. */
const OWNER_ONLY_KINDS: NoticeKind[] = ["verification_revoked", "consent_withdrawn"];

export async function appealQueue(v: Viewer): Promise<AppealRow[]> {
  assertOwnerOrStaff(v, "appeals.decide");
  const staff = !can(v, "moderation.review");
  return asViewer(v, async (q) => {
    await auditStaffView(q, v, "appeals");
    // Moderators never see appeals of their own decisions, or participant cases.
    return q.query<AppealRow>(
      `select a.id, a.body, a.created_at, n.id as notice_id, n.kind, n.statement, n.post_id, n.participant_id, n.source_id, u.alias::text as alias
         from app.decision_appeals a join app.moderation_notices n on n.id = a.notice_id left join app.users u on u.id = a.user_id
        where a.status = 'open' and (not $1 or (n.issued_by is distinct from app.uid() and n.kind <> all($2::text[])))
        order by a.created_at limit 100`,
      [staff, OWNER_ONLY_KINDS],
    );
  });
}

/**
 * Decide an appeal. Overturning reverses the restriction where that's
 * possible; a decision is final either way.
 */
export async function decideAppeal(v: Viewer, appealId: string, outcome: "uphold" | "overturn", note: string, meta: { ipHash?: string | null } = {}) {
  assertOwnerOrStaff(v, "appeals.decide");
  const staff = !can(v, "moderation.review") && canStaff(v, "appeals.decide");
  const n = note.trim();
  if (n.length < 10) throw new AppError("validation", "Explain the outcome to the creator (10+ characters).", "note");
  const a = await asViewer(v, (q) =>
    q.one<{ kind: NoticeKind; post_id: string | null; participant_id: string | null; source_id: string | null; status: string; issued_by: string | null }>(
      `select n.kind, n.post_id, n.participant_id, n.source_id, a.status, n.issued_by from app.decision_appeals a join app.moderation_notices n on n.id = a.notice_id where a.id = $1`,
      [appealId],
    ),
  );
  if (!a) throw new AppError("not_found", "Appeal not found.");
  if (staff && (OWNER_ONLY_KINDS.includes(a.kind) || a.issued_by === v.id)) throw new AppError("forbidden", "Only the owner can decide this appeal.");
  if (a.status !== "open") throw new AppError("conflict", "This appeal has already been decided.");
  if (outcome === "overturn") {
    if (a.kind === "consent_withdrawn") throw new AppError("conflict", "Content can't be restored without the consent of the person shown.");
    if (a.post_id && (await openCaseFor({ postId: a.post_id }))) throw new AppError("conflict", "This content is part of a safeguarding case.");
  }
  await asViewer(v, async (q) => {
    if (outcome === "overturn") {
      const restoreErr = (e: unknown): never => {
        const hint = (e as { hint?: string }).hint;
        if (hint === "consent_invalid") throw new AppError("conflict", "A participant's consent or verification is no longer valid, so the post stays hidden.");
        if ((e as { code?: string }).code === "P0002") throw new AppError("conflict", "The decision has already changed; nothing to reverse.");
        throw e;
      };
      if (a.kind === "takedown_removed" && a.post_id) {
        await q.query(`update app.posts set hidden_at = null, hidden_reason = null where id = $1 and hidden_reason like 'Removed: takedown notice %'`, [a.post_id]).catch(restoreErr);
        await q.query(
          `delete from app.blocked_media_hashes where source_id = $2 and hash in (select unnest(app.media_hashes(media)) from app.post_content where post_id = $1)`,
          [a.post_id, a.source_id],
        );
      }
      if (a.kind === "moderation_removed" && a.post_id) {
        await q.query(`update app.posts set hidden_at = null, hidden_reason = null where id = $1`, [a.post_id]).catch(restoreErr);
      }
      if (a.kind === "review_rejected" && a.post_id) await q.query(`select app.overturn_review($1)`, [a.post_id]).catch(restoreErr);
      if (a.kind === "verification_revoked" && a.participant_id) await q.query(`select app.restore_participant($1)`, [a.participant_id]).catch(restoreErr);
    }
    await q.query(
      `update app.decision_appeals set status = $2, decision_note = $3, decided_by = app.uid(), decided_at = now() where id = $1 and status = 'open'`,
      [appealId, outcome === "overturn" ? "overturned" : "upheld", n],
    );
    await audit(q, { actorId: v.id, action: `appeal.${outcome}`, targetType: "appeal", targetId: appealId, ipHash: meta.ipHash, metadata: { kind: a.kind } });
  });
}
