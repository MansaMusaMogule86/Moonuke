import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  conversationMessages,
  exceptionalAccess,
  getConversation,
  heldMessages,
  liftRestriction,
  messagingRestrictions,
  moderateMessage,
  myConversations,
  myMembersToMessage,
  openConversation,
  reportedMessageContext,
  restrictMessaging,
  reviewHeld,
  saveSettings,
  sendMessage,
  setConversationFlags,
} from "@/server/services/messaging";
import { myNotifications } from "@/server/services/notifications";
import { scoreMessage } from "@/server/messaging/risk";
import { block, fileReport } from "@/server/services/safety";
import type { SeedResult } from "@/server/seed";
import { asViewer, closePool, resetDb, rlsError, system, viewer } from "./helpers";

let s: SeedResult;
beforeEach(async () => {
  s = await resetDb();
});
afterAll(closePool);

const key = () => randomBytes(9).toString("base64url");
const old = (id: string) => system((q) => q.query(`update app.users set created_at = now() - interval '30 days' where id = $1`, [id]));

describe("risk rules (pure)", () => {
  const ctx = { recentSameBody: 0, accountAgeHours: 1000 };
  it("rejects contact details, links, off-platform payment and unsafe content; holds threats; sends ordinary text", () => {
    expect(scoreMessage("Loved the new set ✨", ctx).action).toBe("send");
    for (const t of ["mail me at a@b.co", "call +33 6 12 34 56 78", "see example.com", "https://x.io", "add me on telegram", "pay me with cashapp", "barely legal"]) {
      expect(`${t} → ${scoreMessage(t, ctx).action}`).toBe(`${t} → reject`);
    }
    expect(scoreMessage("I know where you live", ctx).action).toBe("hold");
    expect(scoreMessage("buy gift cards for me", ctx).action).toBe("hold");
    expect(scoreMessage("same text", { recentSameBody: 5, accountAgeHours: 1000 }).action).toBe("hold");
    expect(scoreMessage("hello there", ctx).rules).toEqual([]);
  });
});

describe("who can message whom", () => {
  it("a current member can open and send; the creator can reply; both get notifications without the text", async () => {
    const nocturne = await viewer(s.memberId); // VIP of isadora
    const isadora = await viewer(s.creatorIds.isadora);
    await old(nocturne.id);
    const id = await openConversation(nocturne, isadora.id);
    expect(await openConversation(nocturne, isadora.id)).toBe(id); // idempotent
    expect((await sendMessage(nocturne, id, "Hello from a member", key())).status).toBe("sent");
    const n = (await myNotifications(isadora)).find((x) => x.kind === "message.received")!;
    expect(n).toBeTruthy();
    expect(JSON.stringify(n)).not.toContain("Hello from a member");
    await sendMessage(isadora, id, "Thank you for writing", key());
    const thread = await conversationMessages(nocturne, id);
    expect(thread.map((m) => [m.mine, m.body])).toEqual([[true, "Hello from a member"], [false, "Thank you for writing"]]);
    const [conv] = await myConversations(isadora);
    expect(conv.peer.name).toBe("Nocturne");
  });

  it("non-members, the owner, pending accounts and other creators can't open or read", async () => {
    const velvet = await viewer(s.member2Id); // no memberships
    await expect(openConversation(velvet, s.creatorIds.isadora)).rejects.toMatchObject({ code: "forbidden" });
    await expect(openConversation(await viewer(s.ownerId), s.creatorIds.isadora)).rejects.toMatchObject({ code: "forbidden" });
    const id = await openConversation(await viewer(s.memberId), s.creatorIds.isadora);
    await expect(conversationMessages(velvet, id)).rejects.toMatchObject({ code: "not_found" });
    await expect(conversationMessages(await viewer(s.creatorIds.zara), id)).rejects.toMatchObject({ code: "not_found" });
    expect(await getConversation(velvet, id)).toBeNull();
  });

  it("a creator opens only with current members; can message their audience; not strangers", async () => {
    const isadora = await viewer(s.creatorIds.isadora);
    const members = await myMembersToMessage(isadora);
    expect(members.map((m) => m.alias)).toContain("Nocturne");
    await expect(openConversation(isadora, s.member2Id)).rejects.toMatchObject({ code: "forbidden" });
    const id = await openConversation(isadora, s.memberId);
    expect((await sendMessage(isadora, id, "A note for you", key())).status).toBe("sent");
  });

  it("membership ending, creator closing DMs, restriction and blocking all stop the fan from sending", async () => {
    const nocturne = await viewer(s.memberId);
    const isadora = await viewer(s.creatorIds.isadora);
    const id = await openConversation(nocturne, isadora.id);
    await saveSettings(isadora, { membersCanMessage: false });
    await expect(sendMessage(nocturne, id, "hi", key())).rejects.toMatchObject({ message: expect.stringContaining("isn't taking messages") });
    await saveSettings(isadora, { membersCanMessage: true });
    await setConversationFlags(isadora, id, { restricted: true });
    await expect(sendMessage(nocturne, id, "hi", key())).rejects.toMatchObject({ message: expect.stringContaining("paused messages from you") });
    await setConversationFlags(isadora, id, { restricted: false });
    await system((q) => q.query(`update app.subscriptions set current_period_end = now() - interval '1 minute' where fan_id = $1 and creator_id = $2`, [nocturne.id, isadora.id]));
    await expect(sendMessage(nocturne, id, "hi", key())).rejects.toMatchObject({ message: expect.stringContaining("current members") });
    // The creator can still write to a past member (audience).
    expect((await sendMessage(isadora, id, "Come back soon", key())).status).toBe("sent");
    await block(nocturne, isadora.id);
    await expect(sendMessage(isadora, id, "still there?", key())).rejects.toMatchObject({ code: "forbidden" });
  });

  it("a fan can't use the restrict flag; mute suppresses notifications", async () => {
    const nocturne = await viewer(s.memberId);
    const isadora = await viewer(s.creatorIds.isadora);
    const id = await openConversation(nocturne, isadora.id);
    await expect(setConversationFlags(nocturne, id, { restricted: true })).rejects.toMatchObject({ code: "not_found" });
    await setConversationFlags(isadora, id, { muted: true });
    await sendMessage(nocturne, id, "muted hello", key());
    expect((await myNotifications(isadora)).filter((x) => x.kind === "message.received")).toEqual([]);
  });
});

