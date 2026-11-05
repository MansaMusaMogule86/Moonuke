import "server-only";
import { system } from "@/server/db";

/**
 * Housekeeping for data that is already dead: expired rate-limit windows,
 * spent or expired reset tokens, and sessions that ended long ago.
 *
 * Deliberately does NOT touch the audit log, the email outbox, accounts or
 * any content: their retention periods are a legal decision (UNKNOWN).
 * Runs as system() because these tables are not readable by mk_app.
 */
export const RETENTION = {
  rateLimitDays: 2,
  passwordResetDays: 7,
  endedSessionDays: 30,
} as const;

export type MaintenanceResult = { rateLimits: number; expiredResets: number; sessions: number; abandonedUploads: number };

export async function runMaintenance(now = new Date()): Promise<MaintenanceResult> {
  return system(async (q) => {
    const day = 86_400_000;
    const at = (days: number) => new Date(now.getTime() - days * day);
    const rl = await q.query(`delete from app.rate_limits where window_start < $1 returning 1`, [at(RETENTION.rateLimitDays)]);
    const pr = await q.query(
      `delete from app.password_resets where (used_at is not null and used_at < $1) or expires_at < $1 returning 1`,
      [at(RETENTION.passwordResetDays)],
    );
    const ss = await q.query(
      `delete from app.sessions where (revoked_at is not null and revoked_at < $1) or expires_at < $1 returning 1`,
      [at(RETENTION.endedSessionDays)],
    );
    // Uploads stuck mid-pipeline for over a day (objects are removed by the
    // storage adapter's cleanup once one is approved; none exists yet).
    const up = await q.query(
      `update app.media_uploads set status = 'abandoned', reason = 'abandoned', updated_at = now()
        where status in ('pending', 'uploaded', 'scanning') and created_at < $1 returning 1`,
      [at(1)],
    );
    return { rateLimits: rl.length, expiredResets: pr.length, sessions: ss.length, abandonedUploads: up.length };
  });
}
