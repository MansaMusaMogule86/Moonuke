import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { codeAt, currentStep, verifyTotp } from "@/server/auth/totp";
import { can, type Viewer } from "@/server/auth/permissions";
import { signIn } from "@/server/services/accounts";
import { resolveSession } from "@/server/services/sessions";
import { confirmEnrollment, disableMfa, mfaStatus, startEnrollment, verifyChallenge } from "@/server/services/mfa";
import { changePassword, listSessions, revokeOtherSessions, revokeOwnSession } from "@/server/services/account";
import { createInvitation, listApplications } from "@/server/services/admin";
import { DEV_OWNER_TOTP_SECRET, DEV_PASSWORD, type SeedResult } from "@/server/seed";
import { asViewer, closePool, meta, resetDb, rlsError, system, viewer } from "./helpers";

let s: SeedResult;
beforeEach(async () => {
  s = await resetDb();
});
afterAll(closePool);

const session = async (email: string, password = DEV_PASSWORD) => {
  const { sessionToken } = await signIn(email, password, meta);
  return { token: sessionToken, v: (await resolveSession(sessionToken))! };
};

describe("TOTP primitives", () => {
  it("matches the RFC 6238 SHA-1 test vector", () => {
    // RFC 6238 Appendix B: secret "12345678901234567890", T=59s → 94287082 (8 digits); 6-digit = 287082
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(codeAt(secret, Math.floor(59 / 30))).toBe("287082");
  });
  it("rejects replays and codes outside the ±1 step window", () => {
    const step = currentStep();
    const code = codeAt(DEV_OWNER_TOTP_SECRET, step);
    expect(verifyTotp(DEV_OWNER_TOTP_SECRET, code, null)).toBe(step);
    expect(verifyTotp(DEV_OWNER_TOTP_SECRET, code, step)).toBeNull();
    expect(verifyTotp(DEV_OWNER_TOTP_SECRET, codeAt(DEV_OWNER_TOTP_SECRET, step - 3), null)).toBeNull();
    expect(verifyTotp(DEV_OWNER_TOTP_SECRET, "12345", null)).toBeNull();
  });
});

