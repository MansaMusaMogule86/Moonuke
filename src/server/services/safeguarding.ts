import "server-only";
import { asViewer, system, type Q } from "@/server/db";
import { can, type Viewer } from "@/server/auth/permissions";
import { appUrl } from "@/server/env";
import { AppError } from "@/server/errors";
import { enqueue } from "@/server/email/outbox";
import { emails } from "@/server/email/templates";
import { buildCyberTiplineDraft } from "@/server/safety/ncmec";
import { reference } from "@/server/safety/seal";
import { audit } from "./audit";

// =====================================================================
// Safeguarding: urgent escalation, preservation and NCMEC preparation.
// Separate from the ordinary moderation queue. Only the owner, at AAL2, with
// attested safeguarding training can open cases (enforced again by RLS via
// app.is_safeguarding_staff()). Nothing is ever sent to NCMEC automatically.
// =====================================================================

/** Minimum preservation (18 U.S.C. § 2258A(h) as amended by the REPORT Act: one year). */
export const PRESERVATION_DAYS = 365;

export type CaseSource = "report" | "takedown" | "scan" | "manual";
export type CaseStatus = "open" | "assessing" | "report_required" | "reported" | "no_report_required" | "closed";
export const CLOSED_STATUSES: CaseStatus[] = ["reported", "no_report_required", "closed"];

type Subject = { postId?: string | null; userId?: string | null; messageId?: string | null; uploadId?: string | null };
type HoldType = "post" | "user" | "message" | "media_upload";

async function snapshot(q: Q, type: HoldType, id: string): Promise<Record<string, unknown> | null> {
  if (type === "post") {
    return (
      (await q.one(
        `select p.id, p.creator_id, p.access, p.teaser, p.media_kind, p.media_count, p.published_at, p.created_at, p.hidden_at, p.hidden_reason,
                pc.body, pc.media, app.media_hashes(pc.media) as media_hashes
           from app.posts p left join app.post_content pc on pc.post_id = p.id where p.id = $1`,
        [id],
      )) ?? null
    );
  }
  if (type === "user") {
    return (await q.one(`select id, alias::text as alias, email::text as email, role, status, created_at from app.users where id = $1`, [id])) ?? null;
  }
  if (type === "media_upload") {
    return (await q.one(`select id, owner_id, purpose, status, sniffed_mime, size_bytes, sha256, storage_key, created_at from app.media_uploads where id = $1`, [id])) ?? null;
  }
  return (await q.one(`select id, conversation_id, sender_id, body, status, created_at from app.messages where id = $1`, [id])) ?? null;
}

/** Preserve an object for this case. Idempotent per case and object. */
export async function placeHold(q: Q, caseId: string, type: HoldType, id: string) {
  const snap = await snapshot(q, type, id);
  if (!snap) return false;
  const r = await q.one(
    `insert into app.legal_holds (case_id, object_type, object_id, snapshot, preserve_until)
     values ($1, $2, $3, $4, now() + make_interval(days => $5))
     on conflict (case_id, object_type, object_id) where released_at is null do nothing returning id`,
    [caseId, type, id, JSON.stringify(snap), PRESERVATION_DAYS],
  );
  return !!r;
}

/**
 * Open (or find) the case for a source and preserve the subjects. Runs as the
 * server (system role): reporters and requesters can't open cases themselves.
 * The content is withheld by the caller (post hidden, message held).
 */
