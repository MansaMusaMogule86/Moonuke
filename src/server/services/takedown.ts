import "server-only";
import { asViewer, system, type Q } from "@/server/db";
import { can, type Viewer } from "@/server/auth/permissions";
import { appUrl } from "@/server/env";
import { AppError } from "@/server/errors";
import { enqueue } from "@/server/email/outbox";
import { emails } from "@/server/email/templates";
import { keyedHash, reference, seal, unseal } from "@/server/safety/seal";
import { audit, auditStaffView } from "./audit";
import { assertOwnerOrStaff } from "@/server/auth/staff";
import { hit, hitIp } from "./rateLimit";
import { openCase, openCaseFor } from "./safeguarding";
import { announceNotices, issueNotice, type Issued } from "./notices";

// =====================================================================
// Public takedown notices. Anyone can file one without an account; filing
// never grants access to anything and the response never reveals whether
// the reported content exists (no oracle).
//
// Clock: a valid notice must be acted on within 48 hours of receipt
// (TAKE IT DOWN Act, for non-consensual intimate imagery). We apply the same
// clock to every category. Removal also removes known identical copies (same
// media fingerprint) and blocks the fingerprint from being published again.
// =====================================================================

export const TAKEDOWN_CATEGORIES = [
  { value: "ncii", label: "Intimate images shared without consent", urgent: true },
  { value: "csam", label: "A person under 18 (child sexual abuse material)", urgent: true },
  { value: "consent_withdrawn", label: "I appear in this content and withdraw my consent", urgent: true },
  { value: "impersonation", label: "Someone is impersonating me", urgent: false },
  { value: "other_illegal", label: "Other illegal content", urgent: false },
] as const;
export type TakedownCategory = (typeof TAKEDOWN_CATEGORIES)[number]["value"];
export const REQUESTER_ROLES = [
  { value: "depicted_person", label: "I am the person shown" },
  { value: "authorized_representative", label: "I'm authorised to act for the person shown" },
  { value: "other", label: "Neither (for example, I'm reporting child abuse material)" },
] as const;
export type RequesterRole = (typeof REQUESTER_ROLES)[number]["value"];

export const TAKEDOWN_HOURS = 48;
export const TAKEDOWN_LIMITS = {
  ip: { limit: 5, windowSec: 60 * 60 },
  contact: { limit: 5, windowSec: 24 * 60 * 60 },
  location: 1000,
  description: 2000,
} as const;
const URGENT = new Set<TakedownCategory>(["ncii", "csam", "consent_withdrawn"]);

export type TakedownInput = {
  category: TakedownCategory;
  requesterRole: RequesterRole;
  name: string;
  email: string;
  signature: string;
  location: string;
  description?: string;
  goodFaith: boolean;
  /** Hidden field humans leave empty. */
  honeypot?: string;
};

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const HANDLE = /\/c\/([a-z0-9_.-]{2,40})/i;

/** Find what the notice points at. Never reported back to the requester. */
async function resolveTarget(q: Q, location: string): Promise<{ postId: string | null; creatorId: string | null; key: string }> {
  for (const id of location.match(UUID) ?? []) {
    const p = await q.one<{ id: string; creator_id: string }>(`select id, creator_id from app.posts where id = $1`, [id.toLowerCase()]);
    if (p) return { postId: p.id, creatorId: p.creator_id, key: `post:${p.id}` };
  }
  const h = location.match(HANDLE)?.[1];
  if (h) {
    const c = await q.one<{ user_id: string }>(`select user_id from app.creators where handle = $1`, [h.toLowerCase()]);
    if (c) return { postId: null, creatorId: c.user_id, key: `creator:${c.user_id}` };
  }
  const norm = location.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
  return { postId: null, creatorId: null, key: `loc:${keyedHash("takedown-loc", norm).slice(0, 40)}` };
}

