import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetEnvCache } from "@/server/env";
import { codeAt, currentStep } from "@/server/auth/totp";
import { deliverPending } from "@/server/email/outbox";
import { emails } from "@/server/email/templates";
import { runSecurityDigest, runSecurityRetention } from "@/server/security/jobs";
import { accountRef, contextFrom, networkPrefix, recordLoginSuccess, recordRegistration } from "@/server/security/monitor";
import { uaFamilies } from "@/server/security/ua";
import { redeemInvitation, signIn } from "@/server/services/accounts";
import { verifyChallenge } from "@/server/services/mfa";
import { getEvent, listEvents, securityOverview, updateAlert } from "@/server/services/securityMonitor";
import { resolveSession } from "@/server/services/sessions";
import { DEV_OWNER_TOTP_SECRET, DEV_PASSWORD, type SeedResult } from "@/server/seed";
import { asViewer, closePool, resetDb, rlsError, system, viewer } from "./helpers";

let s: SeedResult;
beforeEach(async () => {
  s = await resetDb();
  // These tests exercise live alert delivery; it ships OFF (see email-resend.test.ts).
  vi.stubEnv("SECURITY_ALERTS_ENABLED", "true");
  _resetEnvCache();
});
afterAll(() => {
  vi.unstubAllEnvs();
  _resetEnvCache();
  return closePool();
});

const CHROME_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const FIREFOX_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0";
const headers = (h: Record<string, string>) => ({ get: (k: string) => h[k.toLowerCase()] ?? null });
/** Request metadata as a Vercel-fronted request from one IP and country. */
const req = (ip = "203.0.113.7", country = "AE", ua = CHROME_MAC) => {
  const security = contextFrom(headers({ "x-real-ip": ip, "x-vercel-ip-country": country, "x-vercel-ip-country-region": "DU", "user-agent": ua }), "vercel");
  return { ipHash: security.ipHash, userAgent: ua, security };
};
const events = (type?: string) =>
  system((q) => q.query<Record<string, unknown>>(`select * from app.security_events ${type ? "where event_type = $1" : ""} order by id`, type ? [type] : []));
const alerts = () => system((q) => q.query<{ alert_type: string; severity: string; notified_outbox_id: string | null }>(`select * from app.security_alerts order by created_at`));
const alertEmails = () => system((q) => q.query<{ to_email: string; status: string }>(`select to_email::text, status from app.email_outbox where template = 'security_alert'`));
const owner = () => viewer(s.ownerId);
/** Each sign-in uses a fresh TOTP step: codes are single-use (replay protection). */
let step = 0;
const signInOwner = async (m = req()) => {
  const { sessionToken } = await signIn("owner@divafans.test", DEV_PASSWORD, m);
  const v = (await resolveSession(sessionToken))!;
  await verifyChallenge(v, codeAt(DEV_OWNER_TOTP_SECRET, currentStep() + step++), m);
  return v;
};

