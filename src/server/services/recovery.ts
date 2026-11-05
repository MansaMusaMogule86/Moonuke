import "server-only";
import { system, type Q } from "@/server/db";
import { hashPassword, randomToken, sha256 } from "@/server/auth/crypto";
import { appUrl } from "@/server/env";
import { AppError } from "@/server/errors";
import { enqueue } from "@/server/email/outbox";
import { emails, type SecurityEvent } from "@/server/email/templates";
import { audit } from "./audit";
import { revokeAllSessions } from "./sessions";

export const RESET_TTL_MIN = 30;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** Queue a security notification for a user inside the caller's transaction. */
export async function notifySecurity(q: Q, userId: string, event: SecurityEvent) {
  const u = await q.one<{ email: string }>(`select email::text as email from app.users where id = $1`, [userId]);
  if (u) await enqueue(q, u.email, emails.security({ event, at: new Date(), url: `${appUrl()}/account/security` }), userId);
}

/**
 * Request a reset link. Always resolves the same way whether or not the email
 * exists, so it can't be used to enumerate accounts. Suspended and rejected
 * accounts never receive a link.
 */
export async function requestPasswordReset(email: string, meta: { ipHash: string | null }): Promise<void> {
  await system(async (q) => {
    const u = await q.one<{ id: string }>(`select id from app.users where email = $1 and status in ('active', 'pending')`, [email]);
    if (!u) {
      await audit(q, { actorId: null, action: "auth.reset_unknown", ipHash: meta.ipHash });
      return;
    }
    // One live link at a time.
    await q.query(`update app.password_resets set used_at = now() where user_id = $1 and used_at is null`, [u.id]);
    const token = randomToken();
    await q.query(
      `insert into app.password_resets (token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(mins => $3))`,
      [sha256(token), u.id, RESET_TTL_MIN],
    );
    await enqueue(q, email, emails.passwordReset({ url: `${appUrl()}/reset/${token}`, minutes: RESET_TTL_MIN }), u.id);
    await audit(q, { actorId: u.id, action: "auth.reset_requested", targetType: "user", targetId: u.id, ipHash: meta.ipHash });
  });
}

export async function inspectResetToken(token: string): Promise<boolean> {
  if (!TOKEN_RE.test(token)) return false;
  const row = await system((q) =>
    q.one(`select 1 from app.password_resets r join app.users u on u.id = r.user_id
            where r.token_hash = $1 and r.used_at is null and r.expires_at > now() and u.status in ('active','pending')`, [sha256(token)]),
  );
  return !!row;
}

/** Consume a reset token, set the password, revoke every session, notify. */
export async function resetPassword(token: string, newPassword: string, meta: { ipHash: string | null }): Promise<void> {
  if (!TOKEN_RE.test(token)) throw new AppError("invalid_invitation", "This reset link is no longer valid.");
  const hash = await hashPassword(newPassword);
  await system(async (q) => {
    const r = await q.one<{ user_id: string }>(
      `update app.password_resets r set used_at = now()
         from app.users u
        where r.token_hash = $1 and r.used_at is null and r.expires_at > now()
          and u.id = r.user_id and u.status in ('active', 'pending')
        returning r.user_id`,
      [sha256(token)],
    );
    if (!r) throw new AppError("invalid_invitation", "This reset link is no longer valid.");
    await q.query(`update app.users set password_hash = $2, updated_at = now() where id = $1`, [r.user_id, hash]);
    await revokeAllSessions(r.user_id, q);
    await notifySecurity(q, r.user_id, "password_changed");
    await audit(q, { actorId: r.user_id, action: "auth.password_reset", targetType: "user", targetId: r.user_id, ipHash: meta.ipHash });
  });
}
