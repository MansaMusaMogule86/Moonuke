import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";
import { brand } from "@/config/brand";
import { hashIp } from "@/server/auth/crypto";
import { system, type Q } from "@/server/db";
import { enqueue, platformAlertRecipient } from "@/server/email/outbox";
import { emails, type Rendered } from "@/server/email/templates";
import { appSecret, appUrl } from "@/server/env";
import { log } from "@/server/log";
import { clientIp, type TrustedProxy } from "@/server/net/ip";
import { uaFamilies, type UaFamilies } from "./ua";

/**
 * Server-side security monitoring (docs/SECURITY_MONITORING_ARCHITECTURE.md).
 *
 * - Events are written by trusted server code only, through system(): never
 *   from the browser, never with raw IPs, emails, tokens or user agents.
 * - Recording never throws: a monitoring failure is logged (and raised as an
 *   alert when the database is reachable) but can't block a sign-in.
 * - Detection runs in the same transaction as the event it reacts to, and
 *   alerts are deduplicated per signal and cooldown window.
 */

type HeaderGetter = { get(name: string): string | null };
export type Severity = "low" | "medium" | "high" | "critical";

export type SecurityContext = {
  correlationId: string;
  ipHash: string | null;
  ipPrefix: string | null;
  country: string | null;
  region: string | null;
  ua: UaFamilies;
};

/** /24 for IPv4, /48 for IPv6: enough to spot a network, not a household. */
export function networkPrefix(ip: string | null): string | null {
  if (!ip) return null;
  const v4 = ip.startsWith("::ffff:") && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;
  if (isIP(v4) === 4) return `${v4.split(".").slice(0, 3).join(".")}.0/24`;
  if (isIP(ip) !== 6) return null;
  const [head, tail = ""] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const full = ip.includes("::") ? [...h, ...Array(8 - h.length - t.length).fill("0"), ...t] : h;
  return `${full.slice(0, 3).map((g) => (parseInt(g, 16) || 0).toString(16)).join(":")}::/48`;
}

const REGION = /^[A-Za-z0-9-]{1,10}$/;
const COUNTRY = /^[A-Z]{2}$/;

/** Context from request headers, trusting only what the configured proxy guarantees. */
export function contextFrom(h: HeaderGetter, mode: TrustedProxy): SecurityContext {
  const ip = clientIp(h, mode);
  const country = (mode === "vercel" ? h.get("x-vercel-ip-country") : mode === "cloudflare" ? h.get("cf-ipcountry") : null)?.toUpperCase() ?? null;
  const region = mode === "vercel" ? h.get("x-vercel-ip-country-region") : mode === "cloudflare" ? h.get("cf-region-code") : null;
  return {
    correlationId: randomUUID(),
    ipHash: hashIp(ip),
    ipPrefix: networkPrefix(ip),
    country: country && COUNTRY.test(country) && country !== "XX" && country !== "T1" ? country : null,
    region: region && REGION.test(region) ? region : null,
    ua: uaFamilies(h.get("user-agent")),
  };
}

/** Fallback for callers (scripts, tests) that only have the older request meta. */
export function contextFromMeta(meta: { ipHash: string | null; userAgent: string | null; security?: SecurityContext }): SecurityContext {
  return meta.security ?? { correlationId: randomUUID(), ipHash: meta.ipHash, ipPrefix: null, country: null, region: null, ua: uaFamilies(meta.userAgent) };
}

const keyed = (label: string) => createHmac("sha256", appSecret()).update(`security:${label}`).digest("hex");
/** Correlates attempts for one submitted email without storing it (works for unknown accounts too). */
export const accountRef = (email: string) => keyed(`account:${email.trim().toLowerCase()}`);
const deviceKey = (userId: string, ua: UaFamilies) => keyed(`device:${userId}:${ua.device}:${ua.browser}:${ua.os}`);

// ---------------------------------------------------------------- event schema (allowlisted metadata)

const role = z.enum(["owner", "creator", "member"]);
const META = {
  "auth.login.success": z.strictObject({ method: z.enum(["password", "totp", "recovery", "enrolled"]), role }),
  "auth.login.failed": z.strictObject({ reason: z.enum(["bad_credentials", "rate_limited"]) }),
  "auth.login.blocked": z.strictObject({ status: z.enum(["suspended", "rejected"]) }),
  "auth.mfa.failed": z.strictObject({ method: z.enum(["totp", "recovery"]) }),
  "auth.registration.completed": z.strictObject({ role, invitation_id: z.uuid(), outcome: z.enum(["pending_approval"]) }),
  "creator.application.submitted": z.strictObject({ application_id: z.uuid(), review_status: z.enum(["pending"]) }),
} as const;
export type EventType = keyof typeof META;
type MetaOf<T extends EventType> = z.infer<(typeof META)[T]>;

