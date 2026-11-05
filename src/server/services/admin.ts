import "server-only";
import { asViewer, type Q } from "@/server/db";
import { randomToken, sha256 } from "@/server/auth/crypto";
import { can, type Permission, type Viewer } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { appUrl } from "@/server/env";
import { emailEnabled, enqueue } from "@/server/email/outbox";
import { emails } from "@/server/email/templates";
import { audit } from "./audit";
import { revokeAllSessions } from "./sessions";

/**
 * Owner-only operations. Each one (1) checks the permission in app code and
 * (2) runs as `mk_app` under RLS, whose policies independently require the
 * viewer to be the active owner. Either layer alone denies a non-owner.
 */
function assert(viewer: Viewer, p: Permission) {
  if (!can(viewer, p)) throw new AppError("forbidden", "Not allowed.");
}

type Meta = { ipHash?: string | null };

// ---------------------------------------------------------------- invitations

export type NewInvitation = {
  role: "member" | "creator";
  email?: string;
  maxUses: number;
  expiresInDays: number;
  note?: string;
  referralRequestId?: string;
  /** Also email the link to `email` (manual delivery always remains available). */
  sendEmail?: boolean;
};

async function insertInvitation(q: Q, viewer: Viewer, input: NewInvitation, meta: Meta) {
  const token = randomToken();
  const row = await q.one<{ id: string; expires_at: Date }>(
    `insert into app.invitations (token_hash, intended_role, email, max_uses, expires_at, note, created_by, referral_request_id)
     values ($1, $2, $3, $4, now() + make_interval(days => $5), $6, $7, $8) returning id, expires_at`,
    [sha256(token), input.role, input.email ?? null, input.maxUses, input.expiresInDays, input.note ?? null, viewer.id, input.referralRequestId ?? null],
  );
  await audit(q, {
    actorId: viewer.id,
    action: "invitation.create",
    targetType: "invitation",
    targetId: row!.id,
    ipHash: meta.ipHash,
    metadata: { role: input.role, maxUses: input.maxUses, emailLocked: !!input.email, days: input.expiresInDays, fromReferral: !!input.referralRequestId, emailed: !!(input.sendEmail && input.email) },
  });
  let emailed = false;
  if (input.sendEmail && input.email && emailEnabled()) {
    await enqueue(q, input.email, emails.invitation({ url: `${appUrl()}/invite/${token}`, role: input.role, expiresAt: row!.expires_at }));
    emailed = true;
  }
  return { id: row!.id, token, expiresAt: row!.expires_at, emailed };
}

/** Returns the raw token exactly once. Only its hash is stored. */
export async function createInvitation(viewer: Viewer, input: NewInvitation, meta: Meta = {}) {
  assert(viewer, "invitations.manage");
  return asViewer(viewer.id, (q) => insertInvitation(q, viewer, input, meta));
}

export type InvitationRow = {
  id: string;
  intended_role: "member" | "creator";
  email: string | null;
  max_uses: number;
  use_count: number;
  expires_at: Date;
  revoked_at: Date | null;
  note: string | null;
  created_at: Date;
  state: "active" | "expired" | "revoked" | "exhausted";
};

export async function listInvitations(viewer: Viewer): Promise<InvitationRow[]> {
  assert(viewer, "invitations.manage");
  return asViewer(viewer.id, (q) =>
    q.query<InvitationRow>(
      `select id, intended_role, email::text as email, max_uses, use_count, expires_at, revoked_at, note, created_at,
              case when revoked_at is not null then 'revoked'
                   when use_count >= max_uses then 'exhausted'
                   when expires_at <= now() then 'expired'
                   else 'active' end as state
         from app.invitations order by created_at desc limit 200`,
    ),
  );
}

export async function revokeInvitation(viewer: Viewer, id: string, meta: Meta = {}) {
  assert(viewer, "invitations.manage");
  return asViewer(viewer.id, async (q) => {
    const row = await q.one(
      `update app.invitations set revoked_at = now(), revoked_by = $2 where id = $1 and revoked_at is null returning id`,
      [id, viewer.id],
    );
    if (!row) throw new AppError("not_found", "Invitation not found or already revoked.");
    await audit(q, { actorId: viewer.id, action: "invitation.revoke", targetType: "invitation", targetId: id, ipHash: meta.ipHash });
  });
}

// ---------------------------------------------------------------- applications

export type ApplicationRow = {
  id: string;
  user_id: string;
  alias: string;
  email: string;
  role: "member" | "creator";
  status: "pending" | "approved" | "rejected";
  submitted_at: Date;
  invitation_note: string | null;
  referred_by: string | null;
};

