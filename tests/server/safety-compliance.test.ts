import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getEntitledMedia, getProfile } from "@/server/services/club";
import { fileReport, moderate } from "@/server/services/safety";
import { createPost, deletePost, updatePost, myPost } from "@/server/services/studio";
import { decideTakedown, submitTakedown, takedownContact, takedownQueue, type TakedownInput } from "@/server/services/takedown";
import { decideReview, reviewQueue, setReviewMode } from "@/server/services/review";
import {
  addConsent, addParticipant, ageOn, myParticipants, participantQueue, revealIdentity, reviewParticipant, setPostParticipants, withdrawConsent,
} from "@/server/services/participants";
import { attestTraining, caseDetail, caseList, cyberTiplineDraft, decideCase, releaseHold, safeguardingAccess } from "@/server/services/safeguarding";
import { reportingChannel } from "@/server/safety/ncmec";
import { MemoryStorage, MockScanner, MOCK_MATCH_MARKER } from "@/server/media/upload/mock";
import { uploadMedia } from "@/server/media/upload/service";
import type { SeedResult } from "@/server/seed";
import { asViewer, closePool, resetDb, rlsError, system, viewer } from "./helpers";

let s: SeedResult;
beforeEach(async () => {
  s = await resetDb();
});
afterAll(closePool);

const notice = (o: Partial<TakedownInput> = {}): TakedownInput => ({
  category: "ncii",
  requesterRole: "depicted_person",
  name: "Test Requester",
  email: "requester@example.test",
  signature: "Test Requester",
  location: "https://moonuke.test/c/isadora",
  description: "Fictional test notice.",
  goodFaith: true,
  ...o,
});
const postOf = async (handle: string, access: string) =>
  (await system((q) => q.one<{ id: string }>(`select p.id from app.posts p join app.creators c on c.user_id = p.creator_id where c.handle = $1 and p.access = $2 order by p.published_at limit 1`, [handle, access])))!.id;
const count = async (sql: string, p: unknown[] = []) => (await system((q) => q.one<{ n: number }>(`select count(*)::int as n from (${sql}) x`, p)))!.n;
const hidden = async (postId: string) => (await system((q) => q.one<{ h: boolean }>(`select hidden_at is not null as h from app.posts where id = $1`, [postId])))!.h;
const audited = (action: string) => count(`select 1 from app.audit_log where action = $1`, [action]);
const newPost = async (creatorId: string, teaser = "A fictional study") =>
  createPost(await viewer(creatorId), { access: "preview", teaser, body: "Text only.", mediaKind: "image", publish: "now" });

