import "server-only";
import { asViewer } from "@/server/db";
import { can, type Viewer } from "@/server/auth/permissions";
import { isStaffCapability, type StaffCapability } from "@/server/auth/staff";
import { AppError } from "@/server/errors";
import { isProd } from "@/server/env";
import { featureEnabled } from "@/server/flags";

// =====================================================================
// Owner management of the restricted moderator role (INACTIVE).
// Granting or switching the role on needs FEATURE_MODERATORS=on, which
// production refuses until the owner approves. Revoking and switching off
// are always allowed.
// =====================================================================

type Opts = { testing?: boolean };
function assertOwner(v: Viewer) {
  if (!can(v, "moderation.review")) throw new AppError("forbidden", "Not allowed.");
}
function assertApproved(o: Opts) {
  if (o.testing && !isProd()) return;
  if (!featureEnabled("moderators")) throw new AppError("forbidden", "Moderator access isn't approved yet.");
}

export type StaffRow = {
  user_id: string; alias: string; email: string; capabilities: StaffCapability[]; note: string | null;
  granted_at: Date; revoked_at: Date | null; revoke_reason: string | null; actions: number;
};
export async function staffOverview(v: Viewer): Promise<{ flag: boolean; enabled: boolean; grants: StaffRow[] }> {
  assertOwner(v);
  return asViewer(v, async (q) => ({
    flag: featureEnabled("moderators"),
    enabled: !!(await q.one<{ e: boolean }>(`select app.moderators_enabled() as e`))?.e,
    grants: await q.query<StaffRow>(
      `select g.user_id, u.alias::text as alias, u.email::text as email, g.capabilities, g.note, g.granted_at, g.revoked_at, g.revoke_reason,
              (select count(*)::int from app.audit_log a where a.actor_id = g.user_id and a.at >= g.granted_at) as actions
         from app.staff_grants g join app.users u on u.id = g.user_id order by g.revoked_at nulls first, g.granted_at desc`,
    ),
  }));
}

export async function grantStaff(v: Viewer, email: string, caps: string[], note: string, o: Opts = {}) {
  assertOwner(v);
  assertApproved(o);
  const list = [...new Set(caps)];
  if (!list.length || !list.every(isStaffCapability)) throw new AppError("validation", "Choose at least one capability.", "capabilities");
  await asViewer(v, async (q) => {
    const u = await q.one<{ id: string }>(`select id from app.users where email = $1`, [email.trim().toLowerCase()]);
    if (!u) throw new AppError("not_found", "No account with that email.", "email");
    await q.query(`select app.grant_staff($1, $2::text[], $3)`, [u.id, list, note.trim().slice(0, 300)]).catch((e) => {
      if ((e as { code?: string }).code === "22023") throw new AppError("validation", "Moderators must be active members (not creators) with two-step sign-in set up.", "email");
      throw e;
    });
  });
}

export async function revokeStaff(v: Viewer, userId: string, reason: string) {
  assertOwner(v);
  await asViewer(v, (q) =>
    q.query(`select app.revoke_staff($1, $2)`, [userId, reason.trim().slice(0, 300)]).catch((e) => {
      if ((e as { code?: string }).code === "P0002") throw new AppError("not_found", "No active grant.");
      throw e;
    }),
  );
}

export async function setModeratorsEnabled(v: Viewer, on: boolean, o: Opts = {}) {
  assertOwner(v);
  if (on) assertApproved(o);
  await asViewer(v, (q) => q.query(`select app.set_moderators_enabled($1)`, [on]));
}

export type StaffAction = { id: string; actor: string; action: string; target_type: string | null; target_id: string | null; created_at: Date };
/** Everything moderators did, from the append-only audit log. */
export async function staffActivity(v: Viewer, limit = 200): Promise<StaffAction[]> {
  assertOwner(v);
  return asViewer(v, (q) =>
    q.query<StaffAction>(
      `select a.id::text, u.alias::text as actor, a.action, a.target_type, a.target_id::text, a.at as created_at
         from app.audit_log a join app.staff_grants g on g.user_id = a.actor_id and a.at >= g.granted_at
         join app.users u on u.id = a.actor_id
        order by a.at desc limit $1`,
      [limit],
    ),
  );
}