export function validateTakedown(i: TakedownInput): TakedownInput {
  const name = i.name?.trim() ?? "";
  const email = i.email?.trim().toLowerCase() ?? "";
  const signature = i.signature?.trim() ?? "";
  const location = i.location?.trim() ?? "";
  const description = i.description?.trim() ?? "";
  if (!TAKEDOWN_CATEGORIES.some((c) => c.value === i.category)) throw new AppError("validation", "Choose what this is about.", "category");
  if (!REQUESTER_ROLES.some((r) => r.value === i.requesterRole)) throw new AppError("validation", "Tell us how you're connected to the content.", "requesterRole");
  if (name.length < 2 || name.length > 120) throw new AppError("validation", "Enter your name.", "name");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new AppError("validation", "Enter an email address we can reply to.", "email");
  if (location.length < 3 || location.length > TAKEDOWN_LIMITS.location) throw new AppError("validation", "Tell us where the content is (a link or a description).", "location");
  if (description.length > TAKEDOWN_LIMITS.description) throw new AppError("validation", `Keep the description under ${TAKEDOWN_LIMITS.description} characters.`, "description");
  if (!i.goodFaith) throw new AppError("validation", "Confirm the statement to continue.", "goodFaith");
  if (signature.length < 2 || signature.length > 120) throw new AppError("validation", "Type your full name as your signature.", "signature");
  if ((i.category === "ncii" || i.category === "consent_withdrawn") && i.requesterRole === "other") {
    throw new AppError("validation", "Only the person shown, or someone authorised to act for them, can file this kind of notice.", "requesterRole");
  }
  return { ...i, name, email, signature, location, description };
}

/**
 * File a notice. Returns a reference in every case (including duplicates and
 * honeypot hits), so the response can't be used to probe for content.
 */
export async function submitTakedown(raw: TakedownInput, meta: { ipHash?: string | null } = {}): Promise<{ reference: string }> {
  const i = validateTakedown(raw);
  if (i.honeypot) return { reference: reference("TD") };
  const contactHash = keyedHash("takedown-contact", i.email);
  await hitIp("takedown", meta.ipHash ?? null, TAKEDOWN_LIMITS.ip);
  await hit(`takedown:contact:${contactHash.slice(0, 22)}`, TAKEDOWN_LIMITS.contact);

  const out = await system(async (q) => {
    const t = await resolveTarget(q, i.location);
    // Same person, same target, still open: return the existing reference.
    const mine = await q.one<{ reference: string }>(
      `select reference from app.takedown_notices where contact_hash = $1 and target_key = $2 and status in ('received', 'in_review', 'escalated') order by received_at limit 1`,
      [contactHash, t.key],
    );
    if (mine) return { reference: mine.reference, id: null as string | null, created: false, t };
    // Someone else already reported this target: link to the earliest open notice.
    const primary = await q.one<{ id: string }>(
      `select id from app.takedown_notices where target_key = $1 and duplicate_of is null and status in ('received', 'in_review', 'escalated') order by received_at limit 1`,
      [t.key],
    );
    const ref = reference("TD");
    const contact = seal("takedown-contact", { name: i.name, email: i.email, signature: i.signature });
    const row = (await q.one<{ id: string; due_at: Date }>(
      `insert into app.takedown_notices (reference, category, requester_role, contact_enc, contact_hash, location, target_key, target_post_id, target_creator_id,
                                         description, good_faith, duplicate_of, due_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11, now() + make_interval(hours => $12)) returning id, due_at`,
      [ref, i.category, i.requesterRole, contact, contactHash, i.location, t.key, t.postId, t.creatorId, i.description || null, primary?.id ?? null, TAKEDOWN_HOURS],
    ))!;
    await audit(q, { actorId: null, action: "takedown.receive", targetType: "takedown", targetId: row.id, ipHash: meta.ipHash, metadata: { category: i.category, duplicate: !!primary } });

    // Urgent categories: withhold the post at once, pending the decision (mirrors S1).
    if (URGENT.has(i.category) && t.postId) {
      const hidden = await q.one(
        `update app.posts set hidden_at = now(), hidden_reason = 'Pending review (takedown notice)' where id = $1 and hidden_at is null returning id`,
        [t.postId],
      );
      if (hidden) {
        await q.query(`insert into app.moderation_actions (actor_id, action, target_type, target_id, note) values (null, 'takedown_hide', 'post', $1, $2)`, [t.postId, `Notice ${ref}`]);
        await audit(q, { actorId: null, action: "takedown.auto_hide", targetType: "post", targetId: t.postId, metadata: { notice: row.id } });
      }
    }
    if (i.category === "csam") {
      const sg = await openCase(q, { sourceType: "takedown", sourceId: row.id, summary: "Public notice: child sexual abuse material.", postId: t.postId, userId: t.creatorId });
      await q.query(`update app.takedown_notices set status = 'escalated' where id = $1`, [row.id]);
      await audit(q, { actorId: null, action: "takedown.escalate", targetType: "takedown", targetId: row.id, metadata: { case: sg.id } });
    }
    const owner = await q.one<{ id: string; email: string }>(`select id, email::text as email from app.users where role = 'owner'`);
    if (owner && !primary) await enqueue(q, owner.email, emails.takedownAlert({ category: i.category, reference: ref, dueAt: new Date(row.due_at), url: `${appUrl()}/admin/safety` }), owner.id);
    return { reference: ref, id: row.id, created: true, t };
  });
  return { reference: out.reference };
}

