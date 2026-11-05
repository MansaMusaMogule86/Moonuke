import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { discover, getEntitledMedia, getProfile } from "@/server/services/club";
import { block, fileReport, moderate, moderationQueue, myBlocks, myReports, unblock } from "@/server/services/safety";
import { signIn } from "@/server/services/accounts";
import { resolveSession } from "@/server/services/sessions";
import { DEV_PASSWORD, type SeedResult } from "@/server/seed";
import { asViewer, closePool, meta, resetDb, rlsError, system, viewer } from "./helpers";

let s: SeedResult;
beforeEach(async () => {
  s = await resetDb();
});
afterAll(closePool);

const postOf = async (handle: string, access: string) =>
  (await system((q) => q.one<{ id: string }>(`select p.id from app.posts p join app.creators c on c.user_id = p.creator_id where c.handle = $1 and p.access = $2 limit 1`, [handle, access])))!.id;

describe("blocking hides profile metadata, feeds, media and search — both directions", () => {
  it("a member who blocks a creator stops seeing them everywhere; unblocking restores", async () => {
    const v = await viewer(s.member2Id);
    const preview = await postOf("isadora", "preview");
    expect(await getEntitledMedia(v, preview, 0)).not.toBeNull();
    await block(v, s.creatorIds.isadora);
    expect(await getProfile(v, "isadora")).toBeNull();
    expect((await discover(v, {})).map((c) => c.handle)).not.toContain("isadora");
    expect((await discover(v, { q: "Isadora" }))).toHaveLength(0);
    expect(await getEntitledMedia(v, preview, 0)).toBeNull();
    expect(await asViewer(v, (q) => q.query(`select 1 from app.posts where creator_id = $1`, [s.creatorIds.isadora]))).toHaveLength(0);
    expect((await myBlocks(v)).map((b) => b.name)).toEqual(["Isadora Lune"]);
    await unblock(v, s.creatorIds.isadora);
    expect(await getProfile(v, "isadora")).not.toBeNull();
  });

  it("a creator blocking a fan hides the creator from that fan — even a paying VIP", async () => {
    await block(await viewer(s.creatorIds.isadora), s.memberId);
    const fan = await viewer(s.memberId);
    expect(await getProfile(fan, "isadora")).toBeNull();
    const vipPost = await postOf("isadora", "vip");
    expect(await getEntitledMedia(fan, vipPost, 0)).toBeNull();
  });

  it("nobody can block the house; blocks are private to the blocker", async () => {
    await expect(block(await viewer(s.memberId), s.ownerId)).rejects.toMatchObject({ code: "not_found" });
    await block(await viewer(s.memberId), s.creatorIds.kaiasol);
    expect(await asViewer(s.member2Id, (q) => q.query(`select * from app.blocks`))).toHaveLength(0);
  });
});

describe("reporting", () => {
  it("files a confidential report; duplicates while open are refused", async () => {
    const v = await viewer(s.member2Id);
    const r = await fileReport(v, { targetType: "creator", targetId: s.creatorIds.valentin, reason: "spam" });
    expect(r.critical).toBe(false);
    await expect(fileReport(v, { targetType: "creator", targetId: s.creatorIds.valentin, reason: "spam" })).rejects.toMatchObject({ code: "conflict" });
    expect((await myReports(v))[0]).toMatchObject({ reason: "spam", status: "open" });
  });

  it("the target must be visible to the reporter", async () => {
    const v = await viewer(s.member2Id);
    await expect(fileReport(v, { targetType: "creator", targetId: s.creatorIds.orsolya, reason: "spam" })).rejects.toMatchObject({ code: "not_found" });
    const vipPost = await postOf("isadora", "vip");
    // A locked post's teaser is visible, so it can be reported without seeing its content.
    await expect(fileReport(v, { targetType: "post", targetId: vipPost, reason: "copyright" })).resolves.toBeTruthy();
  });

  it("a critical post report hides the post immediately and alerts the owner", async () => {
    const post = await postOf("isadora", "members");
    await fileReport(await viewer(s.member2Id), { targetType: "post", targetId: post, reason: "non_consensual" });
    const vip = (await getProfile(await viewer(s.memberId), "isadora"))!;
    expect(vip.posts.map((p) => p.id)).not.toContain(post);
    const owner = (await getProfile(await viewer(s.ownerId), "isadora"))!;
    expect(owner.posts.map((p) => p.id)).toContain(post);
    const alert = await system((q) => q.one(`select 1 from app.email_outbox where template = 'critical_report' and to_email = 'owner@moonuke.test'`));
    expect(alert).toBeTruthy();
    const [top] = await moderationQueue(await viewer(s.ownerId));
    expect(top).toMatchObject({ severity: 3, post_hidden: true });
  });

  it("reporters never see moderation notes or escalation references", async () => {
    const v = await viewer(s.member2Id);
    const { id } = await fileReport(v, { targetType: "creator", targetId: s.creatorIds.valentin, reason: "impersonation" });
    await moderate(await viewer(s.ownerId), id, "escalate", { escalationRef: "CASE-42", note: "internal note" });
    const mine = await myReports(v);
    expect(mine[0].status).toBe("escalated");
    expect(JSON.stringify(mine)).not.toMatch(/CASE-42|internal note/);
    expect(await asViewer(s.member2Id, (q) => q.query(`select * from app.reports`))).toHaveLength(0);
  });
});

describe("moderation is owner-only — app layer and RLS", () => {
  it("members cannot read or change reports, or hide posts", async () => {
    const v = await viewer(s.member2Id);
    const { id } = await fileReport(v, { targetType: "creator", targetId: s.creatorIds.valentin, reason: "spam" });
    await expect(moderate(v, id, "dismiss")).rejects.toMatchObject({ code: "forbidden" });
    await expect(moderationQueue(v)).rejects.toMatchObject({ code: "forbidden" });
    const post = await postOf("valentin", "preview");
    const upd = await asViewer(v, (q) => q.query(`update app.posts set hidden_at = now() where id = $1 returning id`, [post]));
    expect(upd).toHaveLength(0);
    expect(await asViewer(v, (q) => q.query(`select * from app.moderation_actions`))).toHaveLength(0);
  });

  it("hide/restore, escalation requires a reference, suspension revokes sessions", async () => {
    const owner = await viewer(s.ownerId);
    const post = await postOf("valentin", "preview");
    const r1 = await fileReport(await viewer(s.member2Id), { targetType: "post", targetId: post, reason: "copyright" });
    expect((await moderate(owner, r1.id, "hide_post")).postHidden).toBe(true);
    expect((await getProfile(await viewer(s.member2Id), "valentin"))!.posts.map((p) => p.id)).not.toContain(post);
    expect(await moderate(owner, r1.id, "restore_post")).toMatchObject({ status: "dismissed", postHidden: false });

    const r2 = await fileReport(await viewer(s.member2Id), { targetType: "creator", targetId: s.creatorIds.valentin, reason: "harassment" });
    await expect(moderate(owner, r2.id, "escalate", {})).rejects.toMatchObject({ field: "escalationRef" });
    const { sessionToken } = await signIn("valentin@moonuke.test", DEV_PASSWORD, meta);
    expect(await moderate(owner, r2.id, "suspend_user", { note: "Repeated harassment" })).toMatchObject({ status: "actioned" });
    expect(await resolveSession(sessionToken)).toBeNull();
    const actions = await system((q) => q.query<{ action: string }>(`select action from app.moderation_actions where report_id = $1`, [r2.id]));
    expect(actions.map((a) => a.action)).toContain("suspend_user");
  });
});