describe("successful sign-in", () => {
  it("a member without MFA gets exactly one event per session; refreshes and repeat calls add none", async () => {
    const { sessionToken } = await signIn("velvet@divafans.test", DEV_PASSWORD, req());
    await resolveSession(sessionToken);
    await resolveSession(sessionToken);
    const [e] = await events("auth.login.success");
    expect(await events("auth.login.success")).toHaveLength(1);
    expect(e).toMatchObject({ actor_user_id: s.member2Id, ip_country: "AE", ip_region: "DU", device_category: "desktop", browser_family: "Chrome", os_family: "macOS", severity: "low" });
    expect(e.metadata).toEqual({ method: "password", role: "member" });
    expect(String(e.ip_prefix)).toBe("203.0.113.0/24");
    const pub = await system((q) => q.one<{ public_id: string }>(`select public_id from app.sessions where user_id = $1`, [s.member2Id]));
    expect(e.session_ref).toBe(pub!.public_id);
    // A retried callback for the same session is deduplicated.
    await recordLoginSuccess({ userId: s.member2Id, role: "member", sessionRef: pub!.public_id, method: "password" }, req().security);
    expect(await events("auth.login.success")).toHaveLength(1);
  });

  it("a wrong password never counts as a sign-in, and stores no email, password or token", async () => {
    await expect(signIn("velvet@divafans.test", "wrong-password-here", req())).rejects.toMatchObject({ code: "invalid_credentials" });
    expect(await events("auth.login.success")).toHaveLength(0);
    const [f] = await events("auth.login.failed");
    expect(f).toMatchObject({ actor_user_id: s.member2Id, account_ref: accountRef("velvet@divafans.test") });
    expect(f.metadata).toEqual({ reason: "bad_credentials" });
    const dump = JSON.stringify(await events());
    expect(dump).not.toMatch(/velvet@|wrong-password|203\.0\.113\.7/);
  });

  it("an unknown account gets the same error and is correlated only by keyed hash", async () => {
    await expect(signIn("nobody@example.com", "whatever-password", req())).rejects.toMatchObject({ code: "invalid_credentials" });
    const [f] = await events("auth.login.failed");
    expect(f.actor_user_id).toBeNull();
    expect(f.account_ref).toBe(accountRef("NOBODY@example.com"));
    expect(JSON.stringify(f)).not.toContain("nobody@");
  });

  it("MFA: the password step is not a sign-in; a wrong code is recorded; the right code completes it once", async () => {
    const m = req();
    const { sessionToken } = await signIn("owner@divafans.test", DEV_PASSWORD, m);
    expect(await events("auth.login.success")).toHaveLength(0);
    const v = (await resolveSession(sessionToken))!;
    await expect(verifyChallenge(v, "000000", m)).rejects.toMatchObject({ code: "validation" });
    expect(await events("auth.mfa.failed")).toHaveLength(1);
    expect(await events("auth.login.success")).toHaveLength(0);
    await verifyChallenge(v, codeAt(DEV_OWNER_TOTP_SECRET, currentStep()), m);
    const ok = await events("auth.login.success");
    expect(ok).toHaveLength(1);
    expect(ok[0].metadata).toEqual({ method: "totp", role: "owner" });
  });

  it("suspended accounts stay blocked: no session, a blocked event and a warning alert (not emailed)", async () => {
    await system((q) => q.query(`update app.users set status = 'suspended' where id = $1`, [s.member2Id]));
    await expect(signIn("velvet@divafans.test", DEV_PASSWORD, req())).rejects.toMatchObject({ code: "forbidden" });
    expect(await system((q) => q.query(`select 1 from app.sessions where user_id = $1`, [s.member2Id]))).toHaveLength(0);
    expect(await events("auth.login.blocked")).toHaveLength(1);
    expect(await events("auth.login.success")).toHaveLength(0);
    expect((await alerts()).map((a) => [a.alert_type, a.severity])).toEqual([["blocked_account_attempt", "medium"]]);
    expect(await alertEmails()).toHaveLength(0);
  });

  it("routine sign-ins never email anyone", async () => {
    for (let i = 0; i < 4; i++) await signIn("velvet@divafans.test", DEV_PASSWORD, req());
    expect(await events("auth.login.success")).toHaveLength(4);
    expect(await alerts()).toHaveLength(0);
    expect(await alertEmails()).toHaveLength(0);
  });

  it("the owner signing in from a new device type raises a high alert that is emailed and tracked", async () => {
    step = 0;
    await signInOwner(req("203.0.113.7", "AE", CHROME_MAC));
    expect(await alerts()).toHaveLength(0); // first recorded sign-in: nothing to compare with
    await signInOwner(req("203.0.113.7", "AE", FIREFOX_WIN));
    const [a] = await alerts();
    expect(a).toMatchObject({ alert_type: "new_admin_device", severity: "high" });
    expect(a.notified_outbox_id).not.toBeNull();
    expect(await alertEmails()).toEqual([{ to_email: "owner@divafans.test", status: "queued" }]);
  });
});