// ---------------------------------------------------------------- owner

function assertOwner(v: Viewer) {
  if (!can(v, "moderation.review")) throw new AppError("forbidden", "Not allowed.");
}

export type NoticeRow = {
  id: string; reference: string; category: TakedownCategory; requester_role: RequesterRole; status: string;
  location: string; description: string | null; target_post_id: string | null; target_creator_id: string | null;
  target_label: string | null; duplicate_of: string | null; duplicates: number;
  received_at: Date; due_at: Date; decided_at: Date | null; decision_note: string | null; copies_removed: number;
  hours_left: string; overdue: boolean; post_hidden: boolean | null;
};
const NOTICE_SELECT = `
  select n.id, n.reference, n.category, n.requester_role, n.status, n.location, n.description, n.target_post_id, n.target_creator_id,
         coalesce(p.teaser, c.display_name) as target_label, n.duplicate_of,
         (select count(*)::int from app.takedown_notices d where d.duplicate_of = n.id) as duplicates,
         n.received_at, n.due_at, n.decided_at, n.decision_note, n.copies_removed,
         round(extract(epoch from n.due_at - now())::numeric / 3600, 1) as hours_left,
         (n.due_at < now() and n.status in ('received', 'in_review')) as overdue,
         (p.hidden_at is not null) as post_hidden
    from app.takedown_notices n
    left join app.posts p on p.id = n.target_post_id
    left join app.creators c on c.user_id = n.target_creator_id`;

export async function takedownQueue(v: Viewer, view: "open" | "closed" = "open"): Promise<NoticeRow[]> {
  assertOwnerOrStaff(v, "takedowns.decide");
  const st = view === "open" ? ["received", "in_review", "escalated"] : ["removed", "rejected"];
  return asViewer(v, async (q) => {
    await auditStaffView(q, v, "takedowns");
    return q.query<NoticeRow>(`${NOTICE_SELECT} where n.status = any($1::text[]) and n.duplicate_of is null order by n.due_at limit 200`, [st]);
  });
}

export async function takedownNotice(v: Viewer, id: string): Promise<NoticeRow | null> {
  assertOwnerOrStaff(v, "takedowns.decide");
  return (await asViewer(v, (q) => q.one<NoticeRow>(`${NOTICE_SELECT} where n.id = $1`, [id]))) ?? null;
}

/** Decrypt the requester's contact details. Audited before they're returned. */
export async function takedownContact(v: Viewer, id: string, meta: { ipHash?: string | null } = {}) {
  assertOwner(v);
  return asViewer(v, async (q) => {
    const r = await q.one<{ contact_enc: string }>(`select contact_enc from app.takedown_notices where id = $1`, [id]);
    if (!r) throw new AppError("not_found", "Notice not found.");
    await audit(q, { actorId: v.id, action: "takedown.contact_view", targetType: "takedown", targetId: id, ipHash: meta.ipHash });
    return unseal<{ name: string; email: string; signature: string }>("takedown-contact", r.contact_enc);
  });
}

export type TakedownDecision = "in_review" | "remove" | "reject";

/**
 * Decide a notice (and every duplicate linked to it).
 *  - remove: hide the target post and every known identical copy, block their
 *    media fingerprints, record the removal time.
 *  - reject: invalid or unverifiable notice; restores a post hidden only by this notice.
 */
