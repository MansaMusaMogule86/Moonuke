import "server-only";
import { randomUUID } from "node:crypto";
import { asViewer, system } from "@/server/db";
import { can, type Viewer } from "@/server/auth/permissions";
import { appUrl } from "@/server/env";
import { AppError } from "@/server/errors";
import { enqueue } from "@/server/email/outbox";
import { emails } from "@/server/email/templates";
import { setSuspended } from "./admin";
import { audit } from "./audit";

export const REPORT_REASONS = [
  { value: "harassment", label: "Harassment or threats" },
  { value: "impersonation", label: "Impersonation or fake identity" },
  { value: "spam", label: "Spam or scam" },
  { value: "copyright", label: "Stolen or copyrighted content" },
  { value: "underage_concern", label: "Someone may be under 18" },
  { value: "non_consensual", label: "Shared without consent" },
  { value: "illegal_content", label: "Other illegal content" },
  { value: "other", label: "Something else" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["value"];
export const CRITICAL: ReportReason[] = ["underage_concern", "non_consensual", "illegal_content"];

function assertMember(viewer: Viewer) {
  if (!can(viewer, "club.discover")) throw new AppError("forbidden", "Not allowed.");
}
function assertOwner(viewer: Viewer) {
  if (!can(viewer, "moderation.review")) throw new AppError("forbidden", "Not allowed.");
}

// ---------------------------------------------------------------- blocking

export async function block(viewer: Viewer, targetUserId: string) {
  assertMember(viewer);
  if (targetUserId === viewer.id) throw new AppError("validation", "You can't block yourself.");
  await asViewer(viewer, async (q) => {
    try {
      await q.query(`insert into app.blocks (blocker_id, blocked_id) values ($1, $2) on conflict do nothing`, [viewer.id, targetUserId]);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "42501" || code === "23503") throw new AppError("not_found", "Account not found.");
      throw e;
    }
    await audit(q, { actorId: viewer.id, action: "block.create", targetType: "user", targetId: targetUserId });
  });
}

export async function unblock(viewer: Viewer, targetUserId: string) {
  assertMember(viewer);
  await asViewer(viewer, async (q) => {
    await q.query(`delete from app.blocks where blocker_id = $1 and blocked_id = $2`, [viewer.id, targetUserId]);
    await audit(q, { actorId: viewer.id, action: "block.delete", targetType: "user", targetId: targetUserId });
  });
}

export type BlockedRow = { user_id: string; name: string; handle: string | null; created_at: Date };
export async function myBlocks(viewer: Viewer): Promise<BlockedRow[]> {
  assertMember(viewer);
  return asViewer(viewer, (q) => q.query<BlockedRow>(`select * from app.my_blocks()`));
}

// ---------------------------------------------------------------- reporting

export type ReportInput = { targetType: "creator" | "post" | "message"; targetId: string; reason: ReportReason; details?: string };

/**
 * File a report. The target must be visible to the reporter (checked under
 * RLS). Critical reports about a post hide it immediately pending review and
 * alert the owner by email — content first, questions after (decision S1).
 */
export async function fileReport(viewer: Viewer, input: ReportInput, meta: { ipHash?: string | null } = {}) {
  assertMember(viewer);
  const id = randomUUID();
  const targetUserId = await asViewer(viewer, async (q) => {
    const t =
      input.targetType === "creator"
        ? await q.one<{ uid: string }>(`select user_id as uid from app.creators where user_id = $1`, [input.targetId])
        : input.targetType === "message"
          ? // Only a participant can see (and so report) a message.
            await q.one<{ uid: string }>(`select sender_id as uid from app.messages where id = $1 and status = 'sent'`, [input.targetId])
          : await q.one<{ uid: string }>(`select creator_id as uid from app.posts where id = $1`, [input.targetId]);
    if (!t) throw new AppError("not_found", "That's no longer available.");
    if (t.uid === viewer.id) throw new AppError("validation", "You can't report your own content.");
    try {
      await q.query(
        `insert into app.reports (id, reporter_id, target_type, target_id, target_user_id, reason, details) values ($1, $2, $3, $4, $5, $6, $7)`,
        [id, viewer.id, input.targetType, input.targetId, t.uid, input.reason, input.details ?? null],
      );
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw new AppError("conflict", "You've already reported this. The house is reviewing it.");
      throw e;
    }
    await audit(q, { actorId: viewer.id, action: "report.file", targetType: "report", targetId: id, ipHash: meta.ipHash, metadata: { reason: input.reason, target: input.targetType } });
    return t.uid;
  });

  const critical = CRITICAL.includes(input.reason);
  if (critical) {
    // Privileged follow-up: the reporter can't hide posts or mail the owner themselves.
    await system(async (q) => {
      if (input.targetType === "message") {
        // Critical report: withhold the message from the conversation pending review.
        const held = await q.one(`update app.messages set status = 'held' where id = $1 and status = 'sent' returning id`, [input.targetId]);
        if (held) await audit(q, { actorId: null, action: "moderation.auto_hold_message", targetType: "message", targetId: input.targetId, metadata: { report: id } });
      }
      if (input.targetType === "post") {
        const hidden = await q.one(
          `update app.posts set hidden_at = now(), hidden_reason = 'Pending review (automatic, critical report)' where id = $1 and hidden_at is null returning id`,
          [input.targetId],
        );
        if (hidden) {
          await q.query(`insert into app.moderation_actions (report_id, actor_id, action, target_type, target_id, note) values ($1, null, 'auto_hide_post', 'post', $2, 'Critical report')`, [id, input.targetId]);
          await audit(q, { actorId: null, action: "moderation.auto_hide", targetType: "post", targetId: input.targetId, metadata: { report: id } });
        }
      }
      const owner = await q.one<{ id: string; email: string }>(`select id, email::text as email from app.users where role = 'owner'`);
      if (owner) await enqueue(q, owner.email, emails.criticalReport({ reason: input.reason, url: `${appUrl()}/admin/moderation` }), owner.id);
    });
  }
  return { id, critical, targetUserId };
}

export type MyReportRow = { id: string; target_type: string; reason: ReportReason; status: string; created_at: Date };
export async function myReports(viewer: Viewer): Promise<MyReportRow[]> {
  assertMember(viewer);
  return asViewer(viewer, (q) => q.query<MyReportRow>(`select * from app.my_reports()`));
}

// ---------------------------------------------------------------- moderation (owner)

export type QueueRow = {
  id: string;
  target_type: "creator" | "post" | "user" | "message";
  target_id: string;
  target_user_id: string | null;
  target_label: string | null;
  target_handle: string | null;
  target_status: string | null;
  post_hidden: boolean | null;
  reason: ReportReason;
  details: string | null;
  severity: 1 | 2 | 3;
  status: "open" | "in_review" | "actioned" | "dismissed" | "escalated";
  reporter_alias: string | null;
  escalation_ref: string | null;
  resolution_note: string | null;
  created_at: Date;
  similar_open: number;
};

export async function moderationQueue(viewer: Viewer, view: "open" | "escalated" | "closed" = "open"): Promise<QueueRow[]> {
  assertOwner(viewer);
  const statuses = view === "open" ? ["open", "in_review"] : view === "escalated" ? ["escalated"] : ["actioned", "dismissed"];
  return asViewer(viewer, (q) =>
    q.query<QueueRow>(
      `select r.id, r.target_type, r.target_id, r.target_user_id, r.reason, r.details, r.severity, r.status, r.escalation_ref, r.resolution_note, r.created_at,
              ru.alias::text as reporter_alias,
              case when r.target_type = 'message' then 'Private message from ' || coalesce(tu.alias::text, 'a member') else coalesce(p.teaser, c.display_name, tu.alias::text) end as target_label,
              coalesce(pc.handle, c.handle)::text as target_handle,
              tu.status::text as target_status,
              (p.hidden_at is not null) as post_hidden,
              (select count(*)::int from app.reports r2 where r2.target_id = r.target_id and r2.id <> r.id and r2.status in ('open','in_review')) as similar_open
         from app.reports r
         left join app.users ru on ru.id = r.reporter_id
         left join app.users tu on tu.id = r.target_user_id
         left join app.posts p on r.target_type = 'post' and p.id = r.target_id
         left join app.creators pc on pc.user_id = p.creator_id
         left join app.creators c on r.target_type = 'creator' and c.user_id = r.target_id
        where r.status = any($1::app.report_status[])
        order by r.severity desc, r.created_at asc limit 200`,
      [statuses],
    ),
  );
}

export type ModAction = "in_review" | "dismiss" | "hide_post" | "restore_post" | "suspend_user" | "escalate" | "resolve";

/** Apply a moderation decision. Every action is recorded in moderation_actions and the audit log. */
export async function moderate(
  viewer: Viewer,
  reportId: string,
  action: ModAction,
  opts: { note?: string; escalationRef?: string } = {},
  meta: { ipHash?: string | null } = {},
): Promise<{ status: QueueRow["status"]; postHidden?: boolean }> {
  assertOwner(viewer);
  if (action === "escalate" && !opts.escalationRef?.trim()) {
    throw new AppError("validation", "Add the external reference (case or ticket number) for this escalation.", "escalationRef");
  }
  const r = await asViewer(viewer, (q) =>
    q.one<{ target_type: string; target_id: string; target_user_id: string | null; status: string }>(
      `select target_type, target_id, target_user_id, status from app.reports where id = $1`,
      [reportId],
    ),
  );
  if (!r) throw new AppError("not_found", "Report not found.");
  if ((action === "hide_post" || action === "restore_post") && r.target_type !== "post") throw new AppError("validation", "Only posts can be hidden.");
  if (action === "suspend_user") {
    if (!r.target_user_id) throw new AppError("validation", "No account is attached to this report.");
    await setSuspended(viewer, r.target_user_id, true, opts.note ?? `Moderation: report ${reportId.slice(0, 8)}`, meta).catch((e) => {
      // Already suspended is fine; anything else is real.
      if (!(e instanceof AppError && e.code === "not_found")) throw e;
    });
  }

  const nextStatus: QueueRow["status"] =
    action === "in_review" ? "in_review"
    : action === "dismiss" || action === "restore_post" ? "dismissed"
    : action === "escalate" ? "escalated"
    : "actioned";
  const closes = nextStatus === "actioned" || nextStatus === "dismissed";

  return asViewer(viewer, async (q) => {
    let postHidden: boolean | undefined;
    if (action === "hide_post") {
      await q.query(`update app.posts set hidden_at = coalesce(hidden_at, now()), hidden_reason = $2 where id = $1`, [r.target_id, opts.note ?? "Removed by moderation"]);
      postHidden = true;
    }
    if (action === "restore_post") {
      await q.query(`update app.posts set hidden_at = null, hidden_reason = null where id = $1`, [r.target_id]);
      postHidden = false;
    }
    await q.query(
      `update app.reports set status = $2, resolution_note = coalesce($3, resolution_note), escalation_ref = coalesce($4, escalation_ref),
              resolved_by = case when $5 then $6::uuid else resolved_by end, resolved_at = case when $5 then now() else resolved_at end, updated_at = now()
        where id = $1`,
      [reportId, nextStatus, opts.note ?? null, opts.escalationRef?.trim() || null, closes, viewer.id],
    );
    await q.query(
      `insert into app.moderation_actions (report_id, actor_id, action, target_type, target_id, note) values ($1, $2, $3, $4, $5, $6)`,
      [reportId, viewer.id, action, r.target_type, r.target_id, opts.note ?? null],
    );
    await audit(q, { actorId: viewer.id, action: `moderation.${action}`, targetType: "report", targetId: reportId, ipHash: meta.ipHash, metadata: action === "escalate" ? { ref: opts.escalationRef } : {} });
    return { status: nextStatus, postHidden };
  });
}

export async function moderationCounts(viewer: Viewer) {
  assertOwner(viewer);
  return asViewer(viewer, async (q) =>
    (await q.one<{ open: number; critical: number; escalated: number }>(
      `select count(*) filter (where status in ('open','in_review'))::int as open,
              count(*) filter (where status in ('open','in_review') and severity = 3)::int as critical,
              count(*) filter (where status = 'escalated')::int as escalated
         from app.reports`,
    ))!,
  );
}
