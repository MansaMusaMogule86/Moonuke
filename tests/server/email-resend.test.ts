import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deliverPending, enqueue, PermanentDeliveryError, platformAlertRecipient, resendTransport, senderFor, type Transport } from "@/server/email/outbox";
import { emails } from "@/server/email/templates";
import { _resetEnvCache, productionProblems } from "@/server/env";
import { recordAdminAction } from "@/server/security/monitor";
import { redeemInvitation, signIn } from "@/server/services/accounts";
import { decideApplication } from "@/server/services/admin";
import { confirmEmail, emailVerificationToken, readEmailVerificationToken } from "@/server/services/emailVerification";
import { DEV_PASSWORD, type SeedResult } from "@/server/seed";
import { closePool, meta, resetDb, system, viewer } from "./helpers";

const FAKE_KEY = "re_TestOnlyKey_0123456789abcdef";
let s: SeedResult;
const setEnv = (vars: Record<string, string | undefined>) => {
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
  _resetEnvCache();
};
beforeEach(async () => {
  s = await resetDb();
  setEnv({ WELCOME_EMAIL_FROM: "welcome@divafans.io", SECURITY_EMAIL_FROM: "security@divafans.io", SECURITY_EMAIL_TO: "security@divafans.io", SECURITY_ALERTS_ENABLED: undefined });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  _resetEnvCache();
});
afterAll(closePool);

const outbox = (template?: string) =>
  system((q) => q.query<{ id: string; to_email: string; template: string; status: string; attempts: number; body_text: string | null; body_html: string | null; provider_message_id: string | null; last_error: string | null }>(
    `select id, to_email::text, template, status, attempts, body_text, body_html, provider_message_id, last_error from app.email_outbox ${template ? "where template = $1" : ""} order by created_at`,
    template ? [template] : [],
  ));
const applicant = (n: number, alias = `Applicant ${n}`) => ({ alias, email: `applicant${n}@example.com`, password: "a-long-enough-password" });
/** A fetch double for Resend that records calls. */
const fakeFetch = (status: number, body: object) => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fn, calls };
};

describe("Resend transport", () => {
  it("sends server-side with the key, an idempotency key, and both HTML and text", async () => {
    const f = fakeFetch(200, { id: "msg_123" });
    const r = await resendTransport(FAKE_KEY, f.fn).send({ to: "a@example.com", from: "DivaFans <welcome@divafans.io>", subject: "Hi", text: "t", html: "<p>h</p>", idempotencyKey: "row-1" });
    expect(r).toEqual({ id: "msg_123" });
    expect(f.calls[0].url).toBe("https://api.resend.com/emails");
    const h = f.calls[0].init.headers as Record<string, string>;
    expect(h.Authorization).toBe(`Bearer ${FAKE_KEY}`);
    expect(h["Idempotency-Key"]).toBe("row-1");
    expect(JSON.parse(String(f.calls[0].init.body))).toEqual({ from: "DivaFans <welcome@divafans.io>", to: ["a@example.com"], subject: "Hi", html: "<p>h</p>", text: "t" });
  });

  it("invalid recipients and bad requests are permanent; rate limits and outages are retryable; the key never appears in errors", async () => {
    const send = (status: number) => resendTransport(FAKE_KEY, fakeFetch(status, { name: "validation_error", message: `bad ${FAKE_KEY}` }).fn)
      .send({ to: "not-an-address", from: "x <y@z.io>", subject: "s", text: "t", html: "h", idempotencyKey: "k" });
    const e422 = await send(422).catch((e) => e);
    expect(e422).toBeInstanceOf(PermanentDeliveryError);
    expect(e422.message).toBe("resend 422 validation_error");
    for (const st of [429, 500, 503]) {
      const e = await send(st).catch((x) => x);
      expect(e).not.toBeInstanceOf(PermanentDeliveryError);
      expect(e.message).not.toContain(FAKE_KEY);
    }
    const net = await resendTransport(FAKE_KEY, (async () => { throw new TypeError(`connect failed ${FAKE_KEY}`); }) as unknown as typeof fetch)
      .send({ to: "a@b.io", from: "x <y@z.io>", subject: "s", text: "t", html: "h", idempotencyKey: "k" }).catch((x) => x);
    expect(net.message).toBe("resend network error: TypeError");
  });

  it("delivery: success stores the provider id and scrubs bodies; permanent failures stop at once; logs never carry the key or address", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await system((q) => enqueue(q, "ok@example.com", emails.passwordReset({ url: "https://x/reset/abc", minutes: 30 })));
    await system((q) => enqueue(q, "bad@example.com", emails.passwordReset({ url: "https://x/reset/def", minutes: 30 })));
    // Decide by recipient: the delivery batch has no guaranteed order.
    const t: Transport = resendTransport(FAKE_KEY, (async (_u: string, init: RequestInit) => (JSON.parse(String(init.body)).to[0] === "ok@example.com"
      ? new Response(JSON.stringify({ id: "msg_ok" }), { status: 200 })
      : new Response(JSON.stringify({ name: "validation_error" }), { status: 422 }))) as unknown as typeof fetch);
    expect(await deliverPending(10, t)).toBe(1);
    const [ok, bad] = await outbox("password_reset");
    expect(ok).toMatchObject({ status: "sent", provider_message_id: "msg_ok", body_text: null, body_html: null });
    expect(bad).toMatchObject({ status: "failed", attempts: 1, last_error: "resend 422 validation_error" });
    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).toContain("email.delivery_failed");
    expect(logged).not.toContain(FAKE_KEY);
    expect(logged).not.toContain("bad@example.com");
  });
});

