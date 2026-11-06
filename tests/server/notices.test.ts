import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getEntitledMedia } from "@/server/services/club";
import { fileReport, moderate } from "@/server/services/safety";
import { createPost } from "@/server/services/studio";
import { decideTakedown, submitTakedown, takedownQueue } from "@/server/services/takedown";
import { decideReview, setReviewMode } from "@/server/services/review";
import { addConsent, addParticipant, reviewParticipant, setPostParticipants, withdrawConsent } from "@/server/services/participants";
import { appealQueue, decideAppeal, fileAppeal, myNotices, unreadNotices } from "@/server/services/notices";
import type { SeedResult } from "@/server/seed";
import { asViewer, closePool, resetDb, rlsError, system, viewer } from "./helpers";

let s: SeedResult;
beforeEach(async () => {
  s = await resetDb();
});
afterAll(closePool);

const count = async (sql: string, p: unknown[] = []) => (await system((q) => q.one<{ n: number }>(`select count(*)::int as n from (${sql}) x`, p)))!.n;
const hidden = async (id: string) => (await system((q) => q.one<{ h: boolean }>(`select hidden_at is not null as h from app.posts where id = $1`, [id])))!.h;
const postOf = async (handle: string, access: string) =>
  (await system((q) => q.one<{ id: string }>(`select p.id from app.posts p join app.creators c on c.user_id = p.creator_id where c.handle = $1 and p.access = $2 order by p.published_at limit 1`, [handle, access])))!.id;
const newPost = async (creatorId: string, teaser = "A study") =>
  createPost(await viewer(creatorId), { access: "preview", teaser, body: "Text.", mediaKind: "image", publish: "now" });
const rejected = async () => {
  const owner = await viewer(s.ownerId);
  await setReviewMode(owner, "all");
  const id = await newPost(s.creatorIds.isadora, "Needs a crop");
  await decideReview(owner, id, false, "The frame shows a logo.");
  return id;
};

