import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runBlasts } from "@/server/messaging/blasts";
import {
  cancelBlast,
  createBlast,
  createList,
  decideAppeal,
  fileAppeal,
  myBlasts,
  myLists,
  myMessagingPause,
  openAppeals,
  saveTemplate,
  myTemplates,
  segmentCounts,
  setBlastOptOut,
  setListMember,
  memberDirectory,
} from "@/server/services/blasts";
import { conversationMessages, myConversations, restrictMessaging, sendMessage } from "@/server/services/messaging";
import { block } from "@/server/services/safety";
import type { SeedResult } from "@/server/seed";
import { asViewer, closePool, resetDb, rlsError, system, viewer } from "./helpers";

let s: SeedResult;
beforeEach(async () => {
  s = await resetDb();
});
afterAll(closePool);

const fansOf = (creatorId: string) =>
  system((q) => q.query<{ fan_id: string }>(`select distinct fan_id from app.subscriptions where creator_id = $1 and status = 'active' and current_period_end > now()`, [creatorId]));

describe("Blasts", () => {
  it("delivers one private, personalised message per eligible member; idempotent on re-run", async () => {
    const isadora = await viewer(s.creatorIds.isadora);
    const counts = await segmentCounts(isadora);
    const fans = await fansOf(isadora.id);
    expect(counts.members).toBe(fans.length);
    const { id } = await createBlast(isadora, { segment: "members", body: "Dear {name}, the new letter is up." });
    const r1 = await runBlasts();
    expect(r1.delivered).toBe(fans.length);
    const again = await runBlasts();
    expect(again.delivered).toBe(0);
    const msgs = await system((q) => q.query<{ body: string; conversation_id: string }>(`select body, conversation_id from app.messages where blast_id = $1`, [id]));
    expect(msgs).toHaveLength(fans.length);
    expect(new Set(msgs.map((m) => m.conversation_id)).size).toBe(fans.length);
    const nocturne = await viewer(s.memberId);
    const conv = (await myConversations(nocturne)).find((c) => c.peer.name === "Isadora Lune")!;
    const thread = await conversationMessages(nocturne, conv.id);
    expect(thread.map((m) => m.body)).toEqual(["Dear Nocturne, the new letter is up."]);
    const [b] = await myBlasts(isadora);
    expect(b).toMatchObject({ status: "sent", recipients: fans.length, delivered: fans.length, read: 1 });
    expect(JSON.stringify(b)).not.toMatch(/Nocturne|fan_id/);
  });

  it("skips opted-out, blocked and inactive recipients", async () => {
    const isadora = await viewer(s.creatorIds.isadora);
    const fans = await fansOf(isadora.id);
    expect(fans.length).toBeGreaterThanOrEqual(3);
    await setBlastOptOut(await viewer(s.memberId), isadora.id, true);
    const other = fans.find((f) => f.fan_id !== s.memberId)!;
    await block(await viewer(other.fan_id), isadora.id);
    await createBlast(isadora, { segment: "members", body: "Hello members" });
    const r = await runBlasts();
    expect(r.skipped).toBe(2);
    expect(r.delivered).toBe(fans.length - 2);
    const delivered = await system((q) => q.query<{ fan_id: string; reason: string }>(`select fan_id, reason from app.blast_deliveries where status = 'skipped' order by reason`));
    expect(delivered.map((d) => d.reason).sort()).toEqual(["blocked", "opted_out"]);
  });

  it("segments: VIP, followers, expired and custom lists of members only", async () => {
    const isadora = await viewer(s.creatorIds.isadora);
    const vip = await system((q) => q.query(`select distinct s.fan_id from app.subscriptions s join app.tiers t on t.id = s.tier_id where s.creator_id = $1 and t.kind = 'vip' and s.status = 'active'`, [isadora.id]));
    await createBlast(isadora, { segment: "vip", body: "VIP only" });
    expect((await runBlasts()).delivered).toBe(vip.length);
    // Custom lists accept current/past members only.
    const list = await createList(isadora, "Front row");
    await setListMember(isadora, list, s.memberId, true);
    await expect(setListMember(isadora, list, s.member2Id, true)).rejects.toMatchObject({ code: "validation" });
    expect((await myLists(isadora))[0].members.map((m) => m.alias)).toEqual(["Nocturne"]);
    expect((await memberDirectory(isadora)).some((d) => d.alias === "Velvet Hour")).toBe(false);
    await createBlast(isadora, { segment: "list", listId: list, body: "Just for the front row" });
    expect((await runBlasts()).delivered).toBe(1);
    // Followers segment: Nocturne follows kaiasol.
    const kai = await viewer(s.creatorIds.kaiasol);
    const fc = (await segmentCounts(kai)).followers;
    expect(fc).toBeGreaterThan(0);
  });

  it("validation, anti-spam limits, scheduling and cancellation", async () => {
    const isadora = await viewer(s.creatorIds.isadora);
    await expect(createBlast(isadora, { segment: "members", body: "visit example.com" })).rejects.toMatchObject({ code: "validation" });
    await expect(createBlast(isadora, { segment: "members", body: "I know where you live" })).rejects.toMatchObject({ code: "validation" });
    await expect(createBlast(isadora, { segment: "members", body: "x", scheduleAt: new Date(Date.now() + 40 * 86_400_000) })).rejects.toMatchObject({ field: "scheduleAt" });
    const later = await createBlast(isadora, { segment: "members", body: "Later", scheduleAt: new Date(Date.now() + 3_600_000) });
    expect((await runBlasts()).blasts).toBe(0);
    await cancelBlast(isadora, later.id);
    await expect(cancelBlast(isadora, later.id)).rejects.toMatchObject({ code: "conflict" });
    await createBlast(isadora, { segment: "members", body: "One" });
    await createBlast(isadora, { segment: "members", body: "Two" });
    await createBlast(isadora, { segment: "members", body: "Three" });
    await expect(createBlast(isadora, { segment: "members", body: "Four" })).rejects.toMatchObject({ code: "rate_limited" });
    await expect(createBlast(await viewer(s.creatorIds.rhea), { segment: "members", body: "Hi" })).rejects.toMatchObject({ code: "validation" }); // unpublished
    await expect(createBlast(await viewer(s.memberId), { segment: "members", body: "Hi" })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("a paused creator can't blast; templates save and reuse", async () => {
    const isadora = await viewer(s.creatorIds.isadora);
    await saveTemplate(isadora, "Monthly", "Hello {name}, this month's letter is up.");
    expect((await myTemplates(isadora)).map((t) => t.name)).toEqual(["Monthly"]);
    await restrictMessaging(await viewer(s.ownerId), isadora.id, 2, "Spam review");
    await expect(createBlast(isadora, { segment: "members", body: "Hi" })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("RLS: creators can't read deliveries, forge counts, blast for others or resolve audiences", async () => {
    const isadora = s.creatorIds.isadora;
    await createBlast(await viewer(isadora), { segment: "members", body: "Hello" });
    await runBlasts();
    expect(await asViewer({ id: isadora, aal: 1 }, (q) => q.query(`select * from app.blast_deliveries`))).toHaveLength(0);
    expect(await rlsError(isadora, `select * from app.blast_audience((select id from app.blasts limit 1))`, [], 1)).toBe("42501");
    expect(await rlsError(s.creatorIds.zara, `insert into app.blasts (creator_id, segment, body, scheduled_at) values ($1, 'members', 'x', now())`, [isadora], 1)).toBe("42501");
    expect(await rlsError(isadora, `insert into app.blasts (creator_id, segment, body, scheduled_at, delivered) values ($1, 'members', 'x', now(), 99)`, [isadora], 1)).toBe("42501");
    // A sent Blast can't be altered by its creator (the update policy only matches scheduled rows).
    await asViewer({ id: isadora, aal: 1 }, (q) => q.query(`update app.blasts set status = 'canceled'`));
    expect((await system((q) => q.query<{ status: string }>(`select status from app.blasts`))).map((b) => b.status)).toEqual(["sent"]);
    expect(await rlsError(isadora, `insert into app.blasts (creator_id, segment, body, scheduled_at, price_cents) values ($1, 'members', 'x', now(), 500)`, [isadora], 1)).toBe("23514");
    expect(await asViewer({ id: s.creatorIds.zara, aal: 1 }, (q) => q.query(`select * from app.blasts`))).toHaveLength(0);
  });
});

describe("appeals of messaging pauses", () => {
  it("the paused user appeals once; the house overturns (lifting the pause) or upholds", async () => {
    const owner = await viewer(s.ownerId);
    const nocturne = await viewer(s.memberId);
    await restrictMessaging(owner, nocturne.id, 24, "Repeated unwanted messages");
    const pause = (await myMessagingPause(nocturne))!;
    expect(pause.reason).toBe("Repeated unwanted messages");
    await expect(fileAppeal(nocturne, pause.id, "short")).rejects.toMatchObject({ code: "validation" });
    await fileAppeal(nocturne, pause.id, "This was a misunderstanding; I only replied to the creator.");
    await expect(fileAppeal(nocturne, pause.id, "Second appeal for the same pause.")).rejects.toMatchObject({ code: "conflict" });
    await expect(fileAppeal(await viewer(s.member2Id), pause.id, "Not my pause at all, but trying.")).rejects.toMatchObject({ code: "not_found" });
    const [a] = await openAppeals(owner);
    expect(a.alias).toBe("Nocturne");
    await decideAppeal(owner, a.id, true, "Agreed — lifted.");
    expect(await myMessagingPause(nocturne)).toBeUndefined();
    const conv = await asViewer(nocturne, async (q) => (await q.one<{ id: string }>(`select app.open_conversation($1) as id`, [s.creatorIds.isadora]))!.id);
    await expect(sendMessage(nocturne, conv, "Back again, thank you", "abcdefgh1234")).resolves.toMatchObject({ status: "sent" });
    await expect(openAppeals(nocturne)).rejects.toMatchObject({ code: "forbidden" });
    await asViewer({ id: s.member2Id, aal: 1 }, (q) => q.query(`update app.messaging_appeals set status = 'upheld'`));
    expect((await system((q) => q.query<{ status: string }>(`select status from app.messaging_appeals`))).map((x) => x.status)).toEqual(["overturned"]);
  });
});