describe("configuration", () => {
  it("rejects malformed values and incomplete Resend setups in production", async () => {
    const { env } = await import("@/server/env");
    setEnv({ RESEND_API_KEY: "sk_not_resend" });
    expect(() => env()).toThrow(/RESEND_API_KEY/);
    setEnv({ RESEND_API_KEY: undefined, SECURITY_EMAIL_TO: "not an email" });
    expect(() => env()).toThrow(/SECURITY_EMAIL_TO/);
    setEnv({ SECURITY_EMAIL_TO: "security@divafans.io", SECURITY_DIGEST_TIMEZONE: "Mars/Olympus" });
    expect(() => env()).toThrow(/SECURITY_DIGEST_TIMEZONE/);
    setEnv({ SECURITY_DIGEST_TIMEZONE: undefined });
    const base = { ...env(), NODE_ENV: "production" as const, APP_SECRET: "x".repeat(40), APP_URL: "https://www.divafans.io", EMAIL_TRANSPORT: "resend" as const };
    expect(productionProblems({ ...base, RESEND_API_KEY: undefined })).toContain("EMAIL_TRANSPORT=resend requires RESEND_API_KEY.");
    expect(productionProblems({ ...base, RESEND_API_KEY: FAKE_KEY, EMAIL_FROM: undefined, WELCOME_EMAIL_FROM: undefined })).toContainEqual(expect.stringMatching(/requires EMAIL_FROM, or both/));
    expect(productionProblems({ ...base, RESEND_API_KEY: FAKE_KEY }).filter((p) => /resend/i.test(p))).toEqual([]);
  });

  it("picks the sender by purpose and routes platform alerts to the security mailbox", () => {
    expect(senderFor("invitation")).toBe("DivaFans <welcome@divafans.io>");
    expect(senderFor("account_created")).toBe("DivaFans <welcome@divafans.io>");
    expect(senderFor("security_password_changed")).toBe("DivaFans Security <security@divafans.io>");
    expect(senderFor("security_alert")).toBe("DivaFans Security <security@divafans.io>");
    expect(senderFor("password_reset")).toBe("DivaFans Security <security@divafans.io>");
    expect(platformAlertRecipient("owner@divafans.test")).toBe("security@divafans.io");
    setEnv({ SECURITY_EMAIL_TO: undefined });
    expect(platformAlertRecipient("owner@divafans.test")).toBe("owner@divafans.test");
  });
});

describe("live security alerts stay off until approved", () => {
  it("with SECURITY_ALERTS_ENABLED unset, alerts are recorded but their email is held as suppressed", async () => {
    await recordAdminAction({ kind: "test", severity: "high", summary: "Test admin action." });
    expect((await system((q) => q.query(`select 1 from app.security_alerts where alert_type = 'admin_action'`))).length).toBe(1);
    expect(await outbox("security_alert")).toMatchObject([{ status: "suppressed", to_email: "security@divafans.io" }]);
    // Ordinary account email is unaffected.
    await system((q) => enqueue(q, "x@example.com", emails.passwordReset({ url: "https://x", minutes: 30 })));
    expect((await outbox("password_reset"))[0].status).toBe("queued");
  });

  it("once enabled, they queue for delivery", async () => {
    setEnv({ SECURITY_ALERTS_ENABLED: "true" });
    await recordAdminAction({ kind: "test", severity: "high", summary: "Test admin action." });
    expect((await outbox("security_alert"))[0].status).toBe("queued");
  });
});

