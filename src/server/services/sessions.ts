import "server-only";
import { featureEnabled } from "@/server/flags";
import { system, type Q } from "@/server/db";
import { randomToken, sha256 } from "@/server/auth/crypto";
import type { Viewer } from "@/server/auth/permissions";

export const SESSION_TTL_DAYS = 14;

/** Creates a session and returns the raw token (only ever placed in the cookie). */
export async function createSession(userId: string, userAgent: string | null, q?: Q): Promise<string> {
  const token = randomToken();
  const run = (qq: Q) =>
    qq.query(
      `insert into app.sessions (id_hash, user_id, expires_at, user_agent)
       values ($1, $2, now() + make_interval(days => $3), $4)`,
      [sha256(token), userId, SESSION_TTL_DAYS, userAgent?.slice(0, 300) ?? null],
    );
  if (q) await run(q);
  else await system(run);
  return token;
}

/** Resolves a cookie token to its account. Suspended/rejected accounts resolve to null. */
export async function resolveSession(token: string | undefined | null): Promise<Viewer | null> {
  if (!token || token.length > 100) return null;
  return system(async (q) => {
    const row = await q.one<Omit<Viewer, "aal" | "mfa"> & { last_seen_at: Date; has_factor: boolean; mfa_verified: boolean; public_id: string }>(
      `select u.id, u.role, u.status, u.alias::text as alias, u.email::text as email, s.last_seen_at, s.public_id,
              (f.confirmed_at is not null) as has_factor, (s.mfa_verified_at is not null) as mfa_verified
         from app.sessions s join app.users u on u.id = s.user_id
         left join app.mfa_factors f on f.user_id = u.id
        where s.id_hash = $1 and s.revoked_at is null and s.expires_at > now()
          and u.status in ('pending', 'active')`,
      [sha256(token)],
    );
    if (!row) return null;
    const mfa = row.has_factor ? (row.mfa_verified ? "verified" : "pending") : "none";
    if (Date.now() - new Date(row.last_seen_at).getTime() > 5 * 60_000) {
      await q.query(`update app.sessions set last_seen_at = now() where id_hash = $1`, [sha256(token)]);
    }
    const aal = mfa === "verified" ? 2 : 1;
    // Moderator capabilities: only with the flag on, the owner's switch on, a live grant and AAL2.
    let staff: string[] = [];
    if (row.role === "member" && row.status === "active" && aal === 2 && featureEnabled("moderators")) {
      const g = await q.one<{ caps: string[] }>(
        `select g.capabilities as caps from app.staff_grants g, app.safety_settings s where g.user_id = $1 and g.revoked_at is null and s.id and s.moderators_enabled`,
        [row.id],
      );
      staff = g?.caps ?? [];
    }
    return {
      id: row.id,
      role: row.role,
      status: row.status,
      alias: row.alias,
      email: row.email,
      mfa,
      aal,
      sessionId: row.public_id,
      staff,
    };
  });
}

export async function revokeSession(token: string) {
  await system((q) => q.query(`update app.sessions set revoked_at = now() where id_hash = $1 and revoked_at is null`, [sha256(token)]));
}

/** Used on suspension / rejection. Runs in the caller's transaction when given. */
export async function revokeAllSessions(userId: string, q?: Q) {
  const run = (qq: Q) => qq.query(`update app.sessions set revoked_at = now() where user_id = $1 and revoked_at is null`, [userId]);
  if (q) await run(q);
  else await system(run);
}
