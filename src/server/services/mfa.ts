import "server-only";
import QRCode from "qrcode";
import { system, type Q } from "@/server/db";
import { sha256 } from "@/server/auth/crypto";
import {
  decryptSecret,
  encryptSecret,
  newRecoveryCodes,
  newSecret,
  normalizeRecoveryCode,
  otpauthUri,
  verifyTotp,
} from "@/server/auth/totp";
import type { Viewer } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { audit } from "./audit";
import { notifySecurity } from "./recovery";

/**
 * TOTP second factor. All MFA material lives in tables only the system role
 * can reach; every function here is scoped to the authenticated viewer id.
 */
export type MfaStatus = { enrolled: boolean; pendingSetup: boolean; recoveryCodesLeft: number; mandatory: boolean };

export async function mfaStatus(viewer: Viewer): Promise<MfaStatus> {
  return system(async (q) => {
    const f = await q.one<{ confirmed: boolean }>(`select confirmed_at is not null as confirmed from app.mfa_factors where user_id = $1`, [viewer.id]);
    const c = await q.one<{ n: number }>(`select count(*)::int as n from app.mfa_recovery_codes where user_id = $1 and used_at is null`, [viewer.id]);
    return { enrolled: !!f?.confirmed, pendingSetup: !!f && !f.confirmed, recoveryCodesLeft: c?.n ?? 0, mandatory: viewer.role === "owner" };
  });
}

/** Begin (or restart) enrolment. Refused while a confirmed factor exists. */
export async function startEnrollment(viewer: Viewer): Promise<{ secret: string; uri: string; qrSvg: string }> {
  const secret = newSecret();
  await system(async (q) => {
    const existing = await q.one<{ confirmed_at: Date | null }>(`select confirmed_at from app.mfa_factors where user_id = $1 for update`, [viewer.id]);
    if (existing?.confirmed_at) throw new AppError("conflict", "Two-step sign-in is already on.");
    await q.query(
      `insert into app.mfa_factors (user_id, secret_enc) values ($1, $2)
       on conflict (user_id) do update set secret_enc = excluded.secret_enc, created_at = now(), confirmed_at = null, last_used_step = null`,
      [viewer.id, encryptSecret(secret)],
    );
  });
  const uri = otpauthUri(secret, viewer.email);
  const qrSvg = await QRCode.toString(uri, { type: "svg", margin: 1, color: { dark: "#050505", light: "#f6f0e6" } });
  return { secret, uri, qrSvg };
}

async function storeRecoveryCodes(q: Q, userId: string): Promise<string[]> {
  const codes = newRecoveryCodes();
  await q.query(`delete from app.mfa_recovery_codes where user_id = $1`, [userId]);
  for (const c of codes) {
    await q.query(`insert into app.mfa_recovery_codes (user_id, code_hash) values ($1, $2)`, [userId, sha256(normalizeRecoveryCode(c))]);
  }
  return codes;
}

/**
 * Confirm enrolment with a first code. Marks the CURRENT session as verified
 * (AAL2) and returns recovery codes — shown exactly once.
 */
export async function confirmEnrollment(viewer: Viewer, code: string): Promise<string[]> {
  return system(async (q) => {
    const f = await q.one<{ secret_enc: string; confirmed_at: Date | null }>(
      `select secret_enc, confirmed_at from app.mfa_factors where user_id = $1 for update`,
      [viewer.id],
    );
    if (!f || f.confirmed_at) throw new AppError("conflict", "Start setup again.");
    const step = verifyTotp(decryptSecret(f.secret_enc), code.trim(), null);
    if (step == null) throw new AppError("validation", "That code didn't match. Check your app's clock and try the newest code.", "code");
    await q.query(`update app.mfa_factors set confirmed_at = now(), last_used_step = $2 where user_id = $1`, [viewer.id, step]);
    if (viewer.sessionId) await q.query(`update app.sessions set mfa_verified_at = now() where public_id = $1 and user_id = $2`, [viewer.sessionId, viewer.id]);
    const codes = await storeRecoveryCodes(q, viewer.id);
    await notifySecurity(q, viewer.id, "mfa_enabled");
    await audit(q, { actorId: viewer.id, action: "mfa.enable", targetType: "user", targetId: viewer.id });
    return codes;
  });
}

/**
 * Complete sign-in for a session that is awaiting its second factor.
 * Accepts a current TOTP code or one unused recovery code.
 */
