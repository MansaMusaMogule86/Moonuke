import "server-only";
import { brand } from "@/config/brand";
import { system, type Q } from "@/server/db";
import { env, securityAlertsEnabled } from "@/server/env";
import { log } from "@/server/log";
import type { Rendered } from "./templates";

/**
 * Transactional email via an outbox:
 *  - enqueue() runs inside the caller's transaction, so an email exists iff
 *    the event that caused it committed;
 *  - deliverPending() sends due rows (SKIP LOCKED, safe to run concurrently),
 *    retries with backoff, and scrubs bodies after a real delivery so
 *    one-time links don't linger.
 *
 * Transports: dev (keep in the outbox for local inspection — never in
 * production), smtp (any SMTP provider), resend (Resend HTTP API, server-side
 * only), disabled (suppress; the owner delivers invitation links manually).
 */
export type Outgoing = { to: string; from: string; subject: string; text: string; html: string; idempotencyKey: string };
export type Transport = { name: string; send(m: Outgoing): Promise<{ id?: string } | void> };

/** A failure the provider will never accept on retry (bad recipient, bad sender, bad key). */
export class PermanentDeliveryError extends Error {}

export const emailEnabled = () => env().EMAIL_TRANSPORT !== "disabled";

/** Platform security alerts: routed to SECURITY_EMAIL_TO and held until live alerts are approved. */
export const PLATFORM_ALERT_TEMPLATES = new Set(["security_alert", "security_digest"]);
/** New per-account security notices: also held until live alerts are approved. */
export const ACCOUNT_ALERT_TEMPLATES = new Set(["security_new_device", "security_failed_attempts"]);
const SECURITY_TEMPLATES = new Set([
  ...PLATFORM_ALERT_TEMPLATES, ...ACCOUNT_ALERT_TEMPLATES,
  "security", "password_reset", "critical_report", "takedown_alert", "safeguarding_alert",
]);
const WELCOME_TEMPLATES = new Set(["invitation", "account_created", "account_approved", "creator_verified"]);

/** Sender for a template, with a display name. Bare addresses only come from validated env. */
export const isSecurityTemplate = (template: string) => SECURITY_TEMPLATES.has(template) || template.startsWith("security_");
export function senderFor(template: string): string {
  const e = env();
  const security = isSecurityTemplate(template);
  const addr = security ? e.SECURITY_EMAIL_FROM : WELCOME_TEMPLATES.has(template) ? e.WELCOME_EMAIL_FROM : undefined;
  if (!addr) return e.EMAIL_FROM ?? e.WELCOME_EMAIL_FROM ?? `${brand.emailSenderName} <no-reply@localhost>`;
  return `${security ? `${brand.name} Security` : brand.emailSenderName} <${addr}>`;
}

/** Where platform alerts go: SECURITY_EMAIL_TO when set, else the owner's own address. */
export const platformAlertRecipient = (ownerEmail: string) => env().SECURITY_EMAIL_TO ?? ownerEmail;

const held = (template: string) => (PLATFORM_ALERT_TEMPLATES.has(template) || ACCOUNT_ALERT_TEMPLATES.has(template)) && !securityAlertsEnabled();

/**
 * Queue a message. With `dedupeKey`, a second enqueue of the same key is a
 * no-op (idempotent alerts and digests) and the new row's id is returned, or
 * null when the key was already queued. Keyed enqueues run under system();
 * unkeyed ones may run as mk_app, which can insert but not read the outbox,
 * so they don't ask for the id back.
 */
export async function enqueue(q: Q, to: string, msg: Rendered, userId: string | null = null, opts: { dedupeKey?: string } = {}): Promise<string | null> {
  const status = emailEnabled() && !held(msg.template) ? "queued" : "suppressed";
  const values = [userId, to, msg.template, msg.subject, msg.text, msg.html, status];
  const insert = `insert into app.email_outbox (user_id, to_email, template, subject, body_text, body_html, status`;
  if (!opts.dedupeKey) {
    await q.query(`${insert}) values ($1, $2, $3, $4, $5, $6, $7)`, values);
    return null;
  }
  const row = await q.one<{ id: string }>(
    `${insert}, dedupe_key) values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (dedupe_key) do nothing returning id`,
    [...values, opts.dedupeKey],
  );
  return row?.id ?? null;
}