describe("owner MFA is mandatory — app layer AND database", () => {
  it("an owner session without a verified second factor has no owner powers", async () => {
    const { v } = await session("owner@moonuke.test");
    expect(v).toMatchObject({ role: "owner", mfa: "pending", aal: 1 });
    expect(can(v, "invitations.manage")).toBe(false);
    expect(can(v, "club.discover")).toBe(false);
    await expect(createInvitation(v, { role: "member", maxUses: 1, expiresInDays: 1 })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("RLS ignores owner status at AAL1 even if app code were bypassed", async () => {
    expect(await asViewer({ id: s.ownerId, aal: 1 }, (q) => q.query(`select * from app.invitations`))).toHaveLength(0);
    expect(await asViewer({ id: s.ownerId, aal: 1 }, (q) => q.query(`select * from app.audit_log`))).toHaveLength(0);
    const ins = `insert into app.invitations (token_hash, intended_role, expires_at, created_by) values (decode(repeat('ab',32),'hex'), 'member', now() + interval '1 day', $1)`;
    expect(await rlsError(s.ownerId, ins, [s.ownerId], 1)).toBe("42501");
    const upd = await asViewer({ id: s.ownerId, aal: 1 }, (q) => q.query(`update app.users set status = 'active' where id = $1 returning id`, [s.pendingId]));
    expect(upd).toHaveLength(0);
    // …and at AAL2 the same owner can.
    expect((await asViewer({ id: s.ownerId, aal: 2 }, (q) => q.query(`select * from app.invitations`))).length).toBeGreaterThan(0);
  });

  it("verifying the challenge raises the session to AAL2 and unlocks owner tools", async () => {
    const { token, v } = await session("owner@moonuke.test");
    await verifyChallenge(v, codeAt(DEV_OWNER_TOTP_SECRET, currentStep()), meta);
    const after = (await resolveSession(token))!;
    expect(after).toMatchObject({ mfa: "verified", aal: 2 });
    expect(await listApplications(after)).toHaveLength(1);
  });

  it("the owner cannot turn MFA off", async () => {
    const owner = await viewer(s.ownerId);
    await expect(disableMfa(owner, "000000")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("the authenticator secret is encrypted at rest", async () => {
    const row = await system((q) => q.one<{ secret_enc: string }>(`select secret_enc from app.mfa_factors where user_id = $1`, [s.ownerId]));
    expect(row!.secret_enc).toMatch(/^v1:/);
    expect(row!.secret_enc).not.toContain(DEV_OWNER_TOTP_SECRET);
    expect(await rlsError(s.ownerId, `select * from app.mfa_factors`)).toBe("42501");
    expect(await rlsError(s.ownerId, `select * from app.mfa_recovery_codes`)).toBe("42501");
  });
});

describe("member enrolment, challenge, recovery codes", () => {
  async function enrol(email: string) {
    const { token, v } = await session(email);
    const { secret } = await startEnrollment(v);
    const codes = await confirmEnrollment(v, codeAt(secret, currentStep()));
    return { token, v, secret, codes };
  }

  it("enrolment verifies the current session and returns 10 one-time recovery codes", async () => {
    const { token, codes, v } = await enrol("velvet@moonuke.test");
    expect(codes).toHaveLength(10);
    expect((await resolveSession(token))!.aal).toBe(2);
    expect((await mfaStatus(v)).enrolled).toBe(true);
    await expect(startEnrollment(v)).rejects.toMatchObject({ code: "conflict" });
  });

  it("new sign-ins require the second factor; a code cannot be replayed", async () => {
    const { secret } = await enrol("velvet@moonuke.test");
    const a = await session("velvet@moonuke.test");
    expect(a.v.mfa).toBe("pending");
    // The enrolment already consumed the current step; use the next one.
    const next = codeAt(secret, currentStep() + 1);
    await verifyChallenge(a.v, next, meta);
    const b = await session("velvet@moonuke.test");
    await expect(verifyChallenge(b.v, next, meta)).rejects.toMatchObject({ code: "validation" });
  });

  it("a recovery code works exactly once", async () => {
    const { codes } = await enrol("velvet@moonuke.test");
    const a = await session("velvet@moonuke.test");
    await verifyChallenge(a.v, codes[0].toLowerCase(), meta);
    expect((await resolveSession(a.token))!.aal).toBe(2);
    const b = await session("velvet@moonuke.test");
    await expect(verifyChallenge(b.v, codes[0], meta)).rejects.toMatchObject({ code: "validation" });
  });

  it("disabling requires a valid current code and an AAL2 session", async () => {
    const { v, secret } = await enrol("velvet@moonuke.test");
    const verified = { ...v, aal: 2 as const, mfa: "verified" as const };
    await expect(disableMfa(verified, "000000")).rejects.toMatchObject({ code: "validation" });
    await disableMfa(verified, codeAt(secret, currentStep() + 1));
    expect((await mfaStatus(v)).enrolled).toBe(false);
    await expect(disableMfa({ ...v, aal: 1 } as Viewer, "123456")).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("session management", () => {
  it("lists only the viewer's own sessions and cannot revoke someone else's", async () => {
    const mine = await session("velvet@moonuke.test");
    await session("velvet@moonuke.test");
    const theirs = await session("nocturne@moonuke.test");
    const list = await listSessions(mine.v);
    expect(list).toHaveLength(2);
    expect(list[0].current).toBe(true);
    await expect(revokeOwnSession(mine.v, theirs.v.sessionId!)).rejects.toMatchObject({ code: "not_found" });
    expect(await resolveSession(theirs.token)).not.toBeNull();
  });

  it("sign out others keeps the current session", async () => {
    const a = await session("velvet@moonuke.test");
    const b = await session("velvet@moonuke.test");
    expect(await revokeOtherSessions(a.v)).toBe(1);
    expect(await resolveSession(a.token)).not.toBeNull();
    expect(await resolveSession(b.token)).toBeNull();
  });

  it("password change needs the current password and signs out other sessions", async () => {
    const a = await session("velvet@moonuke.test");
    const b = await session("velvet@moonuke.test");
    await expect(changePassword(a.v, "wrong-password", "new-password-123")).rejects.toMatchObject({ field: "current" });
    await changePassword(a.v, DEV_PASSWORD, "new-password-123");
    expect(await resolveSession(a.token)).not.toBeNull();
    expect(await resolveSession(b.token)).toBeNull();
    await expect(signIn("velvet@moonuke.test", "new-password-123", meta)).resolves.toBeTruthy();
  });
});
