import "server-only";
import { system } from "@/server/db";
import { AppError } from "@/server/errors";

export type Limit = { limit: number; windowSec: number };

export const LIMITS = {
  signinIp: { limit: 8, windowSec: 15 * 60 },
  signinEmail: { limit: 5, windowSec: 15 * 60 },
  inviteView: { limit: 30, windowSec: 10 * 60 },
  applySubmit: { limit: 5, windowSec: 60 * 60 },
  referralRequest: { limit: 10, windowSec: 24 * 60 * 60 },
  invitationCreate: { limit: 60, windowSec: 60 * 60 },
  forgotIp: { limit: 10, windowSec: 60 * 60 },
  forgotEmail: { limit: 3, windowSec: 60 * 60 },
  resetSubmit: { limit: 10, windowSec: 60 * 60 },
  // 6-digit codes: 5 tries per 15 min per account keeps guessing odds negligible.
  mfaChallenge: { limit: 5, windowSec: 15 * 60 },
  mfaChallengeIp: { limit: 20, windowSec: 15 * 60 },
  passwordChange: { limit: 5, windowSec: 60 * 60 },
  reportFile: { limit: 20, windowSec: 24 * 60 * 60 },
  aiAssist: { limit: 30, windowSec: 24 * 60 * 60 },
  profileImport: { limit: 20, windowSec: 24 * 60 * 60 },
  blockToggle: { limit: 60, windowSec: 60 * 60 },
} satisfies Record<string, Limit>;

/**
 * Per-IP limit. Skipped when the deployment has no trusted proxy (ipHash is
 * null) so a shared "unknown" bucket can't lock everyone out; account-keyed
 * limits still apply in that case.
 */
export async function hitIp(prefix: string, ipHash: string | null, lim: Limit): Promise<number | null> {
  if (!ipHash) return null;
  return hit(`${prefix}:ip:${ipHash}`, lim);
}

/**
 * Fixed-window counter stored in Postgres, so limits hold across instances.
 * Returns the remaining allowance; throws `rate_limited` when exceeded.
 */
export async function hit(bucket: string, { limit, windowSec }: Limit): Promise<number> {
  const count = await system(async (q) => {
    const row = await q.one<{ count: number }>(
      `insert into app.rate_limits (bucket, window_start, count)
       values ($1, to_timestamp(floor(extract(epoch from now()) / $2) * $2), 1)
       on conflict (bucket, window_start) do update set count = app.rate_limits.count + 1
       returning count`,
      [bucket, windowSec],
    );
    // Opportunistic cleanup of stale windows (cheap, indexed by PK prefix).
    if (Math.random() < 0.02) {
      await q.query(`delete from app.rate_limits where window_start < now() - interval '2 days'`);
    }
    return row!.count;
  });
  if (count > limit) {
    throw new AppError("rate_limited", "Too many attempts. Please wait a little and try again.");
  }
  return limit - count;
}