describe("suspicious sign-in detection", () => {
  it("five failures on one account within the window raise one high alert; more failures don't repeat it", async () => {
    for (let i = 0; i < 7; i++) await signIn("velvet@divafans.test", `wrong-${i}-password`, req()).catch(() => {});
    const list = await alerts();
    expect(list.map((a) => a.alert_type)).toEqual(["failed_logins_account"]);
    expect(list[0].severity).toBe("high");
    expect(await alertEmails()).toHaveLength(1);
  });

  it("many accounts tried from one network is flagged as credential stuffing (critical)", async () => {
    for (let i = 0; i < 10; i++) await signIn(`target${i}@example.com`, "guess-password-1", req("198.51.100.20")).catch(() => {});
    expect((await alerts()).map((a) => [a.alert_type, a.severity])).toContainEqual(["credential_stuffing", "critical"]);
  });

  it("distributed failures across many networks raise a site-wide alert at the configured threshold", async () => {
    await system((q) => q.query(`update app.monitoring_settings set distributed_threshold = 12`));
    for (let i = 0; i < 12; i++) await signIn(`spray${i}@example.com`, "guess-password-1", req(`192.0.2.${i + 1}`)).catch(() => {});
    expect((await alerts()).map((a) => a.alert_type)).toContain("distributed_failures");
  });

  it("repeated second-factor failures after a correct password raise an MFA alert", async () => {
    const m = req();
    const { sessionToken } = await signIn("owner@divafans.test", DEV_PASSWORD, m);
    const v = (await resolveSession(sessionToken))!;
    for (let i = 0; i < 5; i++) await verifyChallenge(v, "000000", m).catch(() => {});
    expect((await alerts()).map((a) => a.alert_type)).toContain("mfa_failures");
  });
});

describe("registration and creator applications", () => {
  const applicant = (n: number) => ({ alias: `Applicant ${n}`, email: `applicant${n}@example.com`, password: "a-long-enough-password" });

  it("a member invitation records one completed registration and no creator application", async () => {
    const { userId } = await redeemInvitation(s.inviteToken, applicant(1), req());
    const [r] = await events("auth.registration.completed");
    expect(r).toMatchObject({ actor_user_id: userId });
    expect(r.metadata).toMatchObject({ role: "member", outcome: "pending_approval" });
    expect(JSON.stringify(r)).not.toContain(s.inviteToken);
    expect(await events("creator.application.submitted")).toHaveLength(0);
  });

  it("a creator invitation is also a creator application, referencing the real application row", async () => {
    const { userId } = await redeemInvitation(s.creatorInviteToken, applicant(2), req());
    const [c] = await events("creator.application.submitted");
    const app = await system((q) => q.one<{ id: string; status: string }>(`select id, status from app.applications where user_id = $1`, [userId]));
    expect(c.metadata).toEqual({ application_id: app!.id, review_status: "pending" });
    expect(app!.status).toBe("pending"); // still waits for the owner
  });

  it("an invalid invitation records nothing; repeated callbacks don't duplicate", async () => {
    await expect(redeemInvitation("x".repeat(43), applicant(3), req())).rejects.toMatchObject({ code: "invalid_invitation" });
    expect(await events()).toHaveLength(0);
    const { userId } = await redeemInvitation(s.creatorInviteToken, applicant(4), req());
    const app = await system((q) => q.one<{ id: string; invitation_id: string }>(`select id, invitation_id from app.applications where user_id = $1`, [userId]));
    await recordRegistration({ userId, role: "creator", invitationId: app!.invitation_id, applicationId: app!.id }, req().security);
    expect(await events("auth.registration.completed")).toHaveLength(1);
    expect(await events("creator.application.submitted")).toHaveLength(1);
  });

  it("optional immediate email for creator applications links to the protected console only", async () => {
    await system((q) => q.query(`update app.monitoring_settings set immediate_creator_application = true`));
    await redeemInvitation(s.creatorInviteToken, applicant(5), req());
    const mail = await system((q) => q.one<{ body_text: string; to_email: string }>(`select body_text, to_email::text from app.email_outbox where template = 'security_alert'`));
    expect(mail!.to_email).toBe("owner@divafans.test");
    expect(mail!.body_text).toMatch(/\/admin\/security/);
    expect(mail!.body_text).not.toMatch(/applicant5|Applicant 5/);
  });
});