describe("spam protection", () => {
  it("refuses links/contact details, duplicates, and auto-restricts repeat offenders", async () => {
    const nocturne = await viewer(s.memberId);
    await old(nocturne.id);
    const id = await openConversation(nocturne, s.creatorIds.isadora);
    await expect(sendMessage(nocturne, id, "find me at example.com", key())).rejects.toMatchObject({ code: "validation" });
    await sendMessage(nocturne, id, "same words", key());
    await expect(sendMessage(nocturne, id, "same words", key())).rejects.toMatchObject({ code: "conflict" });
    // Idempotency: the same client key returns the same message, not a duplicate.
    const k = key();
    const a = await sendMessage(nocturne, id, "once only", k);
    const b = await sendMessage(nocturne, id, "once only", k);
    expect(b.id).toBe(a.id);
    for (let i = 0; i < 6; i++) await sendMessage(nocturne, id, `email me x${i}@spam.co`, key()).catch(() => {});
    await expect(sendMessage(nocturne, id, "ordinary words", key())).rejects.toMatchObject({ message: expect.stringContaining("paused") });
    const owner = await viewer(s.ownerId);
    const [r] = await messagingRestrictions(owner);
    expect(r).toMatchObject({ alias: "Nocturne", automatic: true });
    await liftRestriction(owner, r.id);
    expect((await sendMessage(nocturne, id, "back again", key())).status).toBe("sent");
  });

  it("risky messages are held: invisible to the recipient until the house releases them", async () => {
    const nocturne = await viewer(s.memberId);
    const isadora = await viewer(s.creatorIds.isadora);
    await old(nocturne.id);
    const id = await openConversation(nocturne, isadora.id);
    const r = await sendMessage(nocturne, id, "I know where you live", key());
    expect(r.status).toBe("held");
    expect(await conversationMessages(isadora, id)).toEqual([]);
    expect((await conversationMessages(nocturne, id))[0]).toMatchObject({ status: "held", mine: true });
    const owner = await viewer(s.ownerId);
    const [h] = await heldMessages(owner);
    expect(h).toMatchObject({ id: r.id, risk_rules: ["threat"] });
    await reviewHeld(owner, r.id, false);
    expect(await conversationMessages(isadora, id)).toEqual([]);
  });

  it("the database refuses links even if the app filter is bypassed", async () => {
    const id = await openConversation(await viewer(s.memberId), s.creatorIds.isadora);
    expect(await rlsError(s.memberId, `select app.send_message($1, 'go to https://x.io', 'abcdefgh12')`, [id], 1)).toBe("23514");
  });
});