const FAILURE_TYPES = ["auth.login.failed", "auth.login.blocked"] as const;

export type Settings = {
  failed_account_threshold: number;
  failed_ip_threshold: number;
  stuffing_accounts_threshold: number;
  distributed_threshold: number;
  mfa_failure_threshold: number;
  window_minutes: number;
  alert_cooldown_minutes: number;
  max_alert_emails_per_hour: number;
  immediate_registration: boolean;
  immediate_creator_application: boolean;
  digest_local_time: string;
  digest_timezone: string;
  retention_enabled: boolean;
  routine_retention_days: number;
  incident_retention_days: number;
};
export const loadSettings = (q: Q) => q.one<Settings>(`select * from app.monitoring_settings where id`).then((s) => s!);

type Insert<T extends EventType> = {
  type: T;
  ctx: SecurityContext;
  meta: MetaOf<T>;
  userId?: string | null;
  accountRef?: string | null;
  sessionRef?: string | null;
  severity?: Severity;
  dedupeKey?: string;
  deviceKey?: string;
};

async function insertEvent<T extends EventType>(q: Q, e: Insert<T>): Promise<{ id: string; new_device: boolean | null } | undefined> {
  const metadata = META[e.type].parse(e.meta);
  return q.one<{ id: string; new_device: boolean | null }>(
    `insert into app.security_events
       (event_type, severity, actor_user_id, account_ref, ip_hash, ip_prefix, ip_country, ip_region,
        device_category, browser_family, os_family, device_key, new_device, session_ref, correlation_id, dedupe_key, metadata, retention_class)
     values ($1, $2, $3, $4, $5, $6::cidr, $7, $8, $9, $10, $11, $12,
             case when $12::text is null then null else not exists (
               select 1 from app.security_events p where p.event_type = 'auth.login.success' and p.actor_user_id = $3 and p.device_key = $12) end,
             $13, $14, $15, $16, $17)
     on conflict (dedupe_key) do nothing
     returning id::text, new_device`,
    [
      e.type, e.severity ?? "low", e.userId ?? null, e.accountRef ?? null,
      e.ctx.ipHash, e.ctx.ipPrefix, e.ctx.country, e.ctx.region,
      e.ctx.ua.device, e.ctx.ua.browser, e.ctx.ua.os, e.deviceKey ?? null,
      // Everything starts as routine; retention keeps any event an alert points to for the incident period.
      e.sessionRef ?? null, e.ctx.correlationId, e.dedupeKey ?? null, JSON.stringify(metadata), "routine",
    ],
  );
}

/** Never throws. On failure, logs and tries to raise a monitoring_failure alert. */
async function safely<R>(what: string, fn: () => Promise<R>): Promise<R | null> {
  try {
    return await fn();
  } catch (err) {
    log("error", "security.monitor_failed", { what, message: (err as Error).message });
    await system(async (q) =>
      raiseAlert(q, await loadSettings(q), {
        type: "monitoring_failure",
        severity: "high",
        summary: `Security monitoring could not record a ${what} event. Check the server logs.`,
        dedupeKey: `monitoring_failure:${what}`,
      }),
    ).catch(() => {});
    return null;
  }
}

// ---------------------------------------------------------------- alerts

type AlertInput = {
  type: "failed_logins_account" | "failed_logins_ip" | "credential_stuffing" | "distributed_failures" | "blocked_account_attempt" | "mfa_failures" | "new_country" | "new_admin_device" | "monitoring_failure" | "admin_action";
  severity: Severity;
  summary: string;
  dedupeKey: string;
  sourceEventId?: string | null;
  subjectUserId?: string | null;
  /** Email right away even below "high" (registrations, applications when enabled). */
  immediate?: boolean;
};