describe("access control: app layer AND row-level security", () => {
  it("fans, creators and an owner at AAL1 can't read, write or delete monitoring records", async () => {
    await signIn("velvet@divafans.test", DEV_PASSWORD, req());
    for (const id of [s.memberId, s.creatorIds.isadora]) {
      expect(await asViewer(id, (q) => q.query(`select * from app.security_events`))).toHaveLength(0);
      expect(await asViewer(id, (q) => q.query(`select * from app.monitoring_settings`))).toHaveLength(0);
      expect(await asViewer(id, (q) => q.query(`update app.monitoring_settings set failed_account_threshold = 99 returning 1`))).toHaveLength(0);
    }
    expect(await asViewer({ id: s.ownerId, aal: 1 }, (q) => q.query(`select * from app.security_events`))).toHaveLength(0);
    expect(await asViewer({ id: s.ownerId, aal: 2 }, (q) => q.query(`select * from app.security_events`))).toHaveLength(1);
    // Nobody writes events through the app role, not even the owner.
    expect(await rlsError(s.ownerId, `insert into app.security_events (event_type, correlation_id) values ('auth.login.success', gen_random_uuid())`)).toBe("42501");
    expect(await rlsError(s.ownerId, `update app.security_events set severity = 'low'`)).toBe("42501");
    expect(await rlsError(s.ownerId, `delete from app.security_events`)).toBe("42501");
  });

  it("the console's services refuse non-owners before touching the database", async () => {
    for (const id of [s.memberId, s.creatorIds.isadora]) {
      const v = await viewer(id);
      await expect(securityOverview(v)).rejects.toMatchObject({ code: "forbidden" });
      await expect(listEvents(v, { page: 1 })).rejects.toMatchObject({ code: "forbidden" });
    }
  });

  it("viewing an event, searching an account and changing an alert are audited", async () => {
    for (let i = 0; i < 5; i++) await signIn("velvet@divafans.test", "wrong-password-x", req()).catch(() => {});
    const o = await owner();
    const { rows } = await listEvents(o, { page: 1, account: "velvet@divafans.test" });
    expect(rows.length).toBe(5);
    await getEvent(o, rows[0].id);
    const [a] = await system((q) => q.query<{ id: string }>(`select id from app.security_alerts`));
    await updateAlert(o, { id: a.id, action: "resolve", note: "Owner confirmed a typo." });
    const actions = (await system((q) => q.query<{ action: string }>(`select action from app.audit_log where action like 'security.%' order by id`))).map((r) => r.action);
    expect(actions).toEqual(["security.account_search", "security.event_view", "security.alert_resolve"]);
  });
});

