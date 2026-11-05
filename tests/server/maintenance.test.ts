import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { runMaintenance } from "@/server/ops/maintenance";
import type { SeedResult } from "@/server/seed";
import { closePool, resetDb, system } from "./helpers";

let s: SeedResult;
beforeEach(async () => {
  s = await resetDb();
});
afterAll(closePool);

const count = (sql: string) => system((q) => q.one<{ n: number }>(sql)).then((r) => Number(r!.n));

describe("maintenance (dead operational rows only)", () => {
  it("removes old rate-limit windows, spent reset tokens and long-ended sessions; keeps live ones", async () => {
    const uid = s.memberId;
    await system(async (q) => {
      await q.query(`insert into app.rate_limits (bucket, window_start, count) values ('old', now() - interval '5 days', 1), ('new', now(), 1)`);
      await q.query(
        `insert into app.password_resets (token_hash, user_id, expires_at, used_at) values
           ($1, $3, now() - interval '10 days', null), ($2, $3, now() + interval '20 minutes', null)`,
        [randomBytes(32), randomBytes(32), uid],
      );
      await q.query(
        `insert into app.sessions (id_hash, user_id, expires_at, revoked_at) values
           ($1, $4, now() + interval '10 days', now() - interval '40 days'),
           ($2, $4, now() - interval '40 days', null),
           ($3, $4, now() + interval '10 days', null)`,
        [randomBytes(32), randomBytes(32), randomBytes(32), uid],
      );
    });
    const auditBefore = await count(`select count(*) as n from app.audit_log`);
    const outboxBefore = await count(`select count(*) as n from app.email_outbox`);

    const r = await runMaintenance();
    expect(r.rateLimits).toBeGreaterThanOrEqual(1);
    expect(r.expiredResets).toBe(1);
    expect(r.sessions).toBe(2);
    expect(await count(`select count(*) as n from app.rate_limits where bucket = 'new'`)).toBe(1);
    expect(await count(`select count(*) as n from app.password_resets where expires_at > now()`)).toBe(1);
    expect(await count(`select count(*) as n from app.sessions where user_id = '${uid}' and revoked_at is null and expires_at > now()`)).toBeGreaterThanOrEqual(1);
    // Never touched: audit log and outbox (retention is a legal decision).
    expect(await count(`select count(*) as n from app.audit_log`)).toBe(auditBefore);
    expect(await count(`select count(*) as n from app.email_outbox`)).toBe(outboxBefore);
    // Idempotent.
    expect(await runMaintenance()).toEqual({ rateLimits: 0, expiredResets: 0, sessions: 0, abandonedUploads: 0 });
  });
});