/** One alert per signal per cooldown window; high/critical alerts email the owner, capped per hour. */
export async function raiseAlert(q: Q, s: Settings, a: AlertInput): Promise<string | null> {
  const row = await q.one<{ id: string; created_at: Date }>(
    `insert into app.security_alerts (alert_type, severity, summary, dedupe_key, dedupe_bucket, source_event_id, subject_user_id)
     values ($1, $2, $3, $4, floor(extract(epoch from now()) / ($5 * 60))::bigint, $6, $7)
     on conflict (dedupe_key, dedupe_bucket) do nothing
     returning id, created_at`,
    [a.type, a.severity, a.summary.slice(0, 300), a.dedupeKey, s.alert_cooldown_minutes, a.sourceEventId ?? null, a.subjectUserId ?? null],
  );
  if (!row) return null;
  if (a.immediate || a.severity === "high" || a.severity === "critical") {
    await notifyOwner(q, s, { alertId: row.id, dedupeKey: `security_alert:${row.id}`, severity: a.severity, summary: a.summary, at: row.created_at });
  }
  return row.id;
}

type Notice = { dedupeKey: string; severity: Severity; summary: string; at: Date; alertId?: string };

async function notifyOwner(q: Q, s: Settings, n: Notice) {
  const recent = await q.one<{ n: number }>(
    `select count(*)::int as n from app.email_outbox where template = 'security_alert' and created_at > now() - interval '1 hour'`,
  );
  if ((recent?.n ?? 0) >= s.max_alert_emails_per_hour) {
    log("warn", "security.alert_email_capped", { dedupeKey: n.dedupeKey });
    return; // Still on the dashboard and in the daily digest.
  }
  const owner = await q.one<{ id: string; email: string }>(`select id, email::text as email from app.users where role = 'owner' and status = 'active' order by created_at asc limit 1`);
  if (!owner) return;
  const outboxId = await enqueue(
    q,
    platformAlertRecipient(owner.email),
    emails.securityAlert({ severity: n.severity, summary: n.summary, at: n.at, url: `${appUrl()}/admin/security` }),
    owner.id,
    { dedupeKey: n.dedupeKey },
  );
  if (outboxId && n.alertId) await q.query(`update app.security_alerts set notified_outbox_id = $2 where id = $1`, [n.alertId, outboxId]);
}

/** Per-account security notices: at most this many per account per hour, whatever triggers them. */
const ACCOUNT_NOTICE_CAP = 5;

async function notifyAccount(q: Q, userId: string, msg: Rendered, dedupeKey: string) {
  const u = await q.one<{ email: string; n: number }>(
    `select u.email::text as email,
            (select count(*)::int from app.email_outbox o where o.user_id = u.id and o.template like 'security\\_%' and o.created_at > now() - interval '1 hour') as n
       from app.users u where u.id = $1 and u.status in ('active', 'pending')`,
    [userId],
  );
  if (!u || u.n >= ACCOUNT_NOTICE_CAP) return;
  await enqueue(q, u.email, msg, userId, { dedupeKey });
}

/** Security-sensitive administrative or owner-account actions. Runs in its own transaction, after the action committed; never throws. */
export function recordAdminAction(p: { kind: string; summary: string; severity: Severity; subjectUserId?: string | null }) {
  return safely("admin_action", () =>
    system(async (q) => {
      await raiseAlert(q, await loadSettings(q), {
        type: "admin_action",
        severity: p.severity,
        summary: p.summary,
        dedupeKey: `admin_action:${p.kind}:${randomUUID()}`,
        subjectUserId: p.subjectUserId ?? null,
      });
    }),
  );
}

// ---------------------------------------------------------------- detection

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

