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
} satisfies Record<string, Limit>;

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
