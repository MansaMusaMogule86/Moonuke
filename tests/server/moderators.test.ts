import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Viewer } from "@/server/auth/permissions";
import type { StaffCapability } from "@/server/auth/staff";
import { featureEnabled } from "@/server/flags";
import { getEntitledMedia } from "@/server/services/club";
import { fileReport, moderate, moderationQueue } from "@/server/services/safety";
import { createPost } from "@/server/services/studio";
import { decideReview, reviewQueue, setReviewMode } from "@/server/services/review";
import { decideTakedown, submitTakedown, takedownContact, takedownQueue } from "@/server/services/takedown";
import { appealQueue, decideAppeal, fileAppeal, myNotices } from "@/server/services/notices";
import { addParticipant, revealIdentity, reviewParticipant } from "@/server/services/participants";
import { caseList } from "@/server/services/safeguarding";
import { createSession, resolveSession } from "@/server/services/sessions";
import { grantStaff, revokeStaff, setModeratorsEnabled, staffActivity, staffOverview } from "@/server/services/staff";
import type { SeedResult } from "@/server/seed";
import { asViewer, closePool, resetDb, rlsError, system, viewer } from "./helpers";

let s: SeedResult;
beforeEach(async () => {
  s = await resetDb();
});
afterAll(closePool);

const T = { testing: true };
const count = async (sql: string, p: unknown[] = []) => (await system((q) => q.one<{ n: number }>(`select count(*)::int as n from (${sql}) x`, p)))!.n;
const enrolMfa = (id: string) => system((q) => q.query(`insert into app.mfa_factors (user_id, secret_enc, confirmed_at) values ($1, 'x', now()) on conflict do nothing`, [id]));
const postOf = async (handle: string, access: string) =>
  (await system((q) => q.one<{ id: string }>(`select p.id from app.posts p join app.creators c on c.user_id = p.creator_id where c.handle = $1 and p.access = $2 order by p.published_at limit 1`, [handle, access])))!.id;

/** Velvet Hour (member2) as a moderator holding `caps`, at AAL2. */
async function moderator(caps: StaffCapability[], { switchOn = true } = {}): Promise<Viewer> {
  const owner = await viewer(s.ownerId);
  await enrolMfa(s.member2Id);
  await grantStaff(owner, "velvet@moonuke.test", caps, "Trial reviewer", T);
  if (switchOn) await setModeratorsEnabled(owner, true, T);
  return { ...(await viewer(s.member2Id)), aal: 2, mfa: "verified", staff: caps };
}

describe("inactive by default", () => {
  it("the flag and the switch are off; granting and switching on are refused until approved", async () => {
    expect(featureEnabled("moderators")).toBe(false);
    const owner = await viewer(s.ownerId);
    await enrolMfa(s.member2Id);
    await expect(grantStaff(owner, "velvet@moonuke.test", ["reports.view"], "")).rejects.toMatchObject({ code: "forbidden" });
    await expect(setModeratorsEnabled(owner, true)).rejects.toMatchObject({ code: "forbidden" });
    await setModeratorsEnabled(owner, false);
    expect((await staffOverview(owner)).enabled).toBe(false);
  });

  it("sessions carry no capabilities while the server flag is off, even with a grant and the switch on", async () => {
    await moderator(["reports.view"]);
    const token = await createSession(s.member2Id, "vitest");
    await system((q) => q.query(`update app.sessions set mfa_verified_at = now() where user_id = $1`, [s.member2Id]));
    const v = await resolveSession(token);
    expect(v).toMatchObject({ aal: 2, staff: [] });
  });

  it("a grant does nothing while the owner's switch is off (RLS)", async () => {
    await fileReport(await viewer(s.memberId), { targetType: "creator", targetId: s.creatorIds.valentin, reason: "spam" });
    const m = await moderator(["reports.view"], { switchOn: false });
    expect(await asViewer(m, (q) => q.query(`select * from app.reports`))).toHaveLength(0);
    expect((await asViewer(m, (q) => q.one<{ ok: boolean }>(`select app.has_capability('reports.view') as ok`)))!.ok).toBe(false);
  });
});