describe("RLS", () => {
  it("no direct writes; no reading others' conversations or messages; no paid messages", async () => {
    const id = await openConversation(await viewer(s.memberId), s.creatorIds.isadora);
    await sendMessage(await viewer(s.memberId), id, "private words", key());
    expect(await rlsError(s.memberId, `insert into app.messages (conversation_id, sender_id, body) values ($1, $2, 'x')`, [id, s.memberId], 1)).toBe("42501");
    expect(await rlsError(s.memberId, `update app.messages set body = 'edited'`, [], 1)).toBe("42501");
    expect(await rlsError(s.memberId, `insert into app.conversations (fan_id, creator_id) values ($1, $2)`, [s.memberId, s.creatorIds.zara], 1)).toBe("42501");
    expect(await rlsError(s.memberId, `update app.conversations set creator_restricted = false where id = $1`, [id], 1)).toBe("42501");
    for (const other of [s.member2Id, s.creatorIds.zara]) {
      expect(await asViewer({ id: other, aal: 1 }, (q) => q.query(`select * from app.messages`))).toHaveLength(0);
      expect(await asViewer({ id: other, aal: 1 }, (q) => q.query(`select * from app.conversations`))).toHaveLength(0);
      expect(await rlsError(other, `select app.send_message($1, 'intrusion', 'abcdefgh99')`, [id], 1)).toBe("42501");
    }
    // The owner (even with MFA) can't browse conversations.
    expect(await asViewer(await viewer(s.ownerId), (q) => q.query(`select * from app.messages`))).toHaveLength(0);
    expect(await rlsError(s.creatorIds.isadora, `update app.messaging_settings set requests_enabled = true`, [], 1)).toBe("42501");
    expect(await rlsError(s.memberId, `insert into app.messaging_restrictions (user_id, until, reason, created_by) values ($1, now() + interval '1 day', 'x', $1)`, [s.member2Id], 1)).toBe("42501");
    expect(await system((q) => q.query(`insert into app.messages (conversation_id, sender_id, body, price_cents) values ($1, $2, 'paid', 500)`, [id, s.memberId]).catch((e) => e.code))).toBe("23514");
  });
});

describe("house moderation", () => {
  it("a reported message is visible to the house with minimal context, audited; nothing else is", async () => {
    const nocturne = await viewer(s.memberId);
    const isadora = await viewer(s.creatorIds.isadora);
    await old(nocturne.id);
    const id = await openConversation(nocturne, isadora.id);
    for (const t of ["one", "two", "three", "four"]) await sendMessage(nocturne, id, `message ${t}`, key());
    const thread = await conversationMessages(isadora, id);
    const target = thread[2];
    await expect(fileReport(nocturne, { targetType: "message", targetId: thread[0].id, reason: "spam" })).rejects.toMatchObject({ code: "validation" });
    const rep = await fileReport(isadora, { targetType: "message", targetId: target.id, reason: "harassment" });
    const owner = await viewer(s.ownerId);
    const ctx = await reportedMessageContext(owner, rep.id);
    expect(ctx.map((m) => m.body)).toEqual(["message one", "message two", "message three", "message four"].slice(0, 4));
    expect(ctx.find((m) => m.is_reported)!.body).toBe("message three");
    const log = await system((q) => q.query<{ action: string }>(`select action from app.audit_log where action = 'moderation.message_context'`));
    expect(log).toHaveLength(1);
    await moderateMessage(owner, rep.id, target.id, "removed");
    expect((await conversationMessages(nocturne, id)).map((m) => m.body)).not.toContain("message three");
    await expect(reportedMessageContext(isadora, rep.id)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("a critical report withholds the message immediately", async () => {
    const nocturne = await viewer(s.memberId);
    const isadora = await viewer(s.creatorIds.isadora);
    await old(nocturne.id);
    const id = await openConversation(nocturne, isadora.id);
    const m = await sendMessage(nocturne, id, "something awful", key());
    await fileReport(isadora, { targetType: "message", targetId: m.id, reason: "non_consensual" });
    expect(await conversationMessages(isadora, id)).toEqual([]);
  });

  it("exceptional access needs a written justification and is logged before content is returned", async () => {
    const nocturne = await viewer(s.memberId);
    const id = await openConversation(nocturne, s.creatorIds.isadora);
    await sendMessage(nocturne, id, "evidence words", key());
    const owner = await viewer(s.ownerId);
    await expect(exceptionalAccess(owner, id, "because")).rejects.toMatchObject({ code: "validation" });
    expect(await rlsError(s.ownerId, `select * from app.exceptional_conversation_access($1, 'too short')`, [id], 2)).toBe("22023");
    expect(await rlsError(s.ownerId, `select * from app.exceptional_conversation_access($1, $2)`, [id, "x".repeat(50)], 1)).toBe("42501");
    const rows = await exceptionalAccess(owner, id, "Law-enforcement preservation request ref 2026-114 regarding a threat report.");
    expect(rows.map((r) => r.body)).toEqual(["evidence words"]);
    const log = await system((q) => q.one<{ metadata: { justification: string } }>(`select metadata from app.audit_log where action = 'moderation.exceptional_access'`));
    expect(log!.metadata.justification).toContain("preservation request");
    await expect(system((q) => q.query(`update app.audit_log set metadata = '{}' where action = 'moderation.exceptional_access'`))).rejects.toBeTruthy();
  });

  it("the house can restrict an account manually; only the house", async () => {
    const owner = await viewer(s.ownerId);
    await restrictMessaging(owner, s.memberId, 24, "Repeated unwanted messages");
    const id = await openConversation(await viewer(s.memberId), s.creatorIds.isadora);
    await expect(sendMessage(await viewer(s.memberId), id, "hi", key())).rejects.toMatchObject({ message: expect.stringContaining("paused") });
    await expect(restrictMessaging(await viewer(s.creatorIds.isadora), s.memberId, 24, "x")).rejects.toMatchObject({ code: "forbidden" });
  });
});
