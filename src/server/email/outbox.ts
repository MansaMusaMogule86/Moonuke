import "server-only";
import { system, type Q } from "@/server/db";
import { env } from "@/server/env";
import type { Rendered } from "./templates";

/**
 * Transactional email via an outbox:
 *  - enqueue() runs inside the caller's transaction, so an email exists iff
 *    the event that caused it committed;
 *  - deliverPending() sends queued rows (SKIP LOCKED, safe to run concurrently)
 *    and scrubs bodies after a real delivery so one-time links don't linger.
 *
 * Transports: dev (keep in the outbox for local inspection — never in
 * production), smtp (any SMTP provider; none is pre-selected), disabled
 * (suppress; the owner delivers invitation links manually).
 */
export type Transport = { name: string; send(m: { to: string; subject: string; text: string; html: string }): Promise<void> };

export const emailEnabled = () => env().EMAIL_TRANSPORT !== "disabled";

/**
 * Queue a message. With `dedupeKey`, a second enqueue of the same key is a
 * no-op (idempotent alerts and digests). Returns the outbox id, or null when
 * the key was already queued.
 */
export async function enqueue(q: Q, to: string, msg: Rendered, userId: string | null = null, opts: { dedupeKey?: string } = {}): Promise<string | null> {
  const row = await q.one<{ id: string }>(
    `insert into app.email_outbox (user_id, to_email, template, subject, body_text, body_html, status, dedupe_key)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (dedupe_key) do nothing returning id`,
    [userId, to, msg.template, msg.subject, msg.text, msg.html, emailEnabled() ? "queued" : "suppressed", opts.dedupeKey ?? null],
  );
  return row?.id ?? null;
}

/** Retry delay after the nth failed attempt: 1, 2, 4, 8 … minutes, capped at an hour. */
export const backoffMinutes = (attempts: number) => Math.min(60, 2 ** Math.max(0, attempts - 1));

let smtp: Transport | null = null;
async function transport(): Promise<Transport | null> {
  const e = env();
  if (e.EMAIL_TRANSPORT === "smtp") {
    if (!smtp) {
      const nodemailer = await import("nodemailer");
      const t = nodemailer.createTransport(e.SMTP_URL!);
      smtp = { name: "smtp", send: async (m) => void (await t.sendMail({ from: e.EMAIL_FROM, ...m })) };
    }
    return smtp;
  }
  return null; // dev: rows stay readable in the outbox; disabled: rows are suppressed at enqueue
}

/** Deliver up to `limit` due messages. Returns how many were sent. `override` is for tests. */
export async function deliverPending(limit = 20, override?: Transport): Promise<number> {
  const t = override ?? (await transport());
  const isDev = !override && env().EMAIL_TRANSPORT === "dev";
  const rows = await system((q) =>
    q.query<{ id: string; to_email: string; subject: string; body_text: string; body_html: string }>(
      `update app.email_outbox set status = 'sending', attempts = attempts + 1
        where id in (select id from app.email_outbox where status = 'queued' and (next_attempt_at is null or next_attempt_at <= now())
                     order by created_at limit $1 for update skip locked)
        returning id, to_email::text as to_email, subject, body_text, body_html`,
      [limit],
    ),
  );
  let sent = 0;
  for (const r of rows) {
    try {
      if (t) await t.send({ to: r.to_email, subject: r.subject, text: r.body_text, html: r.body_html });
      await system((q) =>
        q.query(
          isDev
            ? `update app.email_outbox set status = 'sent', sent_at = now() where id = $1`
            : `update app.email_outbox set status = 'sent', sent_at = now(), body_text = null, body_html = null where id = $1`,
          [r.id],
        ),
      );
      sent++;
    } catch (e) {
      await system((q) =>
        q.query(
          `update app.email_outbox set status = case when attempts >= 5 then 'failed' else 'queued' end, last_error = $2,
                  next_attempt_at = now() + make_interval(mins => least(60, power(2, greatest(attempts - 1, 0))::int)) where id = $1`,
          [r.id, String((e as Error).message).slice(0, 500)],
        ),
      );
    }
  }
  return sent;
}