describe("who can be a moderator, and who manages them", () => {
  it("only active members with two-step sign-in; never creators; owner-only management, audited", async () => {
    const owner = await viewer(s.ownerId);
    await expect(grantStaff(owner, "velvet@moonuke.test", ["reports.view"], "", T)).rejects.toMatchObject({ field: "email" });
    await enrolMfa(s.creatorIds.isadora);
    await expect(grantStaff(owner, "isadora@moonuke.test", ["reports.view"], "", T)).rejects.toMatchObject({ field: "email" });
    await expect(grantStaff(owner, "velvet@moonuke.test", ["accounts.suspend"], "", T)).rejects.toMatchObject({ field: "capabilities" });
    await expect(grantStaff(await viewer(s.memberId), "velvet@moonuke.test", ["reports.view"], "", T)).rejects.toMatchObject({ code: "forbidden" });
    expect(await rlsError(s.memberId, `select app.grant_staff($1, array['reports.view'], '')`, [s.member2Id])).toBe("42501");
    expect(await rlsError(s.memberId, `select app.set_moderators_enabled(true)`)).toBe("42501");
    expect(await rlsError(s.member2Id, `insert into app.staff_grants (user_id, capabilities, granted_by) values ($1, array['reports.view'], $1)`, [s.member2Id])).toBe("42501");
    await moderator(["reports.view"]);
    expect(await count(`select 1 from app.audit_log where action in ('staff.grant', 'staff.switch')`)).toBe(2);
    // A moderator at AAL1 has no capability.
    expect((await asViewer({ id: s.member2Id, aal: 1 }, (q) => q.one<{ ok: boolean }>(`select app.has_capability('reports.view') as ok`)))!.ok).toBe(false);
  });
});

describe("reports", () => {
  it("moderators act within their capabilities, never on their own reports, and never suspend", async () => {
    const post = await postOf("zara", "preview");
    const r = await fileReport(await viewer(s.memberId), { targetType: "post", targetId: post, reason: "spam" });
    const own = await fileReport(await viewer(s.member2Id), { targetType: "creator", targetId: s.creatorIds.valentin, reason: "spam" });
    const m = await moderator(["reports.view", "reports.decide", "content.hide"]);
    const q = await moderationQueue(m);
    expect(q.map((x) => x.id)).toContain(r.id);
    expect(q.map((x) => x.id)).not.toContain(own.id);
    expect(await count(`select 1 from app.audit_log where action = 'staff.view_queue' and actor_id = $1`, [s.member2Id])).toBe(1);
    await expect(moderate(m, own.id, "dismiss")).rejects.toMatchObject({ code: "not_found" });
    await expect(moderate(m, r.id, "suspend_user")).rejects.toMatchObject({ code: "forbidden" });
    await moderate(m, r.id, "hide_post", { note: "Spam in caption." });
    expect((await system((q) => q.one<{ h: boolean }>(`select hidden_at is not null as h from app.posts where id = $1`, [post])))!.h).toBe(true);
    const [n] = await myNotices(await viewer(s.creatorIds.zara));
    expect(n.kind).toBe("moderation_removed");
    expect(await count(`select 1 from app.moderation_notices where issued_by = $1`, [s.member2Id])).toBe(1);
    expect(await count(`select 1 from app.audit_log where action = 'moderation.hide_post' and actor_id = $1`, [s.member2Id])).toBe(1);
    // Moderators can't edit posts, only hide or restore them.
    expect(await rlsError(s.member2Id, `update app.posts set teaser = 'changed' where id = $1`, [post], 2)).toBe("42501");
  });

  it("a view-only moderator can't decide, at the app layer or in RLS", async () => {
    const r = await fileReport(await viewer(s.memberId), { targetType: "creator", targetId: s.creatorIds.valentin, reason: "spam" });
    const m = await moderator(["reports.view"]);
    await expect(moderate(m, r.id, "dismiss")).rejects.toMatchObject({ code: "forbidden" });
    await asViewer(m, (q) => q.query(`update app.reports set status = 'dismissed' where id = $1`, [r.id]));
    expect(await count(`select 1 from app.reports where id = $1 and status = 'open'`, [r.id])).toBe(1);
  });
});

describe("owner-only powers stay owner-only", () => {
  it("safeguarding, identity, requester contact, settings and other queues are closed to moderators", async () => {
    const m = await moderator(["reports.view", "reports.decide", "content.hide", "review.decide", "takedowns.decide", "appeals.decide"]);
    await expect(caseList(m)).rejects.toMatchObject({ code: "forbidden" });
    expect(await asViewer(m, (q) => q.query(`select * from app.safeguarding_cases`))).toHaveLength(0);
    expect(await asViewer(m, (q) => q.query(`select * from app.legal_holds`))).toHaveLength(0);
    for (const t of ["participants", "participant_consents"]) expect(await rlsError(s.member2Id, `select * from app.${t}`, [], 2)).toBe("42501");
    const pid = await addParticipant(await viewer(s.creatorIds.isadora), { label: "A", legalName: "Fictional Person", dateOfBirth: "1990-01-01", documentType: "passport", documentCountry: "GB" });
    await expect(revealIdentity(m, pid, "Checking this person please")).rejects.toMatchObject({ code: "forbidden" });
    await expect(reviewParticipant(m, pid, "verified")).rejects.toMatchObject({ code: "forbidden" });
    await expect(setReviewMode(m, "all")).rejects.toMatchObject({ code: "forbidden" });
    await expect(grantStaff(m, "nocturne@moonuke.test", ["reports.view"], "", T)).rejects.toMatchObject({ code: "forbidden" });
    await submitTakedown({ category: "impersonation", requesterRole: "depicted_person", name: "Private Person", email: "private@example.test", signature: "Private Person", location: "somewhere", goodFaith: true });
    const [n] = await takedownQueue(m);
    await expect(takedownContact(m, n.id)).rejects.toMatchObject({ code: "forbidden" });
    expect(await asViewer(m, (q) => q.query(`select * from app.audit_log`))).toHaveLength(0);
    // No browsing private conversations.
    expect(await asViewer(m, (q) => q.query(`select * from app.messages`))).toHaveLength(0);
  });
});