describe("trusted request data", () => {
  it("spoofed forwarding headers never override the configured proxy", () => {
    const spoof = { "x-forwarded-for": "1.2.3.4", "x-real-ip": "5.6.7.8", "x-vercel-ip-country": "US", "cf-connecting-ip": "9.9.9.9" };
    expect(contextFrom(headers(spoof), "none")).toMatchObject({ ipHash: null, ipPrefix: null, country: null });
    expect(contextFrom(headers({ ...spoof, "cf-ipcountry": "FR" }), "cloudflare")).toMatchObject({ ipPrefix: "9.9.9.0/24", country: "FR" });
    expect(contextFrom(headers(spoof), "hops:1").ipPrefix).toBe("1.2.3.0/24");
    expect(contextFrom(headers({ "x-real-ip": "not-an-ip", "x-vercel-ip-country": "<b>" }), "vercel")).toMatchObject({ ipHash: null, country: null });
  });

  it("prefixes IPv4 to /24 and IPv6 to /48, including compressed and mapped forms", () => {
    expect(networkPrefix("203.0.113.99")).toBe("203.0.113.0/24");
    expect(networkPrefix("::ffff:198.51.100.4")).toBe("198.51.100.0/24");
    expect(networkPrefix("2001:db8:abcd:12::1")).toBe("2001:db8:abcd::/48");
    expect(networkPrefix("2001:db8::1")).toBe("2001:db8:0::/48");
    expect(networkPrefix(null)).toBeNull();
  });

  it("keeps only coarse device families", () => {
    expect(uaFamilies("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toEqual({ device: "mobile", browser: "Safari", os: "iOS" });
    expect(uaFamilies("curl/8.5.0")).toMatchObject({ device: "bot" });
    expect(uaFamilies(null)).toEqual({ device: "unknown", browser: "Other", os: "Other" });
  });
});

describe("notifications", () => {
  it("templates escape user-controlled text", () => {
    const m = emails.securityAlert({ severity: "high", summary: `<script>alert(1)</script>"&`, at: new Date(), url: "https://x.test/a?b=1&c=<2>" });
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).toContain("c=&lt;2&gt;");
  });

  it("provider failures are retried with backoff, then marked failed", async () => {
    await system((q) => q.query(`delete from app.email_outbox`));
    for (let i = 0; i < 5; i++) await signIn("velvet@divafans.test", "wrong-password-x", req()).catch(() => {});
    const broken = { name: "broken", send: async () => { throw new Error("provider down"); } };
    expect(await deliverPending(10, broken)).toBe(0);
    const row = async () => (await system((q) => q.one<{ status: string; attempts: number; due: boolean; last_error: string }>(
      `select status, attempts, next_attempt_at > now() as due, last_error from app.email_outbox where template = 'security_alert'`)))!;
    expect(await row()).toMatchObject({ status: "queued", attempts: 1, due: true, last_error: "provider down" });
    expect(await deliverPending(10, broken)).toBe(0); // not due yet: skipped, attempts unchanged
    expect((await row()).attempts).toBe(1);
    for (let i = 0; i < 4; i++) {
      await system((q) => q.query(`update app.email_outbox set next_attempt_at = now() - interval '1 second'`));
      await deliverPending(10, broken);
    }
    expect(await row()).toMatchObject({ status: "failed", attempts: 5 });
  });

  it("the daily digest goes out once per Dubai day, at or after the configured time", async () => {
    await signIn("velvet@divafans.test", DEV_PASSWORD, req());
    const at = (iso: string) => runSecurityDigest(new Date(iso));
    expect(await at("2026-11-11T03:59:00Z")).toEqual({ sent: false, day: "2026-11-11" }); // 07:59 in Dubai
    expect(await at("2026-11-11T04:00:00Z")).toEqual({ sent: true, day: "2026-11-11" }); // 08:00
    expect(await at("2026-11-11T09:00:00Z")).toEqual({ sent: false, day: "2026-11-11" }); // already sent
    expect(await at("2026-11-11T20:30:00Z")).toEqual({ sent: false, day: "2026-11-12" }); // 00:30 next day, before 08:00
    const mails = await system((q) => q.query<{ subject: string }>(`select subject from app.email_outbox where template = 'security_digest'`));
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toContain("2026-11-11");
  });
});

describe("retention", () => {
  it("is off by default and only reports; when switched on it deletes only expired, unreferenced telemetry", async () => {
    await signIn("velvet@divafans.test", DEV_PASSWORD, req());
    await system(async (q) => {
      const old = `insert into app.security_events (event_type, correlation_id, occurred_at, metadata) values ('auth.login.failed', gen_random_uuid(), now() - interval '40 days', '{"reason":"bad_credentials"}') returning id`;
      await q.query(old);
      const held = await q.one<{ id: string }>(old);
      await q.query(`insert into app.security_alerts (alert_type, severity, summary, dedupe_key, dedupe_bucket, source_event_id) values ('failed_logins_account', 'high', 'held', 'k', 1, $1)`, [held!.id]);
    });
    const users = async () => (await system((q) => q.one<{ n: number }>(`select count(*)::int as n from app.users`)))!.n;
    const before = await users();
    expect(await runSecurityRetention()).toEqual({ enabled: false, events: 1, alerts: 0, emails: 0 });
    expect(await events()).toHaveLength(3);
    await system((q) => q.query(`update app.monitoring_settings set retention_enabled = true`));
    expect(await runSecurityRetention()).toMatchObject({ enabled: true, events: 1 });
    const left = await events();
    expect(left).toHaveLength(2); // the recent sign-in and the event an open alert still points to
    expect(await users()).toBe(before);
  });
});