async function evaluateFailure(q: Q, s: Settings, ev: { id: string; ctx: SecurityContext; accountRef: string | null; userId: string | null }) {
  const win = s.window_minutes;
  const since = `now() - make_interval(mins => ${Number(win)})`;
  if (ev.accountRef) {
    const r = await q.one<{ n: number }>(
      `select count(*)::int as n from app.security_events where account_ref = $1 and event_type = any($2) and occurred_at > ${since}`,
      [ev.accountRef, FAILURE_TYPES],
    );
    const n = r?.n ?? 0;
    if (n >= s.failed_account_threshold) {
      const alertId = await raiseAlert(q, s, {
        type: "failed_logins_account",
        severity: n >= s.failed_account_threshold * 3 ? "critical" : "high",
        summary: `${plural(n, "failed sign-in attempt")} for one account within ${win} minutes.`,
        dedupeKey: `failed_account:${ev.accountRef}`,
        sourceEventId: ev.id,
        subjectUserId: ev.userId,
      });
      // Tell the account holder (never the person trying): once per alert, so once per cooldown window.
      if (alertId && ev.userId) {
        await notifyAccount(q, ev.userId, emails.failedAttempts({ count: n, minutes: win, url: `${appUrl()}/account/security` }), `security_failed_attempts:${alertId}`);
      }
    }
  }
  if (ev.ctx.ipHash) {
    const r = await q.one<{ n: number; accounts: number }>(
      `select count(*)::int as n, count(distinct account_ref)::int as accounts from app.security_events
        where ip_hash = $1 and event_type = any($2) and occurred_at > ${since}`,
      [ev.ctx.ipHash, FAILURE_TYPES],
    );
    if ((r?.accounts ?? 0) >= s.stuffing_accounts_threshold) {
      await raiseAlert(q, s, {
        type: "credential_stuffing",
        severity: "critical",
        summary: `One network tried ${plural(r!.accounts, "different account")} within ${win} minutes (possible credential stuffing).`,
        dedupeKey: `stuffing:${ev.ctx.ipHash}`,
        sourceEventId: ev.id,
      });
    } else if ((r?.n ?? 0) >= s.failed_ip_threshold) {
      await raiseAlert(q, s, {
        type: "failed_logins_ip",
        severity: "high",
        summary: `${plural(r!.n, "failed sign-in attempt")} from one network within ${win} minutes.`,
        dedupeKey: `failed_ip:${ev.ctx.ipHash}`,
        sourceEventId: ev.id,
      });
    }
  }
  const all = await q.one<{ n: number; ips: number }>(
    `select count(*)::int as n, count(distinct ip_hash)::int as ips from app.security_events where event_type = any($1) and occurred_at > ${since}`,
    [FAILURE_TYPES],
  );
  if ((all?.n ?? 0) >= s.distributed_threshold) {
    await raiseAlert(q, s, {
      type: "distributed_failures",
      severity: "critical",
      summary: `${plural(all!.n, "failed sign-in attempt")} across ${plural(all!.ips, "network")} within ${win} minutes (possible distributed attack).`,
      dedupeKey: "distributed",
      sourceEventId: ev.id,
    });
  }
}

// ---------------------------------------------------------------- public API (called from auth flows)

/** Wrong password, unknown account, or the sign-in rate limit tripping. Same record either way: no account enumeration. */
export function recordLoginFailure(email: string, userId: string | null, ctx: SecurityContext, reason: "bad_credentials" | "rate_limited") {
  return safely("auth.login.failed", () =>
    system(async (q) => {
      const ref = accountRef(email);
      const ev = await insertEvent(q, { type: "auth.login.failed", ctx, meta: { reason }, userId, accountRef: ref });
      if (ev) await evaluateFailure(q, await loadSettings(q), { id: ev.id, ctx, accountRef: ref, userId });
    }),
  );
}

/** Correct password on a suspended or rejected account. */
export function recordBlockedAttempt(email: string, userId: string, status: "suspended" | "rejected", ctx: SecurityContext) {
  return safely("auth.login.blocked", () =>
    system(async (q) => {
      const s = await loadSettings(q);
      const ref = accountRef(email);
      const ev = await insertEvent(q, { type: "auth.login.blocked", ctx, meta: { status }, userId, accountRef: ref, severity: "medium" });
      if (!ev) return;
      await raiseAlert(q, s, {
        type: "blocked_account_attempt",
        severity: "medium",
        summary: `A ${status} account tried to sign in with the correct password.`,
        dedupeKey: `blocked:${userId}`,
        sourceEventId: ev.id,
        subjectUserId: userId,
      });
      await evaluateFailure(q, s, { id: ev.id, ctx, accountRef: ref, userId });
    }),
  );
}

export function recordMfaFailure(userId: string, method: "totp" | "recovery", ctx: SecurityContext) {
  return safely("auth.mfa.failed", () =>
    system(async (q) => {
      const s = await loadSettings(q);
      const ev = await insertEvent(q, { type: "auth.mfa.failed", ctx, meta: { method }, userId });
      if (!ev) return;
      const r = await q.one<{ n: number }>(
        `select count(*)::int as n from app.security_events where actor_user_id = $1 and event_type = 'auth.mfa.failed'
            and occurred_at > now() - make_interval(mins => $2)`,
        [userId, s.window_minutes],
      );
      if ((r?.n ?? 0) >= s.mfa_failure_threshold) {
        await raiseAlert(q, s, {
          type: "mfa_failures",
          severity: "high",
          summary: `${plural(r!.n, "failed second-factor attempt")} after a correct password within ${s.window_minutes} minutes.`,
          dedupeKey: `mfa:${userId}`,
          sourceEventId: ev.id,
          subjectUserId: userId,
        });
      }
    }),
  );
}

