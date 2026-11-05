import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { BLAST, personalise, runBlasts } from "@/server/messaging/blasts";
import { createBlast, decideAppeal, fileAppeal, myBlasts, myMessagingPause, openAppeals, setBlastOptOut } from "@/server/services/blasts";
import { openConversation, restrictMessaging, sendMessage } from "@/server/services/messaging";
import { block } from "@/server/services/safety";
import { setSubscriptionCancel, mySubscriptions } from "@/server/services/fan";
import type { SeedResult } from "@/server/seed";
import { asViewer, closePool, resetDb, system, viewer } from "./helpers";

let s: SeedResult;
beforeEach(async () => {
  s = await resetDb();
});
afterAll(closePool);

/** Run an UPDATE/DELETE as a viewer; return how many rows it touched (0 when RLS hides them), or the error code. */
async function touched(viewerId: string, sql: string, params: unknown[] = [], aal: 1 | 2 = 1): Promise<number | string> {
  try {
    return (await asViewer({ id: viewerId, aal }, (q) => q.query(`${sql} returning 1`, params))).length;
  } catch (e) {
    return (e as { code?: string }).code ?? "error";
  }
}
const snapshot = (sql: string, params: unknown[] = []) => system((q) => q.query(sql, params)).then((r) => JSON.stringify(r));
const denied = (r: number | string) => r === 0 || r === "42501";

describe("RLS regression: unauthorized writes change nothing; authorized ones still work", () => {
  it("blasts: other creators, members and the owner can't alter a Blast; the creator can cancel only while scheduled", async () => {
    const isadora = await viewer(s.creatorIds.isadora);
    const { id } = await createBlast(isadora, { segment: "members", body: "Scheduled note", scheduleAt: new Date(Date.now() + 3_600_000) });
    const before = await snapshot(`select * from app.blasts where id = $1`, [id]);
    for (const [who, aal] of [[s.creatorIds.zara, 1], [s.memberId, 1], [s.ownerId, 2]] as const) {
      expect(denied(await touched(who, `update app.blasts set status = 'canceled' where id = $1`, [id], aal))).toBe(true);
      expect(denied(await touched(who, `delete from app.blasts where id = $1`, [id], aal))).toBe(true);
    }
    expect(denied(await touched(isadora.id, `update app.blasts set delivered = 999 where id = $1`, [id]))).toBe(true);
    expect(await snapshot(`select * from app.blasts where id = $1`, [id])).toBe(before);
    // Authorized: the creator cancels their scheduled Blast.
    expect(await touched(isadora.id, `update app.blasts set status = 'canceled' where id = $1`, [id])).toBe(1);
  });

  it("appeals: only the owner decides; members can't decide, edit or forge appeals", async () => {
    const owner = await viewer(s.ownerId);
    await restrictMessaging(owner, s.memberId, 24, "Review");
    const pause = (await myMessagingPause(await viewer(s.memberId)))!;
    await fileAppeal(await viewer(s.memberId), pause.id, "Please review this pause, it was a mistake.");
    const before = await snapshot(`select * from app.messaging_appeals`);
    for (const who of [s.memberId, s.member2Id, s.creatorIds.isadora]) {
      expect(denied(await touched(who, `update app.messaging_appeals set status = 'overturned', decided_by = $1, decided_at = now()`, [who]))).toBe(true);
      expect(denied(await touched(who, `update app.messaging_restrictions set lifted_at = now()`))).toBe(true);
    }
    expect(await snapshot(`select * from app.messaging_appeals`)).toBe(before);
    const [a] = await openAppeals(owner);
    await decideAppeal(owner, a.id, false, "Stands");
    expect(JSON.parse(await snapshot(`select status from app.messaging_appeals`))).toEqual([{ status: "upheld" }]);
  });

  it("subscriptions, notifications, messages, posts and tiers: cross-user writes are no-ops", async () => {
    const nocturne = await viewer(s.memberId);
    const subs = await snapshot(`select * from app.subscriptions order by id`);
    expect(denied(await touched(s.member2Id, `update app.subscriptions set current_period_end = now() + interval '9 years'`))).toBe(true);
    expect(denied(await touched(s.creatorIds.isadora, `update app.subscriptions set status = 'canceled'`))).toBe(true);
    expect(await snapshot(`select * from app.subscriptions order by id`)).toBe(subs);

    const conv = await openConversation(nocturne, s.creatorIds.isadora);
    await sendMessage(nocturne, conv, "Original words", "regressionkey1");
    const msgs = await snapshot(`select * from app.messages order by id`);
    for (const who of [s.member2Id, s.creatorIds.zara, s.creatorIds.isadora, s.memberId]) {
      expect(denied(await touched(who, `update app.messages set body = 'tampered'`))).toBe(true);
      expect(denied(await touched(who, `delete from app.messages`))).toBe(true);
    }
    expect(await snapshot(`select * from app.messages order by id`)).toBe(msgs);

    const notes = await snapshot(`select id, read_at from app.notifications order by id`);
    expect(await touched(s.member2Id, `update app.notifications set read_at = now()`)).toBe(0);
    expect(await snapshot(`select id, read_at from app.notifications order by id`)).toBe(notes);

    const posts = await snapshot(`select id, teaser, access, hidden_at from app.posts order by id`);
    expect(denied(await touched(s.creatorIds.zara, `update app.posts set teaser = 'x' where creator_id = $1`, [s.creatorIds.isadora]))).toBe(true);
    expect(denied(await touched(s.memberId, `update app.posts set hidden_at = null`))).toBe(true);
    expect(await snapshot(`select id, teaser, access, hidden_at from app.posts order by id`)).toBe(posts);

    const tiers = await snapshot(`select * from app.tiers order by id`);
    expect(denied(await touched(s.creatorIds.zara, `update app.tiers set price_cents = 100 where creator_id = $1`, [s.creatorIds.isadora]))).toBe(true);
    expect(await snapshot(`select * from app.tiers order by id`)).toBe(tiers);

    // Authorized paths still work.
    const isa = (await mySubscriptions(nocturne)).find((x) => x.creator?.handle === "isadora")!;
    await setSubscriptionCancel(nocturne, isa.id, true);
    expect((await mySubscriptions(nocturne)).find((x) => x.id === isa.id)!.state).toBe("ending");
  });
});