describe("welcome workflow", () => {
  it("account created: one email after the account commits, with a confirmation link and no invitation token", async () => {
    const { userId } = await redeemInvitation(s.inviteToken, applicant(1), meta);
    const [m] = await outbox("account_created");
    expect(m.to_email).toBe("applicant1@example.com");
    expect(m.body_text).toMatch(/\/verify-email\/[0-9a-f-]{36}\.\d{10}\.[A-Za-z0-9_-]{43}/);
    expect(m.body_text).not.toContain(s.inviteToken);
    expect(m.body_text).not.toContain("a-long-enough-password");
    expect(userId).toBeTruthy();
    expect(senderFor(m.template)).toBe("DivaFans <welcome@divafans.io>");
  });

  it("an invalid invitation sends nothing", async () => {
    await expect(redeemInvitation("x".repeat(43), applicant(2), meta)).rejects.toMatchObject({ code: "invalid_invitation" });
    expect(await outbox("account_created")).toHaveLength(0);
  });

  it("user-supplied text is escaped in the HTML", async () => {
    await redeemInvitation(s.inviteToken, applicant(3, `<img src=x onerror=alert(1)>`), meta).catch(() => {});
    const [m] = await outbox("account_created");
    if (m) {
      expect(m.body_html).not.toContain("<img src=x");
      expect(m.body_html).toContain("&lt;img src=x");
    } else {
      // The alias rules may reject it outright, which is also safe.
      expect(await outbox("account_created")).toHaveLength(0);
    }
  });

  it("approval of a creator sends the welcome with the studio onboarding step", async () => {
    const { userId } = await redeemInvitation(s.creatorInviteToken, applicant(4), meta);
    const app = await system((q) => q.one<{ id: string }>(`select id from app.applications where user_id = $1`, [userId]));
    await decideApplication(await viewer(s.ownerId), app!.id, "approve", undefined);
    const [m] = await outbox("account_approved");
    expect(m.body_text).toMatch(/Set up your studio/);
    expect(m.body_text).toMatch(/\/studio/);
  });

  it("email confirmation: valid links confirm once; tampered or expired links don't", async () => {
    const { userId } = await redeemInvitation(s.inviteToken, applicant(5), meta);
    const token = emailVerificationToken(userId);
    expect(readEmailVerificationToken(token)).toBe(userId);
    expect(readEmailVerificationToken(token.slice(0, -1) + (token.endsWith("A") ? "B" : "A"))).toBeNull();
    expect(readEmailVerificationToken(emailVerificationToken(userId, Date.now() - 8 * 86_400_000))).toBeNull();
    expect(readEmailVerificationToken(`${s.ownerId}.${token.split(".")[1]}.${token.split(".")[2]}`)).toBeNull(); // signature bound to the account
    expect(await confirmEmail(token, meta)).toBe(true);
    expect(await confirmEmail(token, meta)).toBe(true); // idempotent
    const row = await system((q) => q.one<{ email_verified_at: Date | null }>(`select email_verified_at from app.users where id = $1`, [userId]));
    expect(row!.email_verified_at).not.toBeNull();
    const audits = await system((q) => q.query(`select 1 from app.audit_log where action = 'account.email_verified' and actor_id = $1`, [userId]));
    expect(audits).toHaveLength(1);
  });
});

describe("account security notices", () => {
  it("repeated failures email the account holder once per window, capped, and never reveal anything to the attacker", async () => {
    for (let i = 0; i < 12; i++) await signIn("velvet@divafans.test", `wrong-${i}-password`, meta).catch(() => {});
    const notices = await outbox("security_failed_attempts");
    expect(notices).toHaveLength(1);
    expect(notices[0].to_email).toBe("velvet@divafans.test");
    expect(notices[0].body_text).not.toMatch(/wrong-\d-password/);
  });

  it("a new kind of device emails the account holder, at most five security notices an hour", async () => {
    const ua = ["Mozilla/5.0 (Windows NT 10.0) Firefox/132.0", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18.0 Safari/605.1", "Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0", "Mozilla/5.0 (Linux; Android 14; Pixel) Chrome/130.0 Mobile", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Version/18.0 Mobile Safari/604.1", "Mozilla/5.0 (Windows NT 10.0) Edg/130.0", "Mozilla/5.0 (Windows NT 10.0) OPR/110.0"];
    for (const u of ua) await signIn("velvet@divafans.test", DEV_PASSWORD, { ipHash: null, userAgent: u });
    const notices = await outbox("security_new_device");
    expect(notices).toHaveLength(5); // first sign-in has nothing to compare with; then capped at 5 per hour
    expect(notices.every((n) => n.to_email === "velvet@divafans.test")).toBe(true);
  });
});

describe("admin actions", () => {
  it("suspending an account raises a medium admin_action alert", async () => {
    const { setSuspended } = await import("@/server/services/admin");
    await setSuspended(await viewer(s.ownerId), s.member2Id, true, "test");
    const a = await system((q) => q.one<{ severity: string; summary: string }>(`select severity, summary from app.security_alerts where alert_type = 'admin_action'`));
    expect(a).toMatchObject({ severity: "medium", summary: "The owner suspended an account." });
  });
});