/**
 * Sign-in fully complete (password, plus the second factor where required).
 * One event per session, however many times it is called.
 */
export function recordLoginSuccess(p: { userId: string; role: "owner" | "creator" | "member"; sessionRef: string; method: "password" | "totp" | "recovery" | "enrolled" }, ctx: SecurityContext) {
  return safely("auth.login.success", () =>
    system(async (q) => {
      const prior = await q.one<{ any: boolean; same_country: boolean }>(
        `select exists (select 1 from app.security_events where event_type = 'auth.login.success' and actor_user_id = $1) as any,
                exists (select 1 from app.security_events where event_type = 'auth.login.success' and actor_user_id = $1 and ip_country = $2) as same_country`,
        [p.userId, ctx.country],
      );
      const ev = await insertEvent(q, {
        type: "auth.login.success",
        ctx,
        meta: { method: p.method, role: p.role },
        userId: p.userId,
        sessionRef: p.sessionRef,
        deviceKey: deviceKey(p.userId, ctx.ua),
        dedupeKey: `login:${p.sessionRef}`,
      });
      if (!ev || !prior?.any) return; // duplicate, or the account's first recorded sign-in (nothing to compare with)
      const s = await loadSettings(q);
      const device = `${ctx.ua.browser} on ${ctx.ua.os} (${ctx.ua.device})`;
      if (ev.new_device) {
        await notifyAccount(q, p.userId, emails.newDevice({ at: new Date(), device, country: ctx.country, url: `${appUrl()}/account/security` }), `security_new_device:${ev.id}`);
      }
      if (p.role === "owner" && ev.new_device) {
        await raiseAlert(q, s, {
          type: "new_admin_device",
          severity: "high",
          summary: `The owner account signed in from a device type not seen before: ${device}${ctx.country ? `, ${ctx.country}` : ""}.`,
          dedupeKey: `new_admin_device:${p.userId}:${ev.id}`,
          sourceEventId: ev.id,
          subjectUserId: p.userId,
        });
      }
      if (ctx.country && !prior.same_country) {
        await raiseAlert(q, s, {
          type: "new_country",
          severity: p.role === "owner" ? "high" : "medium",
          summary: `${p.role === "owner" ? "The owner account" : "An account"} signed in from a country not seen before for it (${ctx.country}). Locations are approximate.`,
          dedupeKey: `new_country:${p.userId}:${ctx.country}`,
          sourceEventId: ev.id,
          subjectUserId: p.userId,
        });
      }
    }),
  );
}

/** Account created through a valid invitation (pending owner approval); a creator invitation is also a creator application. */
export function recordRegistration(
  p: { userId: string; role: "owner" | "creator" | "member"; invitationId: string; applicationId: string },
  ctx: SecurityContext,
) {
  return safely("auth.registration.completed", () =>
    system(async (q) => {
      const s = await loadSettings(q);
      const reg = await insertEvent(q, {
        type: "auth.registration.completed",
        ctx,
        meta: { role: p.role, invitation_id: p.invitationId, outcome: "pending_approval" },
        userId: p.userId,
        dedupeKey: `registration:${p.userId}`,
      });
      if (reg && s.immediate_registration) {
        await notifyOwner(q, s, { dedupeKey: `security_registration:${reg.id}`, severity: "low", summary: `A new ${p.role} account was created and is waiting for approval.`, at: new Date() });
      }
      if (p.role !== "creator") return;
      const app = await insertEvent(q, {
        type: "creator.application.submitted",
        ctx,
        meta: { application_id: p.applicationId, review_status: "pending" },
        userId: p.userId,
        dedupeKey: `creator_application:${p.applicationId}`,
      });
      if (app && s.immediate_creator_application) {
        await notifyOwner(q, s, {
          dedupeKey: `security_creator_application:${app.id}`,
          severity: "low",
          summary: `A new creator application is waiting for review in the ${brand.name} owner console.`,
          at: new Date(),
        });
      }
    }),
  );
}