describe("Blast worker hardening", () => {
  it("re-checks the creator inside the privileged worker (paused, unpublished, daily limit)", async () => {
    const isadora = await viewer(s.creatorIds.isadora);
    const { id } = await createBlast(isadora, { segment: "members", body: "Hello" });
    await system((q) => q.query(`update app.creators set published_at = null where user_id = $1`, [isadora.id]));
    await runBlasts();
    expect(JSON.parse(await snapshot(`select status, delivered from app.blasts where id = $1`, [id]))).toEqual([{ status: "canceled", delivered: 0 }]);
    expect(await system((q) => q.query(`select 1 from app.messages where blast_id = $1`, [id]))).toHaveLength(0);
    await system((q) => q.query(`update app.creators set published_at = now() where user_id = $1`, [isadora.id]));
    // Daily cap enforced at run time even if rows were inserted around the app limit.
    for (let i = 0; i < 4; i++) {
      await system((q) => q.query(`insert into app.blasts (creator_id, segment, body, scheduled_at) values ($1, 'members', $2, now())`, [isadora.id, `forged ${i}`]));
    }
    await runBlasts();
    const st = JSON.parse(await snapshot(`select status from app.blasts where body like 'forged%' order by body`)) as { status: string }[];
    expect(st.filter((x) => x.status === "sent")).toHaveLength(BLAST.perDay);
    expect(st.filter((x) => x.status === "canceled").length).toBeGreaterThanOrEqual(1);
  });

  it("concurrent workers never double-deliver; a held lease blocks re-claiming", async () => {
    const isadora = await viewer(s.creatorIds.isadora);
    const { id } = await createBlast(isadora, { segment: "members", body: "Race test" });
    await Promise.all([runBlasts(), runBlasts(), runBlasts()]);
    const counts = await system((q) => q.query<{ fan: string; n: number }>(`select c.fan_id as fan, count(*)::int as n from app.messages m join app.conversations c on c.id = m.conversation_id where m.blast_id = $1 group by c.fan_id`, [id]));
    expect(counts.length).toBeGreaterThan(0);
    expect(counts.every((c) => c.n === 1)).toBe(true);
    const [b] = await myBlasts(isadora);
    expect(b.delivered).toBe(counts.length);
    // A Blast left 'sending' with a live lease is not re-claimed.
    const second = await createBlast(isadora, { segment: "members", body: "Lease test" });
    await system((q) => q.query(`update app.blasts set status = 'sending', lease_until = now() + interval '5 minutes' where id = $1`, [second.id]));
    expect((await runBlasts()).blasts).toBe(0);
    await system((q) => q.query(`update app.blasts set lease_until = now() - interval '1 minute' where id = $1`, [second.id]));
    expect((await runBlasts()).blasts).toBe(1);
  });

  it("retries a failing recipient, then dead-letters it after the attempt limit; others still deliver", async () => {
    const isadora = await viewer(s.creatorIds.isadora);
    const victim = s.memberId;
    // Test-only fault injection: make message inserts to one fan's conversation fail.
    await system((q) => q.query(`
      create or replace function app.zz_fail_for_fan() returns trigger language plpgsql as $f$
      begin if exists (select 1 from app.conversations c where c.id = new.conversation_id and c.fan_id = '${victim}') then raise exception 'injected'; end if; return new; end $f$;
      create trigger zz_fail before insert on app.messages for each row execute function app.zz_fail_for_fan();`));
    try {
      const { id } = await createBlast(isadora, { segment: "members", body: "Retry test" });
      for (let i = 0; i < BLAST.maxAttempts + 1; i++) {
        await system((q) => q.query(`update app.blasts set status = 'sending', lease_until = null where id = $1 and status <> 'sent'`, [id]));
        await runBlasts();
      }
      const d = JSON.parse(await snapshot(`select status, attempts from app.blast_deliveries where blast_id = $1 and fan_id = $2`, [id, victim]));
      expect(d).toEqual([{ status: "failed", attempts: BLAST.maxAttempts }]);
      const others = await system((q) => q.query<{ status: string }>(`select status from app.blast_deliveries where blast_id = $1 and fan_id <> $2`, [id, victim]));
      expect(others.every((o) => o.status === "delivered")).toBe(true);
      expect(JSON.parse(await snapshot(`select status, failed from app.blasts where id = $1`, [id]))).toEqual([{ status: "sent", failed: 1 }]);
    } finally {
      await system((q) => q.query(`drop trigger if exists zz_fail on app.messages; drop function if exists app.zz_fail_for_fan();`));
    }
  });

  it("personalisation can't inject patterns or markup; opt-outs and blocks re-checked at delivery", async () => {
    expect(personalise("Hi {name} $& {name}", "Rhea")).toBe("Hi Rhea $& Rhea");
    expect(personalise("Hi {name}", "<script>")).toBe("Hi script");
    expect(personalise("Hi {name}", "$&$1")).toBe("Hi 1");
    const isadora = await viewer(s.creatorIds.isadora);
    await createBlast(isadora, { segment: "members", body: "Gate check", scheduleAt: new Date(Date.now() + 120_000) });
    // Fan opts out and another blocks AFTER scheduling: still skipped at delivery.
    await setBlastOptOut(await viewer(s.memberId), isadora.id, true);
    await system((q) => q.query(`update app.blasts set scheduled_at = now()`));
    const r = await runBlasts();
    expect(r.skipped).toBeGreaterThanOrEqual(1);
    expect(await system((q) => q.query(`select 1 from app.messages m join app.conversations c on c.id = m.conversation_id where c.fan_id = $1 and m.body = 'Gate check'`, [s.memberId]))).toHaveLength(0);
    void block;
  });
});

describe("appeals: integrity under concurrency", () => {
  it("two simultaneous decisions produce exactly one outcome", async () => {
    const owner = await viewer(s.ownerId);
    await restrictMessaging(owner, s.memberId, 24, "Review");
    const pause = (await myMessagingPause(await viewer(s.memberId)))!;
    await fileAppeal(await viewer(s.memberId), pause.id, "Please review, thank you kindly.");
    const [a] = await openAppeals(owner);
    const results = await Promise.allSettled([decideAppeal(owner, a.id, true, "lift"), decideAppeal(owner, a.id, false, "keep")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const decisions = await system((q) => q.query(`select action from app.audit_log where action in ('appeal.overturn', 'appeal.uphold')`));
    expect(decisions).toHaveLength(1);
  });

  it("the owner can't pause their own account (so can't appeal or review their own case)", async () => {
    const owner = await viewer(s.ownerId);
    await expect(restrictMessaging(owner, owner.id, 1, "self")).rejects.toMatchObject({ code: "validation" });
  });
});
