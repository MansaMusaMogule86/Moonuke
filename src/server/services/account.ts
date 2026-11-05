import "server-only";
import { system } from "@/server/db";
import { hashPassword, verifyPassword } from "@/server/auth/crypto";
import type { Viewer } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { audit } from "./audit";
import { notifySecurity } from "./recovery";

export type SessionRow = { id: string; created_at: Date; last_seen_at: Date; expires_at: Date; user_agent: string | null; mfa: boolean; current: boolean };

/** The viewer's own live sessions. Exposes the public handle, never token material. */
export async function listSessions(viewer: Viewer): Promise<SessionRow[]> {
  return system((q) =>
    q.query<SessionRow>(
      `select public_id as id, created_at, last_seen_at, expires_at, user_agent, (mfa_verified_at is not null) as mfa,
              public_id = $2::uuid as current
         from app.sessions
        where user_id = $1 and revoked_at is null and expires_at > now()
        order by (public_id = $2::uuid) desc, last_seen_at desc`,
      [viewer.id, viewer.sessionId ?? "00000000-0000-0000-0000-000000000000"],
    ),
  );
}

/** Revoke one of the viewer's OWN sessions (never anyone else's). */
export async function revokeOwnSession(viewer: Viewer, sessionId: string): Promise<void> {
  await system(async (q) => {
    const r = await q.one(`update app.sessions set revoked_at = now() where public_id = $1 and user_id = $2 and revoked_at is null returning 1`, [sessionId, viewer.id]);
    if (!r) throw new AppError("not_found", "Session not found.");
    await audit(q, { actorId: viewer.id, action: "session.revoke", targetType: "session", targetId: sessionId });
  });
}

export async function revokeOtherSessions(viewer: Viewer): Promise<number> {
  return system(async (q) => {
    const rows = await q.query(
      `update app.sessions set revoked_at = now() where user_id = $1 and revoked_at is null and public_id <> $2::uuid returning 1`,
      [viewer.id, viewer.sessionId ?? "00000000-0000-0000-0000-000000000000"],
    );
    if (rows.length) {
      await notifySecurity(q, viewer.id, "sessions_revoked");
      await audit(q, { actorId: viewer.id, action: "session.revoke_others", metadata: { count: rows.length } });
    }
    return rows.length;
  });
}

/** Change password with the current one; keeps this session, signs out all others. */
export async function changePassword(viewer: Viewer, current: string, next: string): Promise<void> {
  const row = await system((q) => q.one<{ password_hash: string }>(`select password_hash from app.users where id = $1`, [viewer.id]));
  if (!row || !(await verifyPassword(current, row.password_hash))) {
    throw new AppError("validation", "Your current password is incorrect.", "current");
  }
  const hash = await hashPassword(next);
  await system(async (q) => {
    await q.query(`update app.users set password_hash = $2, updated_at = now() where id = $1`, [viewer.id, hash]);
    await q.query(
      `update app.sessions set revoked_at = now() where user_id = $1 and revoked_at is null and public_id <> $2::uuid`,
      [viewer.id, viewer.sessionId ?? "00000000-0000-0000-0000-000000000000"],
    );
    await notifySecurity(q, viewer.id, "password_changed");
    await audit(q, { actorId: viewer.id, action: "auth.password_change", targetType: "user", targetId: viewer.id });
  });
}