export async function openCase(
  q: Q,
  input: { sourceType: CaseSource; sourceId: string | null; summary: string; actorId?: string | null } & Subject,
): Promise<{ id: string; reference: string; created: boolean }> {
  if (input.sourceId) {
    const existing = await q.one<{ id: string; reference: string }>(`select id, reference from app.safeguarding_cases where source_type = $1 and source_id = $2`, [input.sourceType, input.sourceId]);
    if (existing) return { ...existing, created: false };
  }
  const ref = reference("SG");
  const row = (await q.one<{ id: string }>(
    `insert into app.safeguarding_cases (reference, source_type, source_id, subject_post_id, subject_user_id, summary)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [ref, input.sourceType, input.sourceId, input.postId ?? null, input.userId ?? null, input.summary.slice(0, 1000)],
  ))!;
  if (input.postId) await placeHold(q, row.id, "post", input.postId);
  if (input.userId) await placeHold(q, row.id, "user", input.userId);
  if (input.messageId) await placeHold(q, row.id, "message", input.messageId);
  if (input.uploadId) await placeHold(q, row.id, "media_upload", input.uploadId);
  await q.query(`insert into app.safeguarding_events (case_id, actor_id, kind, note) values ($1, $2, 'opened', $3)`, [row.id, input.actorId ?? null, `Source: ${input.sourceType}`]);
  await audit(q, { actorId: input.actorId ?? null, action: "safeguarding.open", targetType: "safeguarding_case", targetId: row.id, metadata: { source: input.sourceType } });
  const owner = await q.one<{ id: string; email: string }>(`select id, email::text as email from app.users where role = 'owner'`);
  if (owner) await enqueue(q, owner.email, emails.safeguardingAlert({ reference: ref, url: `${appUrl()}/admin/safety/safeguarding` }), owner.id);
  return { id: row.id, reference: ref, created: true };
}

// ---------------------------------------------------------------- staff

function assertOwner(v: Viewer) {
  if (!can(v, "moderation.review")) throw new AppError("forbidden", "Not allowed.");
}
async function assertStaff(v: Viewer) {
  assertOwner(v);
  const ok = await asViewer(v, (q) => q.one<{ ok: boolean }>(`select app.is_safeguarding_staff() as ok`));
  if (!ok?.ok) throw new AppError("forbidden", "Safeguarding needs attested training.");
}

export async function safeguardingAccess(v: Viewer): Promise<{ trained: boolean; open: number }> {
  assertOwner(v);
  return asViewer(v, async (q) => (await q.one<{ trained: boolean; open: number }>(`select app.is_safeguarding_staff() as trained, app.safeguarding_open_count() as open`))!);
}

export async function attestTraining(v: Viewer, trainedOn: Date, training: string) {
  assertOwner(v);
  const t = training.trim();
  if (t.length < 3 || t.length > 200) throw new AppError("validation", "Name the training (3–200 characters).", "training");
  await asViewer(v, (q) => q.query(`select app.attest_safeguarding_training($1::date, $2)`, [trainedOn.toISOString().slice(0, 10), t])).catch((e) => {
    if ((e as { code?: string }).code === "22023") throw new AppError("validation", "The training date must be within the last three years.", "trainedOn");
    throw e;
  });
}

export type CaseRow = {
  id: string; reference: string; source_type: CaseSource; status: CaseStatus; summary: string; created_at: Date;
  subject_post_id: string | null; subject_user_id: string | null; holds: number; hours_open: string;
};
export async function caseList(v: Viewer): Promise<CaseRow[]> {
  await assertStaff(v);
  return asViewer(v, (q) => q.query<CaseRow>(`select * from app.safeguarding_case_list()`));
}

export type HoldRow = { id: string; object_type: string; object_id: string; placed_at: Date; preserve_until: Date; released_at: Date | null; snapshot: Record<string, unknown> };
export type CaseDetail = {
  c: CaseRow & { decision_reason: string | null; external_ref: string | null; reported_at: Date | null; decided_at: Date | null };
  events: { id: string; kind: string; note: string | null; actor: string | null; created_at: Date }[];
  holds: HoldRow[];
};
export async function caseDetail(v: Viewer, id: string, meta: { ipHash?: string | null } = {}): Promise<CaseDetail | null> {
  await assertStaff(v);
  return asViewer(v, async (q) => {
    const c = await q.one<CaseDetail["c"]>(
      `select c.*, (select count(*)::int from app.legal_holds h where h.case_id = c.id and h.released_at is null) as holds,
              round(extract(epoch from now() - c.created_at)::numeric / 3600, 1) as hours_open
         from app.safeguarding_cases c where c.id = $1`,
      [id],
    );
    if (!c) return null;
    const events = await q.query<CaseDetail["events"][number]>(
      `select e.id::text, e.kind, e.note, u.alias::text as actor, e.created_at from app.safeguarding_events e left join app.users u on u.id = e.actor_id where e.case_id = $1 order by e.id`,
      [id],
    );
    const holds = await q.query<HoldRow>(`select id, object_type, object_id, placed_at, preserve_until, released_at, snapshot from app.legal_holds where case_id = $1 order by placed_at`, [id]);
    await audit(q, { actorId: v.id, action: "safeguarding.case_view", targetType: "safeguarding_case", targetId: id, ipHash: meta.ipHash });
    return { c, events, holds };
  });
}

export type CaseAction = "assess" | "report_required" | "no_report_required" | "reported" | "close" | "note";
const NEXT: Record<Exclude<CaseAction, "note">, { from: CaseStatus[]; to: CaseStatus }> = {
  assess: { from: ["open"], to: "assessing" },
  report_required: { from: ["open", "assessing"], to: "report_required" },
  no_report_required: { from: ["open", "assessing"], to: "no_report_required" },
  reported: { from: ["report_required"], to: "reported" },
  close: { from: ["reported", "no_report_required"], to: "closed" },
};

export async function decideCase(
  v: Viewer,
  id: string,
  action: CaseAction,
  opts: { reason?: string; externalRef?: string; attestManual?: boolean } = {},
  meta: { ipHash?: string | null } = {},
): Promise<CaseStatus> {
  await assertStaff(v);
  const reason = opts.reason?.trim() ?? "";
  if (action === "no_report_required" && reason.length < 40) throw new AppError("validation", "Explain in at least 40 characters why no report is required.", "reason");
  if (action === "note" && reason.length < 3) throw new AppError("validation", "Write the note.", "reason");
  if (action === "reported") {
    if (!opts.externalRef?.trim() || opts.externalRef.trim().length > 120) throw new AppError("validation", "Enter the CyberTipline report number.", "externalRef");
    if (!opts.attestManual) throw new AppError("validation", "Confirm the report was submitted through the official CyberTipline.", "attestManual");
  }
  return asViewer(v, async (q) => {
    const c = await q.one<{ status: CaseStatus }>(`select status from app.safeguarding_cases where id = $1 for update`, [id]);
    if (!c) throw new AppError("not_found", "Case not found.");
    let status = c.status;
    if (action !== "note") {
      const t = NEXT[action];
      if (!t.from.includes(c.status)) throw new AppError("conflict", `A case that is ${c.status.replace(/_/g, " ")} can't move to ${t.to.replace(/_/g, " ")}.`);
      status = t.to;
      await q.query(
        `update app.safeguarding_cases set status = $2, updated_at = now(),
                decision_reason = case when $3 <> '' then $3 else decision_reason end,
                decided_by = case when $2 in ('report_required', 'no_report_required') then app.uid() else decided_by end,
                decided_at = case when $2 in ('report_required', 'no_report_required') then now() else decided_at end,
                external_ref = case when $2 = 'reported' then $4 else external_ref end,
                reported_at = case when $2 = 'reported' then now() else reported_at end,
                reported_by = case when $2 = 'reported' then app.uid() else reported_by end
          where id = $1`,
        [id, status, reason, opts.externalRef?.trim() ?? null],
      );
    }
    await q.query(`insert into app.safeguarding_events (case_id, actor_id, kind, note) values ($1, $2, $3, $4)`, [id, v.id, action, reason || (action === "reported" ? `CyberTipline ${opts.externalRef!.trim()}` : null)]);
    await audit(q, { actorId: v.id, action: `safeguarding.${action}`, targetType: "safeguarding_case", targetId: id, ipHash: meta.ipHash });
    return status;
  });
}