describe("statements of reasons", () => {
  it("a takedown removal notifies every affected creator, marks copies as found automatically, and never identifies the requester", async () => {
    const owner = await viewer(s.ownerId);
    const post = await postOf("isadora", "members");
    const copy = await newPost(s.creatorIds.zara, "Copy");
    await system((q) => q.query(`update app.post_content set media = (select media from app.post_content where post_id = $1) where post_id = $2`, [post, copy]));
    await submitTakedown({ category: "impersonation", requesterRole: "depicted_person", name: "Secret Requester", email: "secret@example.test", signature: "Secret Requester", location: post, goodFaith: true });
    const [n] = await takedownQueue(owner);
    await decideTakedown(owner, n.id, "remove", "Valid notice.");
    const [isa] = await myNotices(await viewer(s.creatorIds.isadora));
    const [zara] = await myNotices(await viewer(s.creatorIds.zara));
    expect(isa).toMatchObject({ kind: "takedown_removed", automated: false, can_appeal: true });
    expect(zara).toMatchObject({ kind: "takedown_removed", automated: true });
    for (const k of ["decision", "facts", "ground", "automated", "redress"] as const) expect(isa.statement[k]).toBeTruthy();
    expect(isa.statement.redress.join(" ")).toMatch(/appeal/i);
    expect(JSON.stringify([isa, zara])).not.toMatch(/Secret|secret@example/);
    expect(await unreadNotices(await viewer(s.creatorIds.isadora))).toBe(1);
    expect(await count(`select 1 from app.notifications where kind = 'system' and user_id = $1`, [s.creatorIds.isadora])).toBe(1);
    expect(await count(`select 1 from app.email_outbox where template = 'decision_notice'`)).toBe(2);
  });

  it("review rejections, moderation removals, house consent withdrawals and revocations each issue a notice", async () => {
    await rejected();
    const owner = await viewer(s.ownerId);
    const post = await postOf("zara", "preview");
    const r = await fileReport(await viewer(s.memberId), { targetType: "post", targetId: post, reason: "spam" });
    await moderate(owner, r.id, "hide_post", { note: "Spam links in the caption." });
    const c = await viewer(s.creatorIds.isadora);
    const pid = await addParticipant(c, { label: "Partner A", legalName: "Fictional Person", dateOfBirth: "1990-01-01", documentType: "passport", documentCountry: "GB" });
    const cid = await addConsent(c, pid, { scope: "Set", signedOn: "2026-11-01", signature: "Fictional Person" });
    await reviewParticipant(owner, pid, "verified");
    await withdrawConsent(owner, cid, "The participant contacted the house.");
    await reviewParticipant(owner, pid, "revoked", "Document did not match.");
    expect((await myNotices(c)).map((n) => n.kind).sort()).toEqual(["consent_withdrawn", "review_rejected", "verification_revoked"]);
    expect((await myNotices(await viewer(s.creatorIds.zara))).map((n) => n.kind)).toEqual(["moderation_removed"]);
  });

  it("a creator's own consent withdrawal issues no notice; nothing is issued while content is under a safeguarding hold", async () => {
    const c = await viewer(s.creatorIds.isadora);
    const pid = await addParticipant(c, { label: "Partner A", legalName: "Fictional Person", dateOfBirth: "1990-01-01", documentType: "passport", documentCountry: "GB" });
    const cid = await addConsent(c, pid, { scope: "Set", signedOn: "2026-11-01", signature: "Fictional Person" });
    await withdrawConsent(c, cid, "Mine");
    const post = await postOf("valentin", "preview");
    const r = await fileReport(await viewer(s.member2Id), { targetType: "post", targetId: post, reason: "underage_concern" });
    await moderate(await viewer(s.ownerId), r.id, "hide_post", { note: "Hidden." });
    expect(await count(`select 1 from app.moderation_notices`)).toBe(0);
  });

  it("notices are private, immutable and can't be issued by anyone but the owner", async () => {
    await rejected();
    expect(await asViewer(s.creatorIds.zara, (q) => q.query(`select * from app.moderation_notices`))).toHaveLength(0);
    expect(await rlsError(s.creatorIds.isadora, `update app.moderation_notices set statement = '{}'`)).toBe("42501");
    expect(await rlsError(s.creatorIds.isadora, `insert into app.moderation_notices (user_id, kind, source_type, statement, appeal_until, issued_by) values ($1, 'review_rejected', 'review', '{}', now() + interval '1 day', $1)`, [s.creatorIds.zara])).toBe("42501");
    await expect(system((q) => q.query(`delete from app.moderation_notices`))).rejects.toMatchObject({ code: "42501" });
  });
});