// ===================================================================== takedown notices
describe("public takedown notices", () => {
  it("anyone can file; contact is encrypted; the 48-hour clock starts; urgent categories withhold the post", async () => {
    const post = await postOf("isadora", "preview");
    const r = await submitTakedown(notice({ location: `https://moonuke.test/c/isadora#${post}` }));
    expect(r.reference).toMatch(/^TD-[A-Z2-7]{10}$/);
    const row = (await system((q) => q.one<{ contact_enc: string; hours: number; target_post_id: string; status: string }>(
      `select contact_enc, extract(epoch from due_at - received_at) / 3600 as hours, target_post_id, status from app.takedown_notices where reference = $1`, [r.reference])))!;
    expect(row.contact_enc).not.toContain("requester@example.test");
    expect(row.contact_enc).not.toContain("Test Requester");
    expect(Number(row.hours)).toBe(48);
    expect(row.target_post_id).toBe(post);
    expect(await hidden(post)).toBe(true);
    // The requester gained no access to anything: there is no session, and nothing is returned but the reference.
    expect(Object.keys(r)).toEqual(["reference"]);
  });

  it("gives the same answer whether or not the content exists (no oracle)", async () => {
    const a = await submitTakedown(notice({ location: "https://elsewhere.test/not-here", email: "a@example.test" }));
    const b = await submitTakedown(notice({ location: `https://moonuke.test/c/isadora`, email: "b@example.test" }));
    expect(Object.keys(a)).toEqual(Object.keys(b));
  });

  it("deduplicates: the same person and target get the same reference; others are linked to the first notice", async () => {
    const post = await postOf("zara", "members");
    const first = await submitTakedown(notice({ location: post }));
    const again = await submitTakedown(notice({ location: post }));
    expect(again.reference).toBe(first.reference);
    const other = await submitTakedown(notice({ location: post, email: "second@example.test", name: "Second Person", signature: "Second Person" }));
    expect(other.reference).not.toBe(first.reference);
    expect(await count(`select 1 from app.takedown_notices where target_post_id = $1`, [post])).toBe(2);
    expect(await count(`select 1 from app.takedown_notices where target_post_id = $1 and duplicate_of is not null`, [post])).toBe(1);
    expect((await takedownQueue(await viewer(s.ownerId))).filter((n) => n.target_post_id === post)).toHaveLength(1);
  });

  it("validates input; only the person shown (or their representative) can file NCII; honeypot submissions store nothing", async () => {
    await expect(submitTakedown(notice({ goodFaith: false }))).rejects.toMatchObject({ code: "validation", field: "goodFaith" });
    await expect(submitTakedown(notice({ email: "nope" }))).rejects.toMatchObject({ field: "email" });
    await expect(submitTakedown(notice({ requesterRole: "other" }))).rejects.toMatchObject({ field: "requesterRole" });
    await expect(submitTakedown(notice({ location: "x".repeat(1001) }))).rejects.toMatchObject({ field: "location" });
    const bot = await submitTakedown(notice({ honeypot: "http://spam" }));
    expect(bot.reference).toMatch(/^TD-/);
    expect(await count(`select 1 from app.takedown_notices`)).toBe(0);
  });

  it("rate-limits by network and by requester", async () => {
    for (let i = 0; i < 5; i++) await submitTakedown(notice({ email: `p${i}@example.test`, location: `place ${i}` }), { ipHash: "ip-test" });
    await expect(submitTakedown(notice({ email: "p9@example.test", location: "place 9" }), { ipHash: "ip-test" })).rejects.toMatchObject({ code: "rate_limited" });
    for (let i = 0; i < 5; i++) await submitTakedown(notice({ location: `spot ${i}` }));
    await expect(submitTakedown(notice({ location: "spot 9" }))).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("only the owner at AAL2 can read or decide notices (app layer and RLS)", async () => {
    await submitTakedown(notice());
    await expect(takedownQueue(await viewer(s.memberId))).rejects.toMatchObject({ code: "forbidden" });
    await expect(takedownQueue(await viewer(s.creatorIds.isadora))).rejects.toMatchObject({ code: "forbidden" });
    expect(await asViewer(s.memberId, (q) => q.query(`select * from app.takedown_notices`))).toHaveLength(0);
    expect(await asViewer({ id: s.ownerId, aal: 1 }, (q) => q.query(`select * from app.takedown_notices`))).toHaveLength(0);
    expect(await rlsError(s.memberId, `insert into app.takedown_notices (reference, category, requester_role, contact_enc, contact_hash, location, good_faith, due_at) values ('TD-AAAAAAAAAA','ncii','other','x', repeat('a',64), 'x', true, now())`)).toBe("42501");
    expect(await rlsError(s.memberId, `update app.takedown_notices set status = 'rejected'`)).toBeNull();
    expect(await count(`select 1 from app.takedown_notices where status = 'rejected'`)).toBe(0);
    expect(await takedownQueue(await viewer(s.ownerId))).toHaveLength(1);
  });

  it("removal hides the post and known identical copies, and blocks the fingerprint from coming back", async () => {
    const owner = await viewer(s.ownerId);
    const post = await postOf("isadora", "members");
    // A copy of the same media re-posted by another creator.
    const copy = await newPost(s.creatorIds.zara, "Copy");
    await system((q) => q.query(`update app.post_content set media = (select media from app.post_content where post_id = $1) where post_id = $2`, [post, copy]));
    const r = await submitTakedown(notice({ category: "impersonation", location: post }));
    const dup = await submitTakedown(notice({ category: "impersonation", location: post, email: "x@example.test" }));
    expect(await hidden(post)).toBe(false); // not urgent: stays up until decided
    const n = (await takedownQueue(owner)).find((x) => x.reference === r.reference)!;
    const res = await decideTakedown(owner, n.id, "remove", "Valid notice");
    expect(res).toEqual({ status: "removed", copies: 1 });
    expect(await hidden(post)).toBe(true);
    expect(await hidden(copy)).toBe(true);
    expect(await count(`select 1 from app.takedown_notices where reference = $1 and status = 'removed'`, [dup.reference])).toBe(1);
    // Re-publishing the same media is refused by the database, for every role.
    const fresh = await newPost(s.creatorIds.kaiasol, "Again");
    await expect(system((q) => q.query(`update app.post_content set media = (select media from app.post_content where post_id = $1) where post_id = $2`, [post, fresh]))).rejects.toMatchObject({ hint: "blocked_media" });
    await expect(decideTakedown(owner, n.id, "reject", "Changed my mind about this")).rejects.toMatchObject({ code: "conflict" });
  });

  it("rejection needs a reason and restores only what the notice hid; contact access is audited", async () => {
    const owner = await viewer(s.ownerId);
    const post = await postOf("isadora", "preview");
    const r = await submitTakedown(notice({ location: post }));
    const n = (await takedownQueue(owner)).find((x) => x.reference === r.reference)!;
    await expect(decideTakedown(owner, n.id, "reject", "no")).rejects.toMatchObject({ field: "note" });
    const before = await audited("takedown.contact_view");
    expect((await takedownContact(owner, n.id)).email).toBe("requester@example.test");
    expect(await audited("takedown.contact_view")).toBe(before + 1);
    await decideTakedown(owner, n.id, "reject", "Not this person: the content shows someone else.");
    expect(await hidden(post)).toBe(false);
  });

  it("a CSAM notice escalates to safeguarding with a legal hold, and can't be rejected from the takedown queue", async () => {
    const owner = await viewer(s.ownerId);
    const post = await postOf("valentin", "preview");
    const r = await submitTakedown(notice({ category: "csam", requesterRole: "other", location: post }));
    const n = (await system((q) => q.one<{ id: string; status: string }>(`select id, status from app.takedown_notices where reference = $1`, [r.reference])))!;
    expect(n.status).toBe("escalated");
    expect(await hidden(post)).toBe(true);
    expect(await count(`select 1 from app.safeguarding_cases where source_type = 'takedown' and source_id = $1`, [n.id])).toBe(1);
    expect(await count(`select 1 from app.legal_holds where object_type = 'post' and object_id = $1`, [post])).toBe(1);
    await expect(decideTakedown(owner, n.id, "reject", "This is not what it seems at all")).rejects.toMatchObject({ code: "conflict" });
  });
});

// ===================================================================== pre-publication review
describe("pre-publication review", () => {
  it("default mode keeps ordinary posts publishing immediately", async () => {
    const id = await newPost(s.creatorIds.isadora);
    expect(await getEntitledMedia(await viewer(s.member2Id), id, 0)).not.toBeNull();
  });

  it("in 'all' mode an unreviewed post is invisible everywhere (profile, RLS, signed media) until approved", async () => {
    const owner = await viewer(s.ownerId);
    await setReviewMode(owner, "all");
    const id = await newPost(s.creatorIds.isadora, "Awaiting review");
    const fan = await viewer(s.member2Id);
    expect(await getEntitledMedia(fan, id, 0)).toBeNull();
    expect(await asViewer(fan, (q) => q.query(`select 1 from app.posts where id = $1`, [id]))).toHaveLength(0);
    expect(await asViewer(fan, (q) => q.query(`select 1 from app.post_content where post_id = $1`, [id]))).toHaveLength(0);
    expect((await getProfile(fan, "isadora"))!.posts.map((p) => p.id)).not.toContain(id);
    // The creator still sees it, marked pending.
    expect((await myPost(await viewer(s.creatorIds.isadora), id))!.review).toBe("pending");
    expect((await reviewQueue(owner)).map((p) => p.id)).toContain(id);
    expect(await decideReview(owner, id, true)).toBe("approved");
    expect(await getEntitledMedia(fan, id, 0)).not.toBeNull();
  });

  it("creators can't bypass review: no direct writes to review state, insert is forced to pending, edits re-queue", async () => {
    const owner = await viewer(s.ownerId);
    await setReviewMode(owner, "all");
    const c = s.creatorIds.isadora;
    const id = await newPost(c);
    expect(await rlsError(c, `update app.posts set review_state = 'approved' where id = $1`, [id])).toBe("42501");
    expect(await rlsError(c, `select app.decide_post_review($1, true, '')`, [id])).toBe("42501");
    const forced = await asViewer(c, (q) =>
      q.one<{ review_state: string }>(`insert into app.posts (creator_id, access, teaser, media_kind, media_count, published_at, review_state) values ($1, 'preview', 'x', 'image', 1, now(), 'approved') returning review_state`, [c]),
    );
    expect(forced!.review_state).toBe("pending");
    await decideReview(owner, id, true);
    await updatePost(await viewer(c), id, { access: "preview", teaser: "Changed teaser", body: "Text only.", mediaKind: "image", publish: "now" });
    expect((await myPost(await viewer(c), id))!.review).toBe("pending");
    expect(await getEntitledMedia(await viewer(s.member2Id), id, 0)).toBeNull();
    // Body-only edits re-queue too.
    await decideReview(owner, id, true);
    await updatePost(await viewer(c), id, { access: "preview", teaser: "Changed teaser", body: "New body.", mediaKind: "image", publish: "now" });
    expect((await myPost(await viewer(c), id))!.review).toBe("pending");
  });

  it("rejection needs a note, stays invisible, and only the owner can switch modes or decide", async () => {
    const owner = await viewer(s.ownerId);
    await expect(setReviewMode(await viewer(s.creatorIds.isadora), "flagged")).rejects.toMatchObject({ code: "forbidden" });
    expect(await rlsError(s.memberId, `select app.set_review_mode('flagged')`)).toBe("42501");
    await setReviewMode(owner, "all");
    const id = await newPost(s.creatorIds.isadora);
    await expect(decideReview(owner, id, false, "")).rejects.toMatchObject({ field: "note" });
    await decideReview(owner, id, false, "Please crop the frame.");
    expect((await myPost(await viewer(s.creatorIds.isadora), id))).toMatchObject({ review: "rejected", reviewNote: "Please crop the frame." });
    expect(await getEntitledMedia(await viewer(s.member2Id), id, 0)).toBeNull();
    await expect(decideReview(owner, id, true)).rejects.toMatchObject({ code: "conflict" });
  });

  it("notifications for an unreviewed post stay invisible until approval", async () => {
    const owner = await viewer(s.ownerId);
    await setReviewMode(owner, "all");
    const id = await newPost(s.creatorIds.isadora);
    const seen = () => asViewer(s.memberId, (q) => q.query(`select 1 from app.notifications where post_id = $1`, [id]));
    expect(await seen()).toHaveLength(0);
    await decideReview(owner, id, true);
    expect(await seen()).toHaveLength(1);
  });
});

// ===================================================================== participants
const adult = { label: "Partner A", legalName: "Fictional Person", dateOfBirth: "1990-04-02", documentType: "passport" as const, documentCountry: "GB" };

describe("participant identity, age and consent", () => {
  it("computes age correctly around birthdays", () => {
    expect(ageOn("2008-11-07", new Date("2026-11-06T12:00:00Z"))).toBe(17);
    expect(ageOn("2008-11-06", new Date("2026-11-06T12:00:00Z"))).toBe(18);
    expect(ageOn("2008-02-30")).toBeNaN();
  });

  it("refuses anyone under 18 and stores nothing about them", async () => {
    const c = await viewer(s.creatorIds.isadora);
    await expect(addParticipant(c, { ...adult, dateOfBirth: "2010-01-01" })).rejects.toMatchObject({ field: "dateOfBirth" });
    expect(await count(`select 1 from app.participants`)).toBe(0);
    expect(await audited("participant.refused_minor")).toBe(1);
  });

  it("encrypts identity, keeps records private to their creator, and gives viewers no table access", async () => {
    const c = await viewer(s.creatorIds.isadora);
    const id = await addParticipant(c, adult);
    const row = (await system((q) => q.one<{ identity_enc: string }>(`select identity_enc from app.participants where id = $1`, [id])))!;
    expect(row.identity_enc).not.toContain("Fictional Person");
    expect(row.identity_enc).not.toContain("1990");
    expect(await myParticipants(c)).toHaveLength(1);
    expect(await myParticipants(await viewer(s.creatorIds.zara))).toHaveLength(0);
    expect(await asViewer(s.memberId, (q) => q.query(`select * from app.my_participants()`))).toHaveLength(0);
    for (const t of ["participants", "participant_consents", "post_participants"]) {
      expect(await rlsError(s.creatorIds.isadora, `select * from app.${t}`)).toBe("42501");
    }
    await expect(addConsent(await viewer(s.creatorIds.zara), id, { scope: "Everything", signedOn: "2026-01-01", signature: "X Y" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("identity is revealed only to the owner, with a stated purpose recorded first", async () => {
    const id = await addParticipant(await viewer(s.creatorIds.isadora), adult);
    const owner = await viewer(s.ownerId);
    await expect(revealIdentity(owner, id, "short")).rejects.toMatchObject({ field: "purpose" });
    await expect(revealIdentity(await viewer(s.creatorIds.isadora), id, "I want to see it again")).rejects.toMatchObject({ code: "forbidden" });
    expect(await rlsError(s.creatorIds.isadora, `select app.participant_identity($1, 'reason that is long')`, [id])).toBe("42501");
    expect(await revealIdentity(owner, id, "Verifying age before approval")).toMatchObject({ legalName: "Fictional Person", dateOfBirth: "1990-04-02" });
    expect(await audited("participant.identity_view")).toBe(1);
  });

  it("a post can name only verified participants with active consent, and then waits for review", async () => {
    const c = await viewer(s.creatorIds.isadora);
    const owner = await viewer(s.ownerId);
    const pid = await addParticipant(c, adult);
    const cid = await addConsent(c, pid, { scope: "Studio set, November", signedOn: "2026-11-01", signature: "Fictional Person" });
    const post = await newPost(s.creatorIds.isadora, "Duo study");
    await expect(setPostParticipants(c, post, [{ participantId: pid, consentId: cid }])).rejects.toMatchObject({ code: "validation" });
    expect((await participantQueue(owner)).map((p) => p.id)).toContain(pid);
    await reviewParticipant(owner, pid, "verified");
    await setPostParticipants(c, post, [{ participantId: pid, consentId: cid }]);
    expect((await myPost(c, post))!.review).toBe("pending");
    expect(await getEntitledMedia(await viewer(s.member2Id), post, 0)).toBeNull();
    await decideReview(owner, post, true);
    expect(await getEntitledMedia(await viewer(s.member2Id), post, 0)).not.toBeNull();
    // Another creator can't attach someone else's participant.
    const other = await newPost(s.creatorIds.zara);
    await expect(setPostParticipants(await viewer(s.creatorIds.zara), other, [{ participantId: pid, consentId: cid }])).rejects.toMatchObject({ code: "validation" });
    await expect(setPostParticipants(await viewer(s.creatorIds.zara), post, [])).rejects.toMatchObject({ code: "not_found" });
  });

  it("withdrawing consent hides every post that relied on it, at once; the consent can't be reused", async () => {
    const c = await viewer(s.creatorIds.isadora);
    const owner = await viewer(s.ownerId);
    const pid = await addParticipant(c, adult);
    const cid = await addConsent(c, pid, { scope: "Studio set", signedOn: "2026-11-01", signature: "Fictional Person" });
    await reviewParticipant(owner, pid, "verified");
    const p1 = await newPost(s.creatorIds.isadora, "One");
    const p2 = await newPost(s.creatorIds.isadora, "Two");
    await setPostParticipants(c, p1, [{ participantId: pid, consentId: cid }]);
    await setPostParticipants(c, p2, [{ participantId: pid, consentId: cid }]);
    await decideReview(owner, p1, true);
    await expect(withdrawConsent(await viewer(s.creatorIds.zara), cid, "not mine")).rejects.toMatchObject({ code: "not_found" });
    expect(await withdrawConsent(c, cid, "Participant asked")).toBe(2);
    expect(await hidden(p1)).toBe(true);
    expect(await hidden(p2)).toBe(true);
    expect(await getEntitledMedia(await viewer(s.member2Id), p1, 0)).toBeNull();
    const p3 = await newPost(s.creatorIds.isadora, "Three");
    await expect(setPostParticipants(c, p3, [{ participantId: pid, consentId: cid }])).rejects.toMatchObject({ code: "validation" });
    // The creator can't unhide it themselves.
    expect(await rlsError(s.creatorIds.isadora, `update app.posts set hidden_at = null where id = $1`, [p1])).toBe("42501");
    // Nobody can restore it while the consent is withdrawn, not even the server.
    await expect(system((q) => q.query(`update app.posts set hidden_at = null where id = $1`, [p1]))).rejects.toMatchObject({ hint: "consent_invalid" });
    const rep = await fileReport(await viewer(s.memberId), { targetType: "creator", targetId: s.creatorIds.isadora, reason: "spam" });
    await system((q) => q.query(`update app.reports set target_type = 'post', target_id = $2 where id = $1`, [rep.id, p1]));
    await expect(moderate(owner, rep.id, "restore_post")).rejects.toMatchObject({ code: "conflict" });
    // Records are kept, never deleted.
    expect(await count(`select 1 from app.participant_consents where id = $1 and withdrawn_at is not null`, [cid])).toBe(1);
  });

  it("revoking a verification hides the posts that name the participant", async () => {
    const c = await viewer(s.creatorIds.isadora);
    const owner = await viewer(s.ownerId);
    const pid = await addParticipant(c, adult);
    const cid = await addConsent(c, pid, { scope: "Set", signedOn: "2026-11-01", signature: "Fictional Person" });
    await reviewParticipant(owner, pid, "verified");
    const p = await newPost(s.creatorIds.isadora);
    await setPostParticipants(c, p, [{ participantId: pid, consentId: cid }]);
    await expect(reviewParticipant(owner, pid, "revoked")).rejects.toMatchObject({ code: "validation" });
    await reviewParticipant(owner, pid, "revoked", "Document did not match.");
    expect(await hidden(p)).toBe(true);
  });
});

// ===================================================================== safeguarding
describe("safeguarding and NCMEC preparation", () => {
  const underageReport = async () => {
    const post = await postOf("isadora", "preview");
    const r = await fileReport(await viewer(s.member2Id), { targetType: "post", targetId: post, reason: "underage_concern" });
    return { post, reportId: r.id };
  };

  it("a child-safety report opens a separate urgent case and preserves the post and account", async () => {
    const { post } = await underageReport();
    expect(await hidden(post)).toBe(true);
    const c = (await system((q) => q.one<{ id: string; status: string }>(`select id, status from app.safeguarding_cases`)))!;
    expect(c.status).toBe("open");
    expect(await count(`select 1 from app.legal_holds where case_id = $1`, [c.id])).toBe(2);
    expect(await count(`select 1 from app.email_outbox where template = 'safeguarding_alert'`)).toBe(1);
  });

  it("ordinary moderation access is not enough: training must be attested (app layer and RLS)", async () => {
    await underageReport();
    const owner = await viewer(s.ownerId);
    expect(await safeguardingAccess(owner)).toEqual({ trained: false, open: 1 });
    await expect(caseList(owner)).rejects.toMatchObject({ code: "forbidden" });
    expect(await asViewer(owner, (q) => q.query(`select * from app.safeguarding_cases`))).toHaveLength(0);
    expect(await asViewer(owner, (q) => q.query(`select * from app.legal_holds`))).toHaveLength(0);
    await expect(safeguardingAccess(await viewer(s.memberId))).rejects.toMatchObject({ code: "forbidden" });
    expect(await rlsError(s.memberId, `select app.attest_safeguarding_training(current_date, 'Course')`)).toBe("42501");
    await expect(attestTraining(owner, new Date("2010-01-01"), "Old course")).rejects.toMatchObject({ field: "trainedOn" });
    await attestTraining(owner, new Date(), "Fictional safeguarding course");
    expect(await caseList(owner)).toHaveLength(1);
    // At AAL1 even the trained owner sees nothing.
    expect(await asViewer({ id: s.ownerId, aal: 1 }, (q) => q.query(`select * from app.safeguarding_cases`))).toHaveLength(0);
  });

  it("the ordinary queue can't dismiss or restore content in a case", async () => {
    const { reportId } = await underageReport();
    const owner = await viewer(s.ownerId);
    await expect(moderate(owner, reportId, "dismiss")).rejects.toMatchObject({ code: "conflict" });
    await expect(moderate(owner, reportId, "restore_post")).rejects.toMatchObject({ code: "conflict" });
  });

  it("enforces the reporting workflow: reasons, the manual report number, and valid transitions", async () => {
    await underageReport();
    const owner = await viewer(s.ownerId);
    await attestTraining(owner, new Date(), "Fictional safeguarding course");
    const [c] = await caseList(owner);
    await expect(decideCase(owner, c.id, "reported", { externalRef: "123", attestManual: true })).rejects.toMatchObject({ code: "conflict" });
    await expect(decideCase(owner, c.id, "no_report_required", { reason: "too short" })).rejects.toMatchObject({ field: "reason" });
    expect(await decideCase(owner, c.id, "assess")).toBe("assessing");
    expect(await decideCase(owner, c.id, "report_required", { reason: "Apparent minor." })).toBe("report_required");
    await expect(decideCase(owner, c.id, "reported", { externalRef: "CT-0001" })).rejects.toMatchObject({ field: "attestManual" });
    await expect(decideCase(owner, c.id, "reported", { attestManual: true })).rejects.toMatchObject({ field: "externalRef" });
    expect(await decideCase(owner, c.id, "reported", { externalRef: "CT-0001", attestManual: true })).toBe("reported");
    const d = (await caseDetail(owner, c.id))!;
    expect(d.c.external_ref).toBe("CT-0001");
    expect(d.events.map((e) => e.kind)).toEqual(["opened", "assess", "report_required", "reported"]);
    expect(await audited("safeguarding.case_view")).toBe(1);
    // The database also refuses "reported" without a number.
    expect(await rlsError(s.ownerId, `update app.safeguarding_cases set status = 'reported', external_ref = null where id = $1`, [c.id])).toBe("23514");
  });

  it("nothing is ever sent externally; the draft holds identifiers and fingerprints, not content", async () => {
    await underageReport();
    expect(() => reportingChannel.submit()).toThrow(/disabled/);
    const owner = await viewer(s.ownerId);
    await attestTraining(owner, new Date(), "Fictional safeguarding course");
    const [c] = await caseList(owner);
    const draft = await cyberTiplineDraft(owner, c.id);
    const text = JSON.stringify(draft);
    expect(draft.notice).toMatch(/Nothing has been sent/);
    expect(text).not.toMatch(/"body"|"teaser"|"media":/);
    expect(text).toMatch(/media_hashes/);
  });

  it("legal holds block deletion by anyone (including the server) until released after one year, and evidence is append-only", async () => {
    const { post } = await underageReport();
    const owner = await viewer(s.ownerId);
    await expect(deletePost(await viewer(s.creatorIds.isadora), post)).rejects.toMatchObject({ code: "conflict" });
    await expect(system((q) => q.query(`delete from app.posts where id = $1`, [post]))).rejects.toMatchObject({ hint: "legal_hold" });
    await expect(system((q) => q.query(`delete from app.users where id = $1`, [s.creatorIds.isadora]))).rejects.toMatchObject({ code: "42501" });
    await expect(system((q) => q.query(`update app.post_content set body = 'tampered' where post_id = $1`, [post]))).rejects.toMatchObject({ hint: "legal_hold" });
    await expect(system((q) => q.query(`delete from app.legal_holds`))).rejects.toMatchObject({ code: "42501" });
    await expect(system((q) => q.query(`update app.legal_holds set preserve_until = now()`))).rejects.toMatchObject({ code: "42501" });
    await expect(system((q) => q.query(`update app.safeguarding_events set note = 'x'`))).rejects.toMatchObject({ code: "42501" });
    expect(Number((await system((q) => q.one<{ d: number }>(`select extract(day from preserve_until - placed_at) as d from app.legal_holds limit 1`)))!.d)).toBeGreaterThanOrEqual(365);

    await attestTraining(owner, new Date(), "Fictional safeguarding course");
    const [c] = await caseList(owner);
    const hold = (await caseDetail(owner, c.id))!.holds[0];
    await decideCase(owner, c.id, "no_report_required", { reason: "Verified adult performer: ID and consent records checked by the house." });
    await expect(releaseHold(owner, hold.id, "Case closed and nothing further is required")).rejects.toMatchObject({ code: "conflict" });
    await decideCase(owner, c.id, "close");
    await expect(releaseHold(owner, hold.id, "Case closed and nothing further is required")).rejects.toMatchObject({ code: "conflict" });
    expect(await rlsError(s.ownerId, `update app.legal_holds set released_at = now(), release_reason = 'early' where id = $1`, [hold.id])).toBe("23514");
  });

  it("a scanner match on an upload opens a case and preserves the upload", async () => {
    const creator = await viewer(s.creatorIds.isadora);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, ...Buffer.from(`IHDRpixels${MOCK_MATCH_MARKER}`)]);
    const r = await uploadMedia(creator, "post", "image/png", png, { storage: new MemoryStorage(), scanner: new MockScanner(), testing: true });
    expect(r.status).toBe("quarantined");
    expect(await count(`select 1 from app.safeguarding_cases where source_type = 'scan' and source_id = $1`, [r.id])).toBe(1);
    expect(await count(`select 1 from app.legal_holds where object_type = 'media_upload' and object_id = $1`, [r.id])).toBe(1);
  });
});