export async function verifyChallenge(viewer: Viewer, input: string, meta: { ipHash: string | null }): Promise<void> {
  if (viewer.mfa !== "pending" || !viewer.sessionId) throw new AppError("conflict", "Nothing to verify.");
  await system(async (q) => {
    const f = await q.one<{ secret_enc: string; last_used_step: string | null }>(
      `select secret_enc, last_used_step from app.mfa_factors where user_id = $1 and confirmed_at is not null for update`,
      [viewer.id],
    );
    if (!f) throw new AppError("conflict", "Two-step sign-in is not set up.");
    const raw = input.trim();
    let usedRecovery = false;
    if (/^\d{6}$/.test(raw)) {
      const step = verifyTotp(decryptSecret(f.secret_enc), raw, f.last_used_step == null ? null : Number(f.last_used_step));
      if (step == null) {
        await audit(q, { actorId: viewer.id, action: "mfa.challenge_failed", ipHash: meta.ipHash });
        throw new AppError("validation", "That code didn't work. Use the newest code from your app.", "code");
      }
      await q.query(`update app.mfa_factors set last_used_step = $2 where user_id = $1`, [viewer.id, step]);
    } else {
      const hit = await q.one<{ id: string }>(
        `update app.mfa_recovery_codes set used_at = now() where user_id = $1 and code_hash = $2 and used_at is null returning id`,
        [viewer.id, sha256(normalizeRecoveryCode(raw))],
      );
      if (!hit) {
        await audit(q, { actorId: viewer.id, action: "mfa.challenge_failed", ipHash: meta.ipHash });
        throw new AppError("validation", "That code didn't work.", "code");
      }
      usedRecovery = true;
    }
    await q.query(`update app.sessions set mfa_verified_at = now() where public_id = $1 and user_id = $2 and revoked_at is null`, [viewer.sessionId, viewer.id]);
    await audit(q, { actorId: viewer.id, action: usedRecovery ? "mfa.recovery_used" : "mfa.challenge_ok", ipHash: meta.ipHash });
    if (usedRecovery) await notifySecurity(q, viewer.id, "recovery_code_used");
    if (viewer.role === "owner") await notifySecurity(q, viewer.id, "owner_signin");
  });
}

async function requireCurrentCode(q: Q, viewer: Viewer, code: string) {
  const f = await q.one<{ secret_enc: string; last_used_step: string | null }>(
    `select secret_enc, last_used_step from app.mfa_factors where user_id = $1 and confirmed_at is not null for update`,
    [viewer.id],
  );
  if (!f) throw new AppError("conflict", "Two-step sign-in is not set up.");
  const step = verifyTotp(decryptSecret(f.secret_enc), code.trim(), f.last_used_step == null ? null : Number(f.last_used_step));
  if (step == null) throw new AppError("validation", "That code didn't work.", "code");
  await q.query(`update app.mfa_factors set last_used_step = $2 where user_id = $1`, [viewer.id, step]);
}

/** Members and creators may turn MFA off with a current code. The owner cannot. */
export async function disableMfa(viewer: Viewer, code: string): Promise<void> {
  if (viewer.role === "owner") throw new AppError("forbidden", "Two-step sign-in is mandatory for the owner account.");
  if (viewer.aal !== 2) throw new AppError("forbidden", "Verify two-step sign-in first.");
  await system(async (q) => {
    await requireCurrentCode(q, viewer, code);
    await q.query(`delete from app.mfa_recovery_codes where user_id = $1`, [viewer.id]);
    await q.query(`delete from app.mfa_factors where user_id = $1`, [viewer.id]);
    await q.query(`update app.sessions set mfa_verified_at = null where user_id = $1`, [viewer.id]);
    await notifySecurity(q, viewer.id, "mfa_disabled");
    await audit(q, { actorId: viewer.id, action: "mfa.disable", targetType: "user", targetId: viewer.id });
  });
}

export async function regenerateRecoveryCodes(viewer: Viewer, code: string): Promise<string[]> {
  if (viewer.aal !== 2) throw new AppError("forbidden", "Verify two-step sign-in first.");
  return system(async (q) => {
    await requireCurrentCode(q, viewer, code);
    const codes = await storeRecoveryCodes(q, viewer.id);
    await audit(q, { actorId: viewer.id, action: "mfa.recovery_regenerated", targetType: "user", targetId: viewer.id });
    return codes;
  });
}
