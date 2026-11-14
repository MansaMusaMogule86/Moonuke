import "server-only";
import { system } from "@/server/db";
import { dummyHash, hashPassword, sha256, verifyPassword } from "@/server/auth/crypto";
import type { Role, Viewer } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { audit } from "./audit";
import { contextFromMeta, recordBlockedAttempt, recordLoginFailure, recordLoginSuccess, recordRegistration, type SecurityContext } from "@/server/security/monitor";
import { enqueue } from "@/server/email/outbox";
import { emails } from "@/server/email/templates";
import { appUrl } from "@/server/env";
import { emailVerificationToken } from "./emailVerification";
import { creatorEmailAllowed } from "@/server/auth/creatorAllowlist";
import { validateCreatorChosenName } from "@/lib/creatorName";
import { checkText } from "@/server/ai/safety";
import { createSession, revokeAllSessions } from "./sessions";

const INVALID = "This invitation is no longer valid.";
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export type InvitationPreview = { role: Exclude<Role, "owner">; emailLocked: boolean; expiresAt: Date; activation: boolean };

/**
 * Checks an invitation token without consuming it. Every failure mode
 * (malformed, unknown, expired, revoked, exhausted) returns null so the
 * response never reveals which one applied.
 */
export async function inspectInvitation(token: string): Promise<InvitationPreview | null> {
  if (!TOKEN_RE.test(token)) return null;
  return system(async (q) => {
    const row = await q.one<{ intended_role: "member" | "creator"; email: string | null; expires_at: Date; activation: boolean }>(
      `select intended_role, email, expires_at, activates_user_id is not null as activation from app.invitations
        where token_hash = $1 and revoked_at is null and expires_at > now() and use_count < max_uses`,
      [sha256(token)],
    );
    return row ? { role: row.intended_role, emailLocked: !!row.email, expiresAt: row.expires_at, activation: row.activation } : null;
  });
}

export type Application = { alias: string; email: string; password: string };

/**
 * Redeems an invitation: atomically consumes one use, creates a PENDING
 * account and its application, opens a session, and audits — all in one
 * transaction. Concurrent redemptions cannot exceed max_uses because the
 * consuming UPDATE re-checks every condition under a row lock.
 */
