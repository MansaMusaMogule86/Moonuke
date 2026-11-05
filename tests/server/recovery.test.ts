import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { requestPasswordReset, inspectResetToken, resetPassword } from "@/server/services/recovery";
import { signIn } from "@/server/services/accounts";
import { resolveSession } from "@/server/services/sessions";
import { createInvitation, decideApplication, listApplications, listEmailLog } from "@/server/services/admin";
import { deliverPending } from "@/server/email/outbox";
import { DEV_PASSWORD, type SeedResult } from "@/server/seed";
import { asViewer, closePool, meta, resetDb, rlsError, system, viewer } from "./helpers";

let s: SeedResult;
beforeEach(async () => {
  s = await resetDb();
});
afterAll(closePool);

/** Pull the most recent reset link out of the dev outbox (as a test harness would). */
async function lastResetToken(email: string) {
  const row = await system((q) =>
    q.one<{ body_text: string }>(`select body_text from app.email_outbox where to_email = $1 and template = 'password_reset' order by created_at desc limit 1`, [email]),
  );
  return row?.body_text.match(/\/reset\/([A-Za-z0-9_-]{43})/)?.[1];
}

describe("password recovery", () => {
  it("issues a single-use link, revokes sessions, notifies, and the old password stops working", async () => {
    const { sessionToken } = await signIn("velvet@moonuke.test", DEV_PASSWORD, meta);
    await requestPasswordReset("velvet@moonuke.test", meta);
    const token = (await lastResetToken("velvet@moonuke.test"))!;
    expect(token).toBeTruthy();
    expect(await inspectResetToken(token)).toBe(true);

    await resetPassword(token, "a-brand-new-password", meta);
    expect(await resolveSession(sessionToken)).toBeNull();
    await expect(signIn("velvet@moonuke.test", DEV_PASSWORD, meta)).rejects.toMatchObject({ code: "invalid_credentials" });
    await expect(signIn("velvet@moonuke.test", "a-brand-new-password", meta)).resolves.toBeTruthy();
    await expect(resetPassword(token, "another-new-password", meta)).rejects.toThrow(/no longer valid/);

    const notice = await system((q) => q.one(`select 1 from app.email_outbox where to_email = 'velvet@moonuke.test' and template = 'security_password_changed'`));
    expect(notice).toBeTruthy();
  });

  it("stores only the token hash", async () => {
    await requestPasswordReset("velvet@moonuke.test", meta);
    const token = (await lastResetToken("velvet@moonuke.test"))!;
    const dump = await system((q) => q.one<{ t: string }>(`select string_agg(row_to_json(r)::text, '') as t from app.password_resets r`));
    expect(dump!.t).not.toContain(token);
  });

  it("does not reveal whether an account exists, and never sends to suspended accounts", async () => {
    await expect(requestPasswordReset("nobody@example.com", meta)).resolves.toBeUndefined();
    await system((q) => q.query(`update app.users set status = 'suspended' where id = $1`, [s.member2Id]));
    await requestPasswordReset("velvet@moonuke.test", meta);
    expect(await lastResetToken("velvet@moonuke.test")).toBeUndefined();
  });

  it("a new request invalidates the previous link; expired links are refused", async () => {
    await requestPasswordReset("velvet@moonuke.test", meta);
    const first = (await lastResetToken("velvet@moonuke.test"))!;
    await new Promise((r) => setTimeout(r, 5));
    await requestPasswordReset("velvet@moonuke.test", meta);
    const second = (await lastResetToken("velvet@moonuke.test"))!;
    expect(await inspectResetToken(first)).toBe(false);
    expect(await inspectResetToken(second)).toBe(true);
    await system((q) => q.query(`update app.password_resets set expires_at = now() - interval '1 minute'`));
    expect(await inspectResetToken(second)).toBe(false);
  });

  it("reset tokens and outbox bodies are unreachable to the app role", async () => {
    expect(await rlsError(s.ownerId, `select * from app.password_resets`)).toBe("42501");
    expect(await rlsError(s.ownerId, `select body_text from app.email_outbox`)).toBe("42501");
    expect(await asViewer(s.memberId, (q) => q.query(`select id from app.email_outbox`))).toHaveLength(0);
  });
});

describe("transactional email", () => {
  it("invitation email is optional and the owner still gets the link", async () => {
    const owner = await viewer(s.ownerId);
    const a = await createInvitation(owner, { role: "member", email: "guest@example.com", maxUses: 1, expiresInDays: 3, sendEmail: true });
    expect(a.emailed).toBe(true);
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const b = await createInvitation(owner, { role: "member", email: "other@example.com", maxUses: 1, expiresInDays: 3 });
    expect(b.emailed).toBe(false);
    const log = await listEmailLog(owner);
    expect(log.filter((l) => l.template === "invitation").map((l) => l.to_email)).toEqual(["guest@example.com"]);
  });

  it("approval queues a welcome email; delivery marks it sent", async () => {
    const owner = await viewer(s.ownerId);
    const [app] = await listApplications(owner);
    await decideApplication(owner, app.id, "approve", undefined);
    expect(await deliverPending()).toBeGreaterThan(0);
    const log = await listEmailLog(owner);
    expect(log.find((l) => l.template === "account_approved")).toMatchObject({ to_email: "satellite@moonuke.test", status: "sent" });
  });

  it("a member cannot use the outbox to mail anyone but themselves (RLS)", async () => {
    const ins = `insert into app.email_outbox (user_id, to_email, template, subject) values ($1, $2, 'spam', 'x')`;
    expect(await rlsError(s.memberId, ins, [s.memberId, "victim@example.com"])).toBe("42501");
    expect(await rlsError(s.memberId, ins, [s.ownerId, "owner@moonuke.test"])).toBe("42501");
    expect(await rlsError(s.memberId, ins, [s.memberId, "nocturne@moonuke.test"])).toBeNull();
  });

  it("only the owner can read the email log", async () => {
    await expect(listEmailLog(await viewer(s.memberId))).rejects.toMatchObject({ code: "forbidden" });
  });
});