export async function decideTakedown(
  v: Viewer,
  id: string,
  decision: TakedownDecision,
  note: string | undefined,
  meta: { ipHash?: string | null } = {},
): Promise<{ status: string; copies: number }> {
  assertOwnerOrStaff(v, "takedowns.decide");
  const n = note?.trim() ?? "";
  if (decision === "reject" && n.length < 10) throw new AppError("validation", "Explain why the notice is rejected (10+ characters).", "note");
  const notice = await takedownNotice(v, id);
  if (!notice) throw new AppError("not_found", "Notice not found.");
  if (!["received", "in_review"].includes(notice.status)) throw new AppError("conflict", "This notice has already been decided.");
  if (decision === "reject" && notice.target_post_id && (await openCaseFor({ postId: notice.target_post_id }))) {
    throw new AppError("conflict", "This content is part of a safeguarding case. It can only be resolved there.");
  }

  const issued: (Issued | null)[] = [];
  const result = await asViewer(v, async (q) => {
    let copies = 0;
    let status = notice.status;
    if (decision === "in_review") status = "in_review";
    if (decision === "remove") {
      status = "removed";
      if (notice.target_post_id) {
        const ids = await q.query<{ id: string }>(
          `select distinct p2.post_id as id from app.post_content p1 join app.post_content p2 on p2.post_id <> p1.post_id
             and app.media_hashes(p2.media) && app.media_hashes(p1.media)
            where p1.post_id = $1`,
          [notice.target_post_id],
        );
        const all = [notice.target_post_id, ...ids.map((x) => x.id)];
        await q.query(
          `update app.posts set hidden_at = coalesce(hidden_at, now()), hidden_reason = $2 where id = any($1::uuid[])`,
          [all, `Removed: takedown notice ${notice.reference}`],
        );
        for (const pid of all) {
          await q.query(`insert into app.moderation_actions (actor_id, action, target_type, target_id, note) values ($1, 'takedown_remove', 'post', $2, $3)`, [v.id, pid, notice.reference]);
        }
        await q.query(
          `insert into app.blocked_media_hashes (hash, reason, source_type, source_id)
           select distinct h, 'takedown', 'takedown', $2::uuid from app.post_content pc, unnest(app.media_hashes(pc.media)) h where pc.post_id = $1
           on conflict (hash) do nothing`,
          [notice.target_post_id, id],
        );
        copies = ids.length;
        // A statement of reasons to each affected creator (requester never identified).
        const owners = await q.query<{ id: string; creator_id: string; teaser: string }>(`select id, creator_id, teaser from app.posts where id = any($1::uuid[])`, [all]);
        for (const p of owners) {
          issued.push(await issueNotice(q, {
            kind: "takedown_removed", userId: p.creator_id, postId: p.id, sourceType: "takedown", sourceId: id,
            label: p.teaser, note: n || null, category: notice.category, copy: p.id !== notice.target_post_id,
          }));
        }
      }
    }
    if (decision === "reject" && notice.target_post_id) {
      // Restore only what this notice hid automatically.
      await q.query(`update app.posts set hidden_at = null, hidden_reason = null where id = $1 and hidden_reason = 'Pending review (takedown notice)'`, [notice.target_post_id]);
    }
    const final = decision === "reject" ? "rejected" : status;
    await q.query(
      `update app.takedown_notices set status = $2, decision_note = coalesce($3, decision_note), copies_removed = copies_removed + $4,
              decided_at = case when $2 in ('removed', 'rejected') then now() else decided_at end,
              decided_by = case when $2 in ('removed', 'rejected') then app.uid() else decided_by end
        where id = $1 or (duplicate_of = $1 and status in ('received', 'in_review'))`,
      [id, final, n || null, copies],
    );
    await audit(q, { actorId: v.id, action: `takedown.${decision}`, targetType: "takedown", targetId: id, ipHash: meta.ipHash, metadata: { copies } });
    return { status: final, copies };
  });
  await announceNotices(issued).catch(() => {});
  return result;
}

export async function takedownCounts(v: Viewer) {
  assertOwnerOrStaff(v, "takedowns.decide");
  return asViewer(v, async (q) =>
    (await q.one<{ open: number; overdue: number; due_soon: number }>(
      `select count(*) filter (where status in ('received','in_review'))::int as open,
              count(*) filter (where status in ('received','in_review') and due_at < now())::int as overdue,
              count(*) filter (where status in ('received','in_review') and due_at between now() and now() + interval '12 hours')::int as due_soon
         from app.takedown_notices where duplicate_of is null`,
    ))!,
  );
}