describe("appeals", () => {
  it("one appeal per decision, by its recipient only, within the window", async () => {
    await rejected();
    const c = await viewer(s.creatorIds.isadora);
    const [n] = await myNotices(c);
    await expect(fileAppeal(c, n.id, "short")).rejects.toMatchObject({ field: "body" });
    await expect(fileAppeal(await viewer(s.creatorIds.zara), n.id, "This isn't mine but I object")).rejects.toMatchObject({ code: "not_found" });
    await expect(fileAppeal(await viewer(s.ownerId), n.id, "The owner can't appeal this")).rejects.toMatchObject({ code: "forbidden" });
    await fileAppeal(c, n.id, "The logo is my own studio mark.");
    await expect(fileAppeal(c, n.id, "Trying a second time here")).rejects.toMatchObject({ code: "conflict" });
    expect((await myNotices(c))[0]).toMatchObject({ appeal_status: "open", can_appeal: false });
    // Window closed.
    await rejected();
    await system((q) => q.query(`update app.moderation_notices set created_at = now() - interval '1 year', appeal_until = now() - interval '1 day' where id not in (select notice_id from app.decision_appeals)`));
    const late = (await myNotices(c)).find((x) => !x.appeal_status)!;
    expect(late.can_appeal).toBe(false);
    await expect(fileAppeal(c, late.id, "Too late but trying anyway")).rejects.toMatchObject({ code: "validation" });
  });

  it("overturning a review rejection approves the post; the decision is final and owner-only", async () => {
    const id = await rejected();
    const c = await viewer(s.creatorIds.isadora);
    const owner = await viewer(s.ownerId);
    await fileAppeal(c, (await myNotices(c))[0].id, "The logo is my own studio mark.");
    const [a] = await appealQueue(owner);
    await expect(appealQueue(c)).rejects.toMatchObject({ code: "forbidden" });
    expect(await rlsError(s.creatorIds.isadora, `update app.decision_appeals set status = 'overturned', decided_at = now()`)).toBeNull();
    expect(await count(`select 1 from app.decision_appeals where status = 'open'`)).toBe(1);
    await expect(decideAppeal(owner, a.id, "overturn", "short")).rejects.toMatchObject({ field: "note" });
    await decideAppeal(owner, a.id, "overturn", "Agreed: it's your own mark.");
    expect(await getEntitledMedia(await viewer(s.member2Id), id, 0)).not.toBeNull();
    expect((await myNotices(c))[0]).toMatchObject({ appeal_status: "overturned", appeal_note: "Agreed: it's your own mark." });
    await expect(decideAppeal(owner, a.id, "uphold", "Changing my mind now")).rejects.toMatchObject({ code: "conflict" });
    expect(await rlsError(s.ownerId, `update app.decision_appeals set status = 'upheld' where id = $1`, [a.id])).toBe("42501");
  });

  it("overturning a takedown restores the post and lifts its fingerprint block; moderation removals restore too", async () => {
    const owner = await viewer(s.ownerId);
    const post = await postOf("isadora", "members");
    await submitTakedown({ category: "impersonation", requesterRole: "depicted_person", name: "Fictional", email: "f@example.test", signature: "Fictional", location: post, goodFaith: true });
    await decideTakedown(owner, (await takedownQueue(owner))[0].id, "remove", "Valid.");
    const c = await viewer(s.creatorIds.isadora);
    await fileAppeal(c, (await myNotices(c))[0].id, "This is me, not an impersonation.");
    await decideAppeal(owner, (await appealQueue(owner))[0].id, "overturn", "Identity confirmed; notice was wrong.");
    expect(await hidden(post)).toBe(false);
    expect(await count(`select 1 from app.blocked_media_hashes`)).toBe(0);

    const zpost = await postOf("zara", "preview");
    const r = await fileReport(await viewer(s.memberId), { targetType: "post", targetId: zpost, reason: "spam" });
    await moderate(owner, r.id, "hide_post", { note: "Spam." });
    const z = await viewer(s.creatorIds.zara);
    await fileAppeal(z, (await myNotices(z))[0].id, "There are no links in my post.");
    await decideAppeal(owner, (await appealQueue(owner))[0].id, "overturn", "Checked again: no spam.");
    expect(await hidden(zpost)).toBe(false);
  });

  it("consent withdrawals can be upheld but never overturned; revocations can be reversed", async () => {
    const owner = await viewer(s.ownerId);
    const c = await viewer(s.creatorIds.isadora);
    const pid = await addParticipant(c, { label: "Partner A", legalName: "Fictional Person", dateOfBirth: "1990-01-01", documentType: "passport", documentCountry: "GB" });
    const cid = await addConsent(c, pid, { scope: "Set", signedOn: "2026-11-01", signature: "Fictional Person" });
    const cid2 = await addConsent(c, pid, { scope: "Second set", signedOn: "2026-11-02", signature: "Fictional Person" });
    await reviewParticipant(owner, pid, "verified");
    const post = await newPost(s.creatorIds.isadora);
    await setPostParticipants(c, post, [{ participantId: pid, consentId: cid2 }]);
    await decideReview(owner, post, true);
    await withdrawConsent(owner, cid, "Participant asked the house.");
    await reviewParticipant(owner, pid, "revoked", "Document did not match.");
    expect(await hidden(post)).toBe(true);
    for (const n of await myNotices(c)) await fileAppeal(c, n.id, "Please look at this decision again.");
    const queue = await appealQueue(owner);
    const consent = queue.find((a) => a.kind === "consent_withdrawn")!;
    const revoke = queue.find((a) => a.kind === "verification_revoked")!;
    await expect(decideAppeal(owner, consent.id, "overturn", "Trying to reverse this")).rejects.toMatchObject({ code: "conflict" });
    await decideAppeal(owner, consent.id, "uphold", "We can't restore without consent.");
    await decideAppeal(owner, revoke.id, "overturn", "The document was re-checked.");
    expect(await hidden(post)).toBe(false);
    expect(await getEntitledMedia(await viewer(s.member2Id), post, 0)).not.toBeNull();
  });
});