/** Retry delay after the nth failed attempt: 1, 2, 4, 8 … minutes, capped at an hour. */
export const backoffMinutes = (attempts: number) => Math.min(60, 2 ** Math.max(0, attempts - 1));

/** Resend HTTP API. The key never leaves the server; errors carry only status and error name. */
export function resendTransport(apiKey: string, fetchImpl: typeof fetch = fetch): Transport {
  return {
    name: "resend",
    async send(m) {
      let r: Response;
      try {
        r = await fetchImpl("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": m.idempotencyKey },
          body: JSON.stringify({ from: m.from, to: [m.to], subject: m.subject, html: m.html, text: m.text }),
          signal: AbortSignal.timeout(15_000),
        });
      } catch (e) {
        throw new Error(`resend network error: ${(e as Error).name}`);
      }
      const body = (await r.json().catch(() => ({}))) as { id?: string; name?: string };
      if (r.ok) return { id: typeof body.id === "string" ? body.id.slice(0, 120) : undefined };
      const reason = `resend ${r.status}${body.name ? ` ${String(body.name).slice(0, 60)}` : ""}`;
      // 429 (rate limit), 409 (concurrent idempotent request) and 5xx are worth retrying; other 4xx are not.
      if (r.status === 429 || r.status === 409 || r.status >= 500) throw new Error(reason);
      throw new PermanentDeliveryError(reason);
    },
  };
}

let cached: Transport | null = null;
async function transport(): Promise<Transport | null> {
  const e = env();
  if (cached) return cached;
  if (e.EMAIL_TRANSPORT === "smtp") {
    const nodemailer = await import("nodemailer");
    const t = nodemailer.createTransport(e.SMTP_URL!);
    cached = { name: "smtp", send: async ({ idempotencyKey: _k, ...m }) => void (await t.sendMail(m)) };
  } else if (e.EMAIL_TRANSPORT === "resend" && e.RESEND_API_KEY) {
    cached = resendTransport(e.RESEND_API_KEY);
  }
  return cached; // dev: rows stay readable in the outbox; disabled: rows are suppressed at enqueue
}

/** Deliver up to `limit` due messages. Returns how many were sent. `override` is for tests. */
export async function deliverPending(limit = 20, override?: Transport): Promise<number> {
  const t = override ?? (await transport());
  const isDev = !override && env().EMAIL_TRANSPORT === "dev";
  const rows = await system((q) =>
    q.query<{ id: string; to_email: string; template: string; subject: string; body_text: string; body_html: string }>(
      `update app.email_outbox set status = 'sending', attempts = attempts + 1
        where id in (select id from app.email_outbox where status = 'queued' and (next_attempt_at is null or next_attempt_at <= now())
                     order by created_at limit $1 for update skip locked)
        returning id, to_email::text as to_email, template, subject, body_text, body_html`,
      [limit],
    ),
  );
  let sent = 0;
  for (const r of rows) {
    try {
      const res = t ? await t.send({ to: r.to_email, from: senderFor(r.template), subject: r.subject, text: r.body_text, html: r.body_html, idempotencyKey: r.id }) : undefined;
      await system((q) =>
        q.query(
          isDev
            ? `update app.email_outbox set status = 'sent', sent_at = now(), provider_message_id = $2 where id = $1`
            : `update app.email_outbox set status = 'sent', sent_at = now(), provider_message_id = $2, body_text = null, body_html = null where id = $1`,
          [r.id, res?.id ?? null],
        ),
      );
      sent++;
    } catch (e) {
      const permanent = e instanceof PermanentDeliveryError;
      const message = String((e as Error).message).slice(0, 500);
      log("warn", "email.delivery_failed", { template: r.template, permanent, reason: message });
      await system((q) =>
        q.query(
          `update app.email_outbox set status = case when $3 or attempts >= 5 then 'failed' else 'queued' end, last_error = $2,
                  next_attempt_at = now() + make_interval(mins => least(60, power(2, greatest(attempts - 1, 0))::int)) where id = $1`,
          [r.id, message, permanent],
        ),
      );
    }
  }
  return sent;
}