describe("review, takedowns and appeals", () => {
  it("a reviewer sees pending content, decides it, and issues the notice", async () => {
    await setReviewMode(await viewer(s.ownerId), "all");
    const id = await createPost(await viewer(s.creatorIds.isadora), { access: "members", teaser: "Pending", body: "Body text.", mediaKind: "image", publish: "now" });
    const m = await moderator(["review.decide"]);
    expect((await reviewQueue(m)).map((p) => p.id)).toContain(id);
    expect(await getEntitledMedia(m, id, 0)).not.toBeNull();
    await decideReview(m, id, false, "Crop the logo, please.");
    expect(await count(`select 1 from app.moderation_notices where post_id = $1 and issued_by = $2`, [id, s.member2Id])).toBe(1);
    await expect(moderationQueue(m)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("takedown staff decide notices, including copies", async () => {
    const post = await postOf("isadora", "members");
    await submitTakedown({ category: "impersonation", requesterRole: "depicted_person", name: "Fictional", email: "f@example.test", signature: "Fictional", location: post, goodFaith: true });
    const m = await moderator(["takedowns.decide"]);
    const [n] = await takedownQueue(m);
    expect(await decideTakedown(m, n.id, "remove", "Valid notice.")).toMatchObject({ status: "removed" });
    expect(await count(`select 1 from app.blocked_media_hashes`)).toBeGreaterThan(0);
  });

  it("appeal staff never decide appeals of their own decisions or participant cases", async () => {
    await setReviewMode(await viewer(s.ownerId), "all");
    const c = await viewer(s.creatorIds.isadora);
    const mine = await createPost(c, { access: "preview", teaser: "Mine", body: "x", mediaKind: "image", publish: "now" });
    const theirs = await createPost(c, { access: "preview", teaser: "Theirs", body: "x", mediaKind: "image", publish: "now" });
    const m = await moderator(["review.decide", "appeals.decide"]);
    await decideReview(m, mine, false, "Moderator rejected this.");
    await decideReview(await viewer(s.ownerId), theirs, false, "Owner rejected this.");
    for (const n of await myNotices(c)) await fileAppeal(c, n.id, "Please look at this again.");
    const q = await appealQueue(m);
    expect(q).toHaveLength(1);
    expect(q[0].post_id).toBe(theirs);
    const all = await appealQueue(await viewer(s.ownerId));
    const own = all.find((a) => a.post_id === mine)!;
    await expect(decideAppeal(m, own.id, "overturn", "Overturning my own call")).rejects.toMatchObject({ code: "forbidden" });
    expect(await rlsError(s.member2Id, `update app.decision_appeals set status = 'overturned', decided_by = $2, decided_at = now(), decision_note = 'x' where id = $1`, [own.id, s.member2Id], 2)).toBeNull();
    expect(await count(`select 1 from app.decision_appeals where id = $1 and status = 'open'`, [own.id])).toBe(1);
    await decideAppeal(m, q[0].id, "overturn", "Second opinion: fine to publish.");
    expect(await count(`select 1 from app.posts where id = $1 and review_state = 'approved'`, [theirs])).toBe(1);
  });
});

describe("revocation and the activity log", () => {
  it("revoking or switching off takes effect at once, even for a session holding stale capabilities", async () => {
    await fileReport(await viewer(s.memberId), { targetType: "creator", targetId: s.creatorIds.valentin, reason: "spam" });
    const m = await moderator(["reports.view"]);
    expect(await moderationQueue(m)).toHaveLength(1);
    const owner = await viewer(s.ownerId);
    await setModeratorsEnabled(owner, false);
    expect(await moderationQueue(m)).toHaveLength(0);
    await setModeratorsEnabled(owner, true, T);
    expect(await moderationQueue(m)).toHaveLength(1);
    await revokeStaff(owner, s.member2Id, "Trial ended");
    expect(await moderationQueue(m)).toHaveLength(0);
    const o = await staffOverview(owner);
    expect(o.grants[0]).toMatchObject({ alias: expect.any(String), revoke_reason: "Trial ended" });
    expect((await staffActivity(owner)).map((a) => a.action)).toEqual(expect.arrayContaining(["staff.view_queue"]));
    await expect(staffActivity(m)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("grants and appeals can't be deleted or rewritten by viewers", async () => {
    await moderator(["reports.view"]);
    expect(await rlsError(s.member2Id, `update app.staff_grants set capabilities = array['appeals.decide']`)).toBe("42501");
    expect(await rlsError(s.member2Id, `delete from app.staff_grants`)).toBe("42501");
  });
});
