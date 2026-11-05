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

export async function enqueue(q: Q, to: string, msg: Rendered, userId: string | null = null) {
  await q.query(
    `insert into app.email_outbox (user_id, to_email, template, subject, body_text, body_html, status)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, to, msg.template, msg.subject, msg.text, msg.html, emailEnabled() ? "queued" : "suppressed"],
  );
}

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

/** Deliver up to `limit` queued messages. Returns how many were sent. */
export async function deliverPending(limit = 20): Promise<number> {
  const t = await transport();
  const isDev = env().EMAIL_TRANSPORT === "dev";
  const rows = await system((q) =>
    q.query<{ id: string; to_email: string; subject: string; body_text: string; body_html: string }>(
      `update app.email_outbox set status = 'sending', attempts = attempts + 1
        where id in (select id from app.email_outbox where status = 'queued' order by created_at
                     limit $1 for update skip locked)
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
          `update app.email_outbox set status = case when attempts >= 5 then 'failed' else 'queued' end, last_error = $2 where id = $1`,
          [r.id, String((e as Error).message).slice(0, 500)],
        ),
      );
    }
  }
  return sent;
}