export async function redeemInvitation(
  token: string,
  input: Application,
  meta: { ipHash: string | null; userAgent: string | null; security?: SecurityContext },
): Promise<{ sessionToken: string; userId: string }> {
  if (!TOKEN_RE.test(token)) throw new AppError("invalid_invitation", INVALID);
  const passwordHash = await hashPassword(input.password);

  const done = await system(async (q) => {
    // Activation links complete a provisioned account (activateProvisionedAccount), never create one.
    const inv = await q.one<{ id: string; intended_role: Role; email: string | null }>(
      `update app.invitations set use_count = use_count + 1
        where token_hash = $1 and revoked_at is null and expires_at > now() and use_count < max_uses and activates_user_id is null
        returning id, intended_role, email::text as email`,
      [sha256(token)],
    );
    if (!inv) throw new AppError("invalid_invitation", INVALID);
    if (inv.email && inv.email.toLowerCase() !== input.email.toLowerCase()) {
      throw new AppError("validation", "This invitation was issued for a different email address.", "email");
    }
    // Creator invitations are bound to an allowlisted address (the database guard enforces the same).
    if (inv.intended_role === "creator" && (!inv.email || !(await creatorEmailAllowed(q, inv.email)))) {
      throw new AppError("invalid_invitation", INVALID);
    }

    let finalAlias = input.alias.trim();
    if (inv.intended_role === "creator") {
      const nameValidation = validateCreatorChosenName(input.alias);
      if (!nameValidation.ok) {
        throw new AppError("validation", nameValidation.error, "alias");
      }
      const safety = checkText(nameValidation.chosenName);
      if (!safety.ok) {
        throw new AppError("validation", safety.reason ?? "Choose another creator name.", "alias");
      }
      finalAlias = nameValidation.publicName;
    }

    const clash = await q.one<{ email_taken: boolean; alias_taken: boolean }>(
      `select exists(select 1 from app.users where email = $1) as email_taken,
              exists(select 1 from app.users where alias = $2) as alias_taken`,
      [input.email, finalAlias],
    );
    if (clash?.email_taken) throw new AppError("conflict", "An account with this email already exists. Sign in instead.", "email");
    if (clash?.alias_taken) throw new AppError("conflict", "That alias is taken. Choose another.", "alias");

    const user = await q.one<{ id: string }>(
      `insert into app.users (email, password_hash, role, status, alias, adult_attested_at, invitation_id)
       values ($1, $2, $3, 'pending', $4, now(), $5) returning id`,
      [input.email, passwordHash, inv.intended_role, finalAlias, inv.id],
    );
    const application = await q.one<{ id: string }>(`insert into app.applications (user_id, invitation_id) values ($1, $2) returning id`, [user!.id, inv.id]);
    // White-glove: attach the new account to its onboarding case, if the house opened one.
    await q.query(`update app.onboarding_cases set user_id = $1, updated_at = now() where invitation_id = $2 and user_id is null`, [user!.id, inv.id]);
    await audit(q, {
      actorId: user!.id,
      action: "application.submit",
      targetType: "invitation",
      targetId: inv.id,
      ipHash: meta.ipHash,
      metadata: { role: inv.intended_role },
    });
    // Same transaction as the account: this email exists only if the account was really created.
    await enqueue(q, input.email, emails.accountCreated({ alias: finalAlias, verifyUrl: `${appUrl()}/verify-email/${emailVerificationToken(user!.id)}` }), user!.id);
    const sessionToken = await createSession(user!.id, meta.userAgent, q);
    return { sessionToken, userId: user!.id, role: inv.intended_role, invitationId: inv.id, applicationId: application!.id };
  });
  // Recorded only after the account committed; an invalid invitation never gets here.
  await recordRegistration(
    { userId: done.userId, role: done.role, invitationId: done.invitationId, applicationId: done.applicationId },
    contextFromMeta(meta),
  );
  return { sessionToken: done.sessionToken, userId: done.userId };
}

/**
 * Email + password sign-in. Same message and comparable timing whether the
 * email is unknown, the password is wrong, or the account is not allowed in.
 */
export async function signIn(
  email: string,
  password: string,
  meta: { ipHash: string | null; userAgent: string | null; security?: SecurityContext },
): Promise<{ sessionToken: string; viewer: Viewer }> {
  const fail = new AppError("invalid_credentials", "That email and password don't match an account.");
  const ctx = contextFromMeta(meta);
  const row = await system((q) =>
    q.one<Omit<Viewer, "aal" | "mfa"> & { password_hash: string; has_factor: boolean; must_change_password: boolean }>(
      `select u.id, u.role, u.status, u.alias::text as alias, u.email::text as email, u.password_hash, u.must_change_password,
              exists (select 1 from app.mfa_factors f where f.user_id = u.id and f.confirmed_at is not null) as has_factor
         from app.users u where u.email = $1`,
      [email],
    ),
  );
  const ok = await verifyPassword(password, row?.password_hash ?? (await dummyHash()));
  // A provisioned account must be activated (temporary password replaced) before any session exists.
  if (row && ok && row.must_change_password) {
    await system((q) => audit(q, { actorId: row.id, action: "auth.signin_activation_required", ipHash: meta.ipHash }));
    throw new AppError("forbidden", "Finish activating your account with the link in your invitation email first.");
  }
  if (!row || !ok) {
    await system((q) => audit(q, { actorId: row?.id ?? null, action: "auth.signin_failed", ipHash: meta.ipHash }));
    await recordLoginFailure(email, row?.id ?? null, ctx, "bad_credentials");
    throw fail;
  }
  if (row.status === "suspended" || row.status === "rejected") {
    await system((q) => audit(q, { actorId: row.id, action: "auth.signin_blocked", ipHash: meta.ipHash, metadata: { status: row.status } }));
    await recordBlockedAttempt(email, row.id, row.status, ctx);
    throw new AppError("forbidden", "This account can't sign in. Contact the house if you think this is a mistake.");
  }
  const out = await system(async (q) => {
    const sessionToken = await createSession(row.id, meta.userAgent, q);
    await audit(q, { actorId: row.id, action: "auth.signin", ipHash: meta.ipHash });
    const session = await q.one<{ public_id: string }>(`select public_id from app.sessions where id_hash = $1`, [sha256(sessionToken)]);
    const { password_hash: _ph, has_factor, must_change_password: _mc, ...rest } = row;
    const viewer: Viewer = { ...rest, mfa: has_factor ? "pending" : "none", aal: 1, sessionId: session!.public_id };
    return { sessionToken, viewer };
  });
  // Complete only when no second factor is needed. Enrolled accounts complete at the challenge;
  // an owner without a factor completes when enrolment succeeds (MFA is mandatory for owners).
  if (out.viewer.mfa === "none" && out.viewer.role !== "owner") {
    await recordLoginSuccess({ userId: out.viewer.id, role: out.viewer.role, sessionRef: out.viewer.sessionId!, method: "password" }, ctx);
  }
  return out;
}