/** Manual-entry checklist for the CyberTipline. Never sent anywhere. */
export async function cyberTiplineDraft(v: Viewer, id: string) {
  await assertStaff(v);
  return asViewer(v, async (q) => {
    const c = await q.one<{ reference: string; source_type: string; summary: string; created_at: Date; status: string }>(`select reference, source_type, summary, created_at, status from app.safeguarding_cases where id = $1`, [id]);
    if (!c) throw new AppError("not_found", "Case not found.");
    const holds = await q.query<HoldRow>(`select object_type, object_id, placed_at, preserve_until, snapshot from app.legal_holds where case_id = $1`, [id]);
    await audit(q, { actorId: v.id, action: "safeguarding.draft_export", targetType: "safeguarding_case", targetId: id });
    return buildCyberTiplineDraft(c, holds);
  });
}

/** Open a case by hand from a report or post (trained staff only). */
export async function openManualCase(v: Viewer, input: { summary: string; postId?: string | null; userId?: string | null }) {
  await assertStaff(v);
  if (input.summary.trim().length < 10) throw new AppError("validation", "Describe the concern (10+ characters).", "summary");
  return system((q) => openCase(q, { sourceType: "manual", sourceId: null, summary: input.summary.trim(), actorId: v.id, postId: input.postId, userId: input.userId }));
}

/**
 * Release a hold. Allowed only for a closed case and after the preservation
 * period (also enforced by a table CHECK). Releasing never deletes anything.
 */
export async function releaseHold(v: Viewer, holdId: string, reason: string) {
  await assertStaff(v);
  if (reason.trim().length < 20) throw new AppError("validation", "Give the reason for release (20+ characters).", "reason");
  await asViewer(v, async (q) => {
    const h = await q.one<{ case_id: string; status: CaseStatus; due: boolean }>(
      `select h.case_id, c.status, h.preserve_until <= now() as due from app.legal_holds h join app.safeguarding_cases c on c.id = h.case_id where h.id = $1 and h.released_at is null`,
      [holdId],
    );
    if (!h) throw new AppError("not_found", "Hold not found.");
    if (h.status !== "closed") throw new AppError("conflict", "Close the case before releasing its holds.");
    if (!h.due) throw new AppError("conflict", "The preservation period hasn't ended.");
    await q.query(`update app.legal_holds set released_at = now(), released_by = app.uid(), release_reason = $2 where id = $1`, [holdId, reason.trim()]);
    await q.query(`insert into app.safeguarding_events (case_id, actor_id, kind, note) values ($1, $2, 'hold_released', $3)`, [h.case_id, v.id, reason.trim()]);
    await audit(q, { actorId: v.id, action: "safeguarding.hold_release", targetType: "legal_hold", targetId: holdId });
  });
}

/** Is a report or post tied to a safeguarding case that wasn't cleared? (Used to keep ordinary moderation from closing it.) */
export async function openCaseFor(input: { reportId?: string; postId?: string }): Promise<boolean> {
  return system(async (q) =>
    !!(await q.one(
      // Anything except "no report required" keeps the content out of ordinary moderation.
      `select 1 from app.safeguarding_cases
        where status <> 'no_report_required' and not (status = 'closed' and external_ref is null)
          and ((source_type = 'report' and source_id = $1::uuid) or ($2::uuid is not null and subject_post_id = $2::uuid))`,
      [input.reportId ?? null, input.postId ?? null],
    )),
  );
}
