import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createInvitation, listInvitations, revokeInvitation } from "@/server/services/admin";
import { inspectInvitation, redeemInvitation } from "@/server/services/accounts";
import { resolveSession } from "@/server/services/sessions";
import type { SeedResult } from "@/server/seed";
import { closePool, meta, resetDb, rlsError, system, viewer } from "./helpers";

let s: SeedResult;
beforeEach(async () => {
  s = await resetDb();
});
afterAll(closePool);

const applicant = (n: number) => ({ alias: `Applicant ${n}`, email: `applicant${n}@example.com`, password: "a-long-enough-password" });

describe("invitation issuance", () => {
  it("only the owner can issue invitations", async () => {
    const member = await viewer(s.memberId);
    await expect(createInvitation(member, { role: "member", maxUses: 1, expiresInDays: 7 })).rejects.toMatchObject({ code: "forbidden" });
    const creator = await viewer(s.creatorIds.isadora);
    await expect(createInvitation(creator, { role: "member", maxUses: 1, expiresInDays: 7 })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("RLS independently blocks a non-owner insert, even bypassing app code", async () => {
    const code = await rlsError(
      s.memberId,
      `insert into app.invitations (token_hash, intended_role, expires_at, created_by) values (decode(repeat('ab', 32), 'hex'), 'member', now() + interval '1 day', $1)`,
      [s.memberId],
    );
    expect(code).toBe("42501");
  });

  it("returns the token once and stores only its SHA-256 hash", async () => {
    const owner = await viewer(s.ownerId);
    const inv = await createInvitation(owner, { role: "creator", maxUses: 2, expiresInDays: 3, note: "test" });
    expect(inv.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const dump = await system((q) => q.one<{ t: string }>(`select row_to_json(i)::text as t from app.invitations i where id = $1`, [inv.id]));
    expect(dump!.t).not.toContain(inv.token);
    const list = await listInvitations(owner);
    expect(list.find((i) => i.id === inv.id)).toMatchObject({ state: "active", max_uses: 2, intended_role: "creator" });
  });

  it("cannot issue an owner invitation (DB constraint)", async () => {
    const code = await rlsError(
      s.ownerId,
      `insert into app.invitations (token_hash, intended_role, expires_at, created_by) values (decode(repeat('cd', 32), 'hex'), 'owner', now() + interval '1 day', $1)`,
      [s.ownerId],
    );
    expect(code).toBe("23514");
  });
});

describe("invitation validation", () => {
  it("accepts a valid token and rejects every invalid state identically", async () => {
    const owner = await viewer(s.ownerId);
    expect(await inspectInvitation(s.inviteToken)).toMatchObject({ role: "member", emailLocked: false });

    const revoked = await createInvitation(owner, { role: "member", maxUses: 1, expiresInDays: 1 });
    await revokeInvitation(owner, revoked.id);
    const expired = await createInvitation(owner, { role: "member", maxUses: 1, expiresInDays: 1 });
    await system((q) => q.query(`update app.invitations set expires_at = now() - interval '1 minute' where id = $1`, [expired.id]));
    const exhausted = await createInvitation(owner, { role: "member", maxUses: 1, expiresInDays: 1 });
    await redeemInvitation(exhausted.token, applicant(1), meta);

    for (const t of [revoked.token, expired.token, exhausted.token, "not-a-token", "A".repeat(43), ""]) {
      expect(await inspectInvitation(t)).toBeNull();
      await expect(redeemInvitation(t, applicant(9), meta)).rejects.toMatchObject({ code: "invalid_invitation" });
    }
  });
});

describe("redemption", () => {
  it("creates a PENDING account and application, never an active one", async () => {
    const { userId, sessionToken } = await redeemInvitation(s.inviteToken, applicant(1), meta);
    const v = await resolveSession(sessionToken);
    expect(v).toMatchObject({ id: userId, status: "pending", role: "member" });
    const app = await system((q) => q.one<{ status: string }>(`select status from app.applications where user_id = $1`, [userId]));
    expect(app!.status).toBe("pending");
  });

  it("never exceeds max_uses under concurrent redemption", async () => {
    const owner = await viewer(s.ownerId);
    const inv = await createInvitation(owner, { role: "member", maxUses: 2, expiresInDays: 1 });
    const results = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => redeemInvitation(inv.token, applicant(i + 10), meta)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    const row = await system((q) => q.one<{ use_count: number }>(`select use_count from app.invitations where id = $1`, [inv.id]));
    expect(row!.use_count).toBe(2);
  });

  it("enforces an email lock and does not consume the use on mismatch", async () => {
    const owner = await viewer(s.ownerId);
    const inv = await createInvitation(owner, { role: "member", email: "locked@example.com", maxUses: 1, expiresInDays: 1 });
    await expect(redeemInvitation(inv.token, { ...applicant(1), email: "other@example.com" }, meta)).rejects.toMatchObject({ field: "email" });
    expect(await inspectInvitation(inv.token)).not.toBeNull();
    await expect(redeemInvitation(inv.token, { ...applicant(1), email: "LOCKED@example.com" }, meta)).resolves.toBeTruthy();
  });

  it("rejects duplicate emails and aliases without consuming a use", async () => {
    await expect(redeemInvitation(s.inviteToken, { ...applicant(1), email: "nocturne@moonuke.test" }, meta)).rejects.toMatchObject({ code: "conflict", field: "email" });
    await expect(redeemInvitation(s.inviteToken, { ...applicant(1), alias: "nocturne" }, meta)).rejects.toMatchObject({ code: "conflict", field: "alias" });
    const row = await system((q) => q.one<{ use_count: number }>(`select use_count from app.invitations where note = 'Dev seed — members'`));
    expect(row!.use_count).toBe(1); // the seeded pending applicant only
  });

  it("anonymous viewers cannot read invitations through RLS", async () => {
    const { asViewer } = await import("@/server/db");
    expect(await asViewer(null, (q) => q.query(`select * from app.invitations`))).toHaveLength(0);
    expect(await asViewer(s.memberId, (q) => q.query(`select * from app.invitations`))).toHaveLength(0);
  });
});