export type Activation = { temporaryPassword: string; password: string };

/**
 * Activate a provisioned creator from their single-use, email-bound link:
 * the link proves the address, the temporary password proves the bootstrap
 * secret, and the new password replaces it. A wrong temporary password
 * doesn't consume the link (the transaction rolls back); attempts are rate
 * limited by the caller. Same message for every failure.
 */
export async function activateProvisionedAccount(token: string, input: Activation, meta: { ipHash: string | null }): Promise<void> {
  if (!TOKEN_RE.test(token)) throw new AppError("invalid_invitation", INVALID);
  if (input.temporaryPassword === input.password) throw new AppError("validation", "Choose a new password, different from the temporary one.", "password");
  const passwordHash = await hashPassword(input.password);
  await system(async (q) => {
    const inv = await q.one<{ id: string; user_id: string; email: string }>(
      `update app.invitations set use_count = use_count + 1
        where token_hash = $1 and revoked_at is null and expires_at > now() and use_count < max_uses and activates_user_id is not null
        returning id, activates_user_id as user_id, email::text as email`,
      [sha256(token)],
    );
    // Bound to its address: the account must still have exactly that email and be awaiting activation.
    const u = inv && (await q.one<{ id: string; password_hash: string; created_by: string | null }>(
      `select u.id, u.password_hash, i.created_by from app.users u join app.invitations i on i.id = $3
        where u.id = $1 and u.email = $2 and u.must_change_password and u.status = 'pending'`,
      [inv.user_id, inv.email, inv.id],
    ));
    if (!inv || !u || !(await verifyPassword(input.temporaryPassword, u.password_hash))) throw new AppError("invalid_invitation", INVALID);
    if (!(await creatorEmailAllowed(q, inv.email))) throw new AppError("invalid_invitation", INVALID);
    await q.query(
      `update app.users set password_hash = $2, must_change_password = false, email_verified_at = coalesce(email_verified_at, now()),
              adult_attested_at = now(), status = 'active', approved_at = coalesce(approved_at, now()), approved_by = coalesce(approved_by, $3), updated_at = now()
        where id = $1`,
      [u.id, passwordHash, u.created_by],
    );
    await revokeAllSessions(u.id, q);
    await audit(q, { actorId: u.id, action: "account.activate", targetType: "invitation", targetId: inv.id, ipHash: meta.ipHash });
  });
}

/** Bootstrap the single platform owner (CLI / seed only). */
export async function createOwner(input: { email: string; password: string; alias: string }) {
  const passwordHash = await hashPassword(input.password);
  return system(async (q) => {
    const row = await q.one<{ id: string }>(
      `insert into app.users (email, password_hash, role, status, alias, adult_attested_at, approved_at)
       values ($1, $2, 'owner', 'active', $3, now(), now()) returning id`,
      [input.email, passwordHash, input.alias],
    );
    await audit(q, { actorId: row!.id, action: "owner.bootstrap", targetType: "user", targetId: row!.id });
    return row!.id;
  });
}