export async function listApplications(viewer: Viewer, status: "pending" | "all" = "pending"): Promise<ApplicationRow[]> {
  assert(viewer, "applications.review");
  return asViewer(viewer.id, (q) =>
    q.query<ApplicationRow>(
      `select a.id, a.user_id, u.alias::text as alias, u.email::text as email, u.role, a.status, a.submitted_at,
              i.note as invitation_note, ru.alias::text as referred_by
         from app.applications a
         join app.users u on u.id = a.user_id
         join app.invitations i on i.id = a.invitation_id
         left join app.referral_requests r on r.id = i.referral_request_id
         left join app.users ru on ru.id = r.requester_id
        where ($1 = 'all' or a.status = 'pending')
        order by a.submitted_at asc limit 200`,
      [status],
    ),
  );
}

export async function decideApplication(
  viewer: Viewer,
  applicationId: string,
  decision: "approve" | "reject",
  note: string | undefined,
  meta: Meta = {},
) {
  assert(viewer, "applications.review");
  let approvedEmail: { to: string; alias: string } | null = null;
  const userId = await asViewer(viewer.id, async (q) => {
    const app = await q.one<{ user_id: string }>(
      `update app.applications set status = $2, decided_at = now(), decided_by = $3, decision_note = $4
        where id = $1 and status = 'pending' returning user_id`,
      [applicationId, decision === "approve" ? "approved" : "rejected", viewer.id, note ?? null],
    );
    if (!app) throw new AppError("not_found", "Application not found or already decided.");
    await q.query(
      decision === "approve"
        ? `update app.users set status = 'active', approved_at = now(), approved_by = $2, updated_at = now()
            where id = $1 and status = 'pending'`
        : `update app.users set status = 'rejected', updated_at = now() where id = $1 and status = 'pending' and $2::uuid is not null`,
      [app.user_id, viewer.id],
    );
    await audit(q, {
      actorId: viewer.id,
      action: decision === "approve" ? "application.approve" : "application.reject",
      targetType: "user",
      targetId: app.user_id,
      ipHash: meta.ipHash,
    });
    if (decision === "approve") {
      const u = await q.one<{ email: string; alias: string }>(`select email::text as email, alias::text as alias from app.users where id = $1`, [app.user_id]);
      if (u) {
        await enqueue(q, u.email, emails.approved({ alias: u.alias, url: `${appUrl()}/signin` }), app.user_id);
        approvedEmail = { to: u.email, alias: u.alias };
      }
    }
    return app.user_id;
  });
  if (decision === "reject") await revokeAllSessions(userId);
  return { userId, emailed: !!approvedEmail && emailEnabled() };
}

// ---------------------------------------------------------------- referrals

export type ReferralRow = {
  id: string;
  requester_alias: string;
  requester_role: string;
  invitee_name: string;
  invitee_email: string;
  intended_role: "member" | "creator";
  relationship: string;
  status: "pending" | "approved" | "declined";
  created_at: Date;
};

export async function listReferrals(viewer: Viewer): Promise<ReferralRow[]> {
  assert(viewer, "referrals.review");
  return asViewer(viewer.id, (q) =>
    q.query<ReferralRow>(
      `select r.id, u.alias::text as requester_alias, u.role as requester_role, r.invitee_name, r.invitee_email::text as invitee_email,
              r.intended_role, r.relationship, r.status, r.created_at
         from app.referral_requests r join app.users u on u.id = r.requester_id
        order by (r.status = 'pending') desc, r.created_at desc limit 200`,
    ),
  );
}

/** Approving a referral issues a single-use, email-locked, 7-day invitation (decision D7). */
export async function decideReferral(
  viewer: Viewer,
  referralId: string,
  decision: "approve" | "decline",
  note: string | undefined,
  meta: Meta = {},
  opts: { sendEmail?: boolean } = {},
): Promise<{ token: string; expiresAt: Date; emailed: boolean } | null> {
  assert(viewer, "referrals.review");
  return asViewer(viewer.id, async (q) => {
    const ref = await q.one<{ id: string; invitee_email: string; intended_role: "member" | "creator"; requester_id: string }>(
      `select id, invitee_email::text as invitee_email, intended_role, requester_id
         from app.referral_requests where id = $1 and status = 'pending' for update`,
      [referralId],
    );
    if (!ref) throw new AppError("not_found", "Request not found or already decided.");
    let issued: { id: string; token: string; expiresAt: Date; emailed: boolean } | null = null;
    if (decision === "approve") {
      issued = await insertInvitation(
        q,
        viewer,
        { role: ref.intended_role, email: ref.invitee_email, maxUses: 1, expiresInDays: 7, note: note ?? "From referral request", referralRequestId: ref.id, sendEmail: opts.sendEmail },
        meta,
      );
    }
    await q.query(
      `update app.referral_requests set status = $2, invitation_id = $3, decided_at = now(), decided_by = $4, decision_note = $5 where id = $1`,
      [ref.id, decision === "approve" ? "approved" : "declined", issued?.id ?? null, viewer.id, note ?? null],
    );
    await audit(q, {
      actorId: viewer.id,
      action: decision === "approve" ? "referral.approve" : "referral.decline",
      targetType: "referral_request",
      targetId: ref.id,
      ipHash: meta.ipHash,
    });
    return issued ? { token: issued.token, expiresAt: issued.expiresAt, emailed: issued.emailed } : null;
  });
}

