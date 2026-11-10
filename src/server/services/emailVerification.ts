import "server-only";
import { hmac, safeEqual } from "@/server/auth/crypto";
import { system } from "@/server/db";
import { audit } from "./audit";

/**
 * Email confirmation links: <userId>.<expiry>.<HMAC>, valid for 7 days. No
 * table is needed; confirming twice is harmless. Confirmation is recorded
 * only (email_verified_at) and does not change who may join: the invitation
 * and owner-approval rules are unchanged.
 */
const TTL_SECONDS = 7 * 24 * 60 * 60;
const SHAPE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(\d{10})\.([A-Za-z0-9_-]{43})$/;

export function emailVerificationToken(userId: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + TTL_SECONDS;
  return `${userId}.${exp}.${hmac(`verify-email:${userId}:${exp}`)}`;
}

/** The account a valid, unexpired link belongs to, or null. */
export function readEmailVerificationToken(token: string, now = Date.now()): string | null {
  const m = SHAPE.exec(token);
  if (!m) return null;
  const [, userId, exp, sig] = m;
  if (Number(exp) * 1000 < now) return null;
  return safeEqual(sig, hmac(`verify-email:${userId}:${exp}`)) ? userId : null;
}

export async function confirmEmail(token: string, meta: { ipHash: string | null }): Promise<boolean> {
  const userId = readEmailVerificationToken(token);
  if (!userId) return false;
  return system(async (q) => {
    const u = await q.one<{ verified: boolean }>(
      `select email_verified_at is not null as verified from app.users where id = $1 and status in ('pending', 'active') for update`,
      [userId],
    );
    if (!u) return false;
    if (u.verified) return true; // already confirmed: nothing to do
    await q.query(`update app.users set email_verified_at = now() where id = $1`, [userId]);
    await audit(q, { actorId: userId, action: "account.email_verified", targetType: "user", targetId: userId, ipHash: meta.ipHash });
    return true;
  });
}
