import "server-only";
import { createHash } from "node:crypto";
import { system } from "@/server/db";
import { log } from "@/server/log";
import { audit } from "@/server/services/audit";

/**
 * Blast delivery worker (privileged; run by `pnpm blasts:run` every minute and
 * opportunistically after a "send now"). Idempotent end to end:
 *  - blast_deliveries has one row per (blast, fan): re-runs never re-queue;
 *  - each message carries a deterministic client key per (blast, fan), and
 *    messages are unique per (sender, client_key): retries never duplicate.
 * Eligibility is re-checked per recipient at delivery time.
 */
export const BLAST = { batch: 100, maxAttempts: 3, maxRecipients: 5000 } as const;

const keyFor = (blastId: string, fanId: string) => `bl${createHash("sha256").update(`${blastId}:${fanId}`).digest("hex").slice(0, 40)}`;

export type RunResult = { blasts: number; delivered: number; skipped: number; failed: number };

export async function runBlasts(now = new Date()): Promise<RunResult> {
  const total: RunResult = { blasts: 0, delivered: 0, skipped: 0, failed: 0 };
  // Claim due Blasts (and resume any left 'sending' by a crash).
  const claimed = await system((q) =>
    q.query<{ id: string; creator_id: string; body: string; recipients: number }>(
      `update app.blasts b set status = 'sending', started_at = coalesce(started_at, now())
        where b.id in (select id from app.blasts where status in ('scheduled', 'sending') and scheduled_at <= $1
                        order by scheduled_at limit 5 for update skip locked)
        returning b.id, b.creator_id, b.body, b.recipients`,
      [now],
    ),
  );
  for (const b of claimed) {
    total.blasts++;
    if (b.recipients === 0) {
      await system(async (q) => {
        await q.query(
          `insert into app.blast_deliveries (blast_id, fan_id)
           select $1, fan_id from app.blast_audience($1) limit $2 on conflict do nothing`,
          [b.id, BLAST.maxRecipients],
        );
        await q.query(`update app.blasts set recipients = (select count(*) from app.blast_deliveries where blast_id = $1) where id = $1`, [b.id]);
      });
    }
    for (;;) {
      const r = await deliverBatch(b);
      total.delivered += r.delivered;
      total.skipped += r.skipped;
      total.failed += r.failed;
      if (r.processed < BLAST.batch) break;
    }
    await system(async (q) => {
      const left = await q.one<{ n: number }>(`select count(*)::int as n from app.blast_deliveries where blast_id = $1 and status = 'queued'`, [b.id]);
      const counts = `delivered = (select count(*) from app.blast_deliveries where blast_id = $1 and status = 'delivered'),
                      skipped = (select count(*) from app.blast_deliveries where blast_id = $1 and status = 'skipped'),
                      failed = (select count(*) from app.blast_deliveries where blast_id = $1 and status = 'failed')`;
      if (left?.n) await q.query(`update app.blasts set ${counts} where id = $1`, [b.id]);
      else {
        await q.query(`update app.blasts set status = 'sent', finished_at = now(), ${counts} where id = $1`, [b.id]);
        await audit(q, { actorId: null, action: "blast.sent", targetType: "blast", targetId: b.id });
      }
    });
  }
  if (total.blasts) log("info", "blasts.run", total);
  return total;
}

async function deliverBatch(b: { id: string; creator_id: string; body: string }) {
  return system(async (q) => {
    const rows = await q.query<{ fan_id: string; attempts: number }>(
      `select fan_id, attempts from app.blast_deliveries where blast_id = $1 and status = 'queued' order by fan_id limit $2 for update skip locked`,
      [b.id, BLAST.batch],
    );
    const res = { processed: rows.length, delivered: 0, skipped: 0, failed: 0 };
    for (const r of rows) {
      await q.query("savepoint d");
      try {
        const e = await q.one<{ reason: string | null; alias: string }>(
          `select case
                    when u.status <> 'active' then 'inactive'
                    when app.is_blocked_between($1, $2) then 'blocked'
                    when exists (select 1 from app.blast_opt_outs o where o.fan_id = $2 and o.creator_id = $1) then 'opted_out'
                    when not exists (select 1 from app.creators c join app.users cu on cu.id = c.user_id where c.user_id = $1 and c.published_at is not null and cu.status = 'active') then 'creator_unavailable'
                    when app.messaging_restricted($1) then 'creator_paused'
                    else null end as reason,
                  u.alias::text as alias
             from app.users u where u.id = $2`,
          [b.creator_id, r.fan_id],
        );
        if (!e || e.reason) {
          await q.query(`update app.blast_deliveries set status = 'skipped', reason = $3, updated_at = now() where blast_id = $1 and fan_id = $2`, [b.id, r.fan_id, e?.reason ?? "missing"]);
          await q.query("release savepoint d");
          res.skipped++;
          continue;
        }
        const conv = await q.one<{ id: string }>(
          `insert into app.conversations (fan_id, creator_id) values ($1, $2)
           on conflict (fan_id, creator_id) do update set fan_id = excluded.fan_id returning id`,
          [r.fan_id, b.creator_id],
        );
        const body = b.body.replaceAll("{name}", e.alias).slice(0, 2000);
        const key = keyFor(b.id, r.fan_id);
        const msg =
          (await q.one<{ id: string }>(
            `insert into app.messages (conversation_id, sender_id, body, client_key, status, blast_id)
             values ($1, $2, $3, $4, 'sent', $5) on conflict (sender_id, client_key) do nothing returning id`,
            [conv!.id, b.creator_id, body, key, b.id],
          )) ?? (await q.one<{ id: string }>(`select id from app.messages where sender_id = $1 and client_key = $2`, [b.creator_id, key]));
        await q.query(`update app.conversations set last_message_at = now() where id = $1`, [conv!.id]);
        await q.query(`update app.blast_deliveries set status = 'delivered', message_id = $3, attempts = attempts + 1, updated_at = now() where blast_id = $1 and fan_id = $2`, [b.id, r.fan_id, msg!.id]);
        await q.query("release savepoint d");
        res.delivered++;
      } catch (err) {
        await q.query("rollback to savepoint d");
        const failed = r.attempts + 1 >= BLAST.maxAttempts;
        await q.query(
          `update app.blast_deliveries set attempts = attempts + 1, status = case when $3 then 'failed' else 'queued' end, reason = $4, updated_at = now() where blast_id = $1 and fan_id = $2`,
          [b.id, r.fan_id, failed, String((err as Error).message).slice(0, 120)],
        );
        if (failed) res.failed++;
        // A queued retry is picked up by the next run, not this batch loop.
        if (!failed) res.processed = Math.min(res.processed, BLAST.batch - 1);
      }
    }
    return res;
  });
}
