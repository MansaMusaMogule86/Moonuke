import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { decideApplication, listApplications, listAudit, setSuspended } from "@/server/services/admin";
import { redeemInvitation, signIn } from "@/server/services/accounts";
import { discover } from "@/server/services/club";
import { decideReferral, listReferrals } from "@/server/services/admin";
import { myReferrals, requestReferral } from "@/server/services/referrals";
import { resolveSession } from "@/server/services/sessions";
import { hit } from "@/server/services/rateLimit";
import { can } from "@/server/auth/permissions";
import type { SeedResult } from "@/server/seed";
import { DEV_PASSWORD } from "@/server/seed";
import { asViewer, closePool, meta, resetDb, rlsError, system, viewer } from "./helpers";

let s: SeedResult;
beforeEach(async () => {
  s = await resetDb();
});
afterAll(closePool);

describe("approval workflow", () => {
  it("a pending account has no club access in app code or RLS", async () => {
    const pending = await viewer(s.pendingId);
    expect(can(pending, "club.discover")).toBe(false);
    await expect(discover(pending, {})).rejects.toMatchObject({ code: "forbidden" });
    expect(await asViewer(s.pendingId, (q) => q.query(`select * from app.creators`))).toHaveLength(0);
    expect(await asViewer(s.pendingId, (q) => q.query(`select * from app.post_content`))).toHaveLength(0);
  });

  it("members and creators cannot approve — app layer and RLS both refuse", async () => {
    const member = await viewer(s.memberId);
    const [app] = await listApplications(await viewer(s.ownerId));
    await expect(decideApplication(member, app.id, "approve", undefined)).rejects.toMatchObject({ code: "forbidden" });
    // Even with a forged direct UPDATE, RLS filters the row out (0 rows changed).
    const changed = await asViewer(s.memberId, (q) => q.query(`update app.users set status = 'active' where id = $1 returning id`, [s.pendingId]));
    expect(changed).toHaveLength(0);
    expect((await viewer(s.pendingId)).status).toBe("pending");
  });

  it("owner approval activates the account and is audited", async () => {
    const owner = await viewer(s.ownerId);
    const [app] = await listApplications(owner);
    await decideApplication(owner, app.id, "approve", "Welcome");
    const v = await viewer(s.pendingId);
    expect(v.status).toBe("active");
    expect(await discover(v, {})).not.toHaveLength(0);
    const log = await listAudit(owner);
    expect(log.some((l) => l.action === "application.approve" && l.target_id === s.pendingId)).toBe(true);
  });

  it("rejection revokes sessions and blocks sign-in", async () => {
    const { userId, sessionToken } = await redeemInvitation(s.inviteToken, { alias: "Rejected One", email: "rej@example.com", password: "a-long-enough-password" }, meta);
    const owner = await viewer(s.ownerId);
    const app = (await listApplications(owner)).find((a) => a.user_id === userId)!;
    await decideApplication(owner, app.id, "reject", undefined);
    expect(await resolveSession(sessionToken)).toBeNull();
    await expect(signIn("rej@example.com", "a-long-enough-password", meta)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("a decision cannot be applied twice", async () => {
    const owner = await viewer(s.ownerId);
    const [app] = await listApplications(owner);
    await decideApplication(owner, app.id, "approve", undefined);
    await expect(decideApplication(owner, app.id, "reject", undefined)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("suspension & owner", () => {
  it("suspending revokes every session immediately; reactivation restores access", async () => {
    const { sessionToken } = await signIn("velvet@moonuke.test", DEV_PASSWORD, meta);
    expect(await resolveSession(sessionToken)).not.toBeNull();
    const owner = await viewer(s.ownerId);
    await setSuspended(owner, s.member2Id, true, "Test");
    expect(await resolveSession(sessionToken)).toBeNull();
    await expect(signIn("velvet@moonuke.test", DEV_PASSWORD, meta)).rejects.toMatchObject({ code: "forbidden" });
    await setSuspended(owner, s.member2Id, false, undefined);
    await expect(signIn("velvet@moonuke.test", DEV_PASSWORD, meta)).resolves.toBeTruthy();
  });

  it("only the owner can suspend, and never themselves", async () => {
    const member = await viewer(s.memberId);
    await expect(setSuspended(member, s.member2Id, true, "x")).rejects.toMatchObject({ code: "forbidden" });
    const owner = await viewer(s.ownerId);
    await expect(setSuspended(owner, s.ownerId, true, "x")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("there can only ever be one owner", async () => {
    const err = await system((q) =>
      q.query(`insert into app.users (email, password_hash, role, status, alias, adult_attested_at) values ('o2@x.com','x','owner','active','Second Owner', now())`),
    ).catch((e) => e.code);
    expect(err).toBe("23505");
  });

  it("users never see password hashes, even their own", async () => {
    expect(await rlsError(s.memberId, `select password_hash from app.users where id = $1`, [s.memberId])).toBe("42501");
  });
});

describe("referral requests", () => {
  it("a request creates no invitation; only the owner's approval issues one", async () => {
    const member = await viewer(s.memberId);
    const before = await system((q) => q.one<{ n: number }>(`select count(*)::int as n from app.invitations`));
    await requestReferral(member, { inviteeName: "Juno", inviteeEmail: "juno@example.com", role: "member", relationship: "Old friend from the conservatoire." });
    const after = await system((q) => q.one<{ n: number }>(`select count(*)::int as n from app.invitations`));
    expect(after!.n).toBe(before!.n);

    const owner = await viewer(s.ownerId);
    const req = (await listReferrals(owner)).find((r) => r.invitee_email === "juno@example.com")!;
    const issued = await decideReferral(owner, req.id, "approve", undefined);
    expect(issued?.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const inv = await system((q) => q.one<{ email: string; max_uses: number; days: number }>(
      `select email::text as email, max_uses, round(extract(epoch from expires_at - created_at) / 86400)::int as days from app.invitations where referral_request_id = $1`, [req.id]));
    expect(inv).toMatchObject({ email: "juno@example.com", max_uses: 1, days: 7 });
  });

  it("the requester never receives the invitation token", async () => {
    const member = await viewer(s.memberId);
    const owner = await viewer(s.ownerId);
    const [req] = await listReferrals(owner);
    await decideReferral(owner, req.id, "approve", undefined);
    const mine = await myReferrals(member);
    expect(JSON.stringify(mine)).not.toMatch(/token|invitation/);
    expect(mine[0].status).toBe("approved");
    expect(await asViewer(s.memberId, (q) => q.query(`select * from app.invitations`))).toHaveLength(0);
  });

  it("members cannot approve their own requests (RLS) and pending users cannot request", async () => {
    const [req] = await listReferrals(await viewer(s.ownerId));
    const changed = await asViewer(s.memberId, (q) => q.query(`update app.referral_requests set status = 'approved' where id = $1 returning id`, [req.id]));
    expect(changed).toHaveLength(0);
    await expect(requestReferral(await viewer(s.pendingId), { inviteeName: "X", inviteeEmail: "x@example.com", role: "member", relationship: "0123456789" })).rejects.toMatchObject({ code: "forbidden" });
    expect(await rlsError(s.pendingId, `insert into app.referral_requests (requester_id, invitee_name, invitee_email, intended_role, relationship) values ($1,'X','x@example.com','member','0123456789')`, [s.pendingId])).toBe("42501");
  });

  it("duplicate pending requests are refused", async () => {
    const member = await viewer(s.memberId);
    const input = { inviteeName: "Dup", inviteeEmail: "dup@example.com", role: "member" as const, relationship: "Someone I trust completely." };
    await requestReferral(member, input);
    await expect(requestReferral(member, input)).rejects.toMatchObject({ code: "conflict" });
  });
});

describe("audit log", () => {
  it("is append-only, even for the database owner role", async () => {
    await expect(system((q) => q.query(`update app.audit_log set action = 'x.y'`))).rejects.toThrow(/append-only/);
    await expect(system((q) => q.query(`delete from app.audit_log`))).rejects.toThrow(/append-only/);
  });

  it("is readable only by the owner", async () => {
    expect(await asViewer(s.memberId, (q) => q.query(`select * from app.audit_log`))).toHaveLength(0);
    await expect(listAudit(await viewer(s.memberId))).rejects.toMatchObject({ code: "forbidden" });
    expect((await listAudit(await viewer(s.ownerId))).length).toBeGreaterThan(0);
  });

  it("a viewer cannot forge entries as someone else", async () => {
    expect(await rlsError(s.memberId, `insert into app.audit_log (actor_id, action) values ($1, 'forged.entry')`, [s.ownerId])).toBe("42501");
  });
});

describe("sign-in & rate limiting", () => {
  it("returns one generic error for unknown email and wrong password", async () => {
    const a = await signIn("nobody@example.com", "whatever-password", meta).catch((e) => e.message);
    const b = await signIn("nocturne@moonuke.test", "wrong-password-here", meta).catch((e) => e.message);
    expect(a).toBe(b);
  });

  it("blocks after the limit within a window", async () => {
    const lim = { limit: 3, windowSec: 60 };
    for (let i = 0; i < 3; i++) await hit("test:bucket", lim);
    await expect(hit("test:bucket", lim)).rejects.toMatchObject({ code: "rate_limited" });
    await expect(hit("test:other", lim)).resolves.toBe(2);
  });

  it("sessions and rate limits are unreachable to the app role", async () => {
    expect(await rlsError(s.ownerId, `select * from app.sessions`)).toBe("42501");
    expect(await rlsError(s.ownerId, `select * from app.rate_limits`)).toBe("42501");
  });
});