// ---------------------------------------------------------------- members

export type MemberRow = {
  id: string;
  alias: string;
  email: string;
  role: "owner" | "creator" | "member";
  status: "pending" | "active" | "suspended" | "rejected";
  created_at: Date;
  suspended_reason: string | null;
};

export async function listMembers(viewer: Viewer): Promise<MemberRow[]> {
  assert(viewer, "accounts.suspend");
  return asViewer(viewer.id, (q) =>
    q.query<MemberRow>(
      `select id, alias::text as alias, email::text as email, role, status, created_at, suspended_reason
         from app.users order by (role = 'owner') desc, created_at desc limit 500`,
    ),
  );
}

export async function setSuspended(viewer: Viewer, userId: string, suspend: boolean, reason: string | undefined, meta: Meta = {}) {
  assert(viewer, "accounts.suspend");
  if (userId === viewer.id) throw new AppError("forbidden", "You can't suspend your own account.");
  await asViewer(viewer.id, async (q) => {
    const row = await q.one(
      suspend
        ? `update app.users set status = 'suspended', suspended_at = now(), suspended_reason = $2, updated_at = now()
             where id = $1 and status = 'active' returning id`
        : `update app.users set status = 'active', suspended_at = null, suspended_reason = null, updated_at = now()
             where id = $1 and status = 'suspended' returning id`,
      suspend ? [userId, reason ?? null] : [userId],
    );
    if (!row) throw new AppError("not_found", "Account not found or not in a state that allows this.");
    await audit(q, {
      actorId: viewer.id,
      action: suspend ? "account.suspend" : "account.reactivate",
      targetType: "user",
      targetId: userId,
      ipHash: meta.ipHash,
      metadata: suspend && reason ? { reason } : {},
    });
  });
  if (suspend) await revokeAllSessions(userId);
}

// ---------------------------------------------------------------- audit + overview

export type AuditRow = { id: string; at: Date; actor_alias: string | null; action: string; target_type: string | null; target_id: string | null; metadata: Record<string, unknown> };

export async function listAudit(viewer: Viewer, limit = 200): Promise<AuditRow[]> {
  assert(viewer, "audit.view");
  return asViewer(viewer.id, (q) =>
    q.query<AuditRow>(
      `select l.id::text, l.at, u.alias::text as actor_alias, l.action, l.target_type, l.target_id, l.metadata
         from app.audit_log l left join app.users u on u.id = l.actor_id
        order by l.at desc, l.id desc limit $1`,
      [limit],
    ),
  );
}

export async function overview(viewer: Viewer) {
  assert(viewer, "applications.review");
  return asViewer(viewer.id, async (q) => {
    const r = await q.one<{ pending_apps: number; pending_refs: number; active_invites: number; active_members: number; creators: number }>(
      `select
         (select count(*)::int from app.applications where status = 'pending') as pending_apps,
         (select count(*)::int from app.referral_requests where status = 'pending') as pending_refs,
         (select count(*)::int from app.invitations where revoked_at is null and expires_at > now() and use_count < max_uses) as active_invites,
         (select count(*)::int from app.users where status = 'active' and role = 'member') as active_members,
         (select count(*)::int from app.users where status = 'active' and role = 'creator') as creators`,
    );
    return r!;
  });
}

// ---------------------------------------------------------------- email log

export type EmailRow = { id: string; to_email: string; template: string; subject: string; status: string; attempts: number; last_error: string | null; created_at: Date; sent_at: Date | null };

/** Delivery metadata only — bodies (which may hold one-time links) are never selectable by mk_app. */
export async function listEmailLog(viewer: Viewer, limit = 100): Promise<EmailRow[]> {
  assert(viewer, "audit.view");
  return asViewer(viewer.id, (q) =>
    q.query<EmailRow>(
      `select id, to_email::text as to_email, template, subject, status, attempts, last_error, created_at, sent_at
         from app.email_outbox order by created_at desc limit $1`,
      [limit],
    ),
  );
}
