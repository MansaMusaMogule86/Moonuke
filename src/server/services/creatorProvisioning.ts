import "server-only";
import { randomBytes } from "node:crypto";
import { creatorEmailAllowed, normalizeEmail } from "@/server/auth/creatorAllowlist";
import { hashPassword, randomToken, sha256 } from "@/server/auth/crypto";
import { system } from "@/server/db";
import { enqueue } from "@/server/email/outbox";
import { emails } from "@/server/email/templates";
import { appUrl } from "@/server/env";
import { AppError } from "@/server/errors";
import { password as passwordRule } from "@/server/validation";
import { audit } from "./audit";

export type ProvisionOutcome = "created" | "reissued" | "already_active" | "skipped_other_role";
export type ProvisionResult = { outcome: ProvisionOutcome; activationUrl?: string; expiresAt?: Date };

/**
 * Owner-run, idempotent provisioning of one allowlisted creator (see
 * scripts/provision-creators.ts). It never changes an account with another
 * role and never touches an already-activated creator. Otherwise it stores
 * only a hash of the temporary password, marks the account for activation,
 * and issues a fresh single-use, email-bound activation link (any earlier
 * unused link is revoked). The owner's run is the approval, recorded as
 * the owner's decision on the application. The temporary password is never
 * stored, logged or emailed.
 */
export async function provisionCreator(input: { email: string; temporaryPassword: string }, opts: { send?: boolean } = {}): Promise<ProvisionResult> {
  const email = normalizeEmail(input.email);
  const pw = passwordRule.safeParse(input.temporaryPassword);
  if (!pw.success) throw new AppError("validation", "The temporary password must be 12 to 200 characters.");
  const hash = await hashPassword(input.temporaryPassword);
  return system(async (q) => {
    if (!(await creatorEmailAllowed(q, email))) throw new AppError("forbidden", "That address is not on the creator allowlist.");
    const owner = await q.one<{ id: string }>(`select id from app.users where role = 'owner' and status = 'active'`);
    if (!owner) throw new AppError("conflict", "Create the owner account first: provisioning is the owner's approval.");

    const existing = await q.one<{ id: string; role: string; must_change_password: boolean }>(
      `select id, role, must_change_password from app.users where email = $1 for update`,
      [email],
    );
    if (existing && existing.role !== "creator") {
      await audit(q, { actorId: owner.id, action: "creator.provision", targetType: "user", targetId: existing.id, metadata: { outcome: "skipped_other_role" } });
      return { outcome: "skipped_other_role" };
    }
    if (existing && !existing.must_change_password) {
      await audit(q, { actorId: owner.id, action: "creator.provision", targetType: "user", targetId: existing.id, metadata: { outcome: "already_active" } });
      return { outcome: "already_active" };
    }

    let userId: string;
    let outcome: ProvisionOutcome;
    if (existing) {
      userId = existing.id;
      outcome = "reissued";
      await q.query(`update app.users set password_hash = $2, updated_at = now() where id = $1`, [userId, hash]);
      await q.query(`update app.invitations set revoked_at = now() where activates_user_id = $1 and revoked_at is null and use_count < max_uses`, [userId]);
    } else {
      outcome = "created";
      let alias = "";
      for (let i = 0; i < 5 && !alias; i++) {
        const candidate = `Creator ${randomBytes(3).toString("hex")}`;
        if (!(await q.one(`select 1 from app.users where alias = $1`, [candidate]))) alias = candidate;
      }
      const row = await q.one<{ id: string }>(
        `insert into app.users (email, password_hash, role, status, alias, must_change_password) values ($1, $2, 'creator', 'pending', $3, true) returning id`,
        [email, hash, alias],
      );
      userId = row!.id;
    }

    const token = randomToken();
    const inv = await q.one<{ id: string; expires_at: Date }>(
      `insert into app.invitations (token_hash, intended_role, email, max_uses, expires_at, note, created_by, activates_user_id)
       values ($1, 'creator', $2, 1, now() + interval '7 days', 'Creator activation (provisioned)', $3, $4) returning id, expires_at`,
      [sha256(token), email, owner.id, userId],
    );
    await q.query(`update app.users set invitation_id = coalesce(invitation_id, $2) where id = $1`, [userId, inv!.id]);
    await q.query(
      `insert into app.applications (user_id, invitation_id, status, decided_at, decided_by, decision_note)
       values ($1, $2, 'approved', now(), $3, 'Provisioned creator (allowlist)') on conflict (user_id) do nothing`,
      [userId, inv!.id, owner.id],
    );
    const activationUrl = `${appUrl()}/invite/${token}`;
    if (opts.send) {
      await enqueue(q, email, emails.creatorActivation({ url: activationUrl, expiresAt: inv!.expires_at }), userId, { dedupeKey: `creator_activation:${inv!.id}` });
    }
    await audit(q, { actorId: owner.id, action: "creator.provision", targetType: "user", targetId: userId, metadata: { outcome, emailed: !!opts.send } });
    return { outcome, activationUrl, expiresAt: inv!.expires_at };
  });
}
