import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { redeemInvitation } from "@/server/services/accounts";
import { getProfile } from "@/server/services/club";
import { getOnboarding, reviewVerification, submitVerification } from "@/server/services/creatorOnboarding";
import {
  addSocial,
  assistDraft,
  caseDetail,
  decideProposal,
  myOnboarding,
  myProposals,
  mySocials,
  openWhiteGloveCase,
  pipeline,
  proposeProfile,
  publicSocials,
  reviewSocial,
  setSocialVisibility,
  updateCase,
} from "@/server/services/onboarding";
import { checkText, sanitizeCopy } from "@/server/ai/safety";
import { draftFromTemplate } from "@/server/ai/template";
import type { SeedResult } from "@/server/seed";
import { asViewer, closePool, meta, resetDb, rlsError, system, viewer } from "./helpers";

let s: SeedResult;
beforeEach(async () => {
  s = await resetDb();
});
afterAll(closePool);

const activate = (id: string) => system((q) => q.query(`update app.users set status = 'active' where id = $1`, [id]));

describe("white-glove cases", () => {
  it("issues a single-use, email-locked creator invite and links the case on redemption", async () => {
    const owner = await viewer(s.ownerId);
    const c = await openWhiteGloveCase(owner, { name: "Ines Moreau", email: "ines@example.com", note: "Referred by Isadora" });
    const inv = await system((q) => q.one<{ max_uses: number; email: string; intended_role: string }>(
      `select i.max_uses, i.email::text as email, i.intended_role from app.invitations i join app.onboarding_cases c on c.invitation_id = i.id where c.id = $1`, [c.caseId]));
    expect(inv).toMatchObject({ max_uses: 1, email: "ines@example.com", intended_role: "creator" });
    await expect(redeemInvitation(c.token, { alias: "Ines M", email: "other@example.com", password: "a-long-enough-password" }, meta)).rejects.toMatchObject({ field: "email" });
    const { userId } = await redeemInvitation(c.token, { alias: "Ines M", email: "ines@example.com", password: "a-long-enough-password" }, meta);
    const d = (await caseDetail(owner, { caseId: c.caseId }))!;
    expect(d.user?.id).toBe(userId);
    expect(d.stages.done.applied).toBe(true);
    expect(d.stages.current).toBe("approved");
  });

  it("the pipeline shows invited-only cases, linked cases and self-serve creators with derived stages", async () => {
    const rows = await pipeline(await viewer(s.ownerId));
    const lio = rows.find((r) => r.name === "Lio Marchand")!;
    expect(lio).toMatchObject({ white_glove: true, user_id: null, stage: "applied" });
    const rhea = rows.find((r) => r.email === "rhea@moonuke.test")!;
    // Verification is submitted, so the next pending step is the owner's "Verified & live".
    expect(rhea).toMatchObject({ white_glove: true, stage: "live", pending_socials: 1 });
    expect(rhea.done).toMatchObject({ verification: true, live: false });
    const isadora = rows.find((r) => r.handle === "isadora")!;
    expect(isadora).toMatchObject({ white_glove: false, stage: "live" });
  });

  it("concierge notes and cases are owner-only, in app code and RLS", async () => {
    const rhea = await viewer(s.creatorIds.rhea);
    expect(await asViewer(rhea, (q) => q.query(`select * from app.onboarding_cases`))).toHaveLength(0);
    const mine = await myOnboarding(rhea);
    expect(mine.whiteGlove).toBe(true);
    expect(JSON.stringify(mine)).not.toContain("Kiln schedule");
    await expect(pipeline(rhea)).rejects.toMatchObject({ code: "forbidden" });
    await expect(pipeline(await viewer(s.memberId))).rejects.toMatchObject({ code: "forbidden" });
  });

  it("welcome call tracking updates the stage", async () => {
    const owner = await viewer(s.ownerId);
    const d = (await caseDetail(owner, { userId: s.creatorIds.rhea }))!;
    expect(d.stages.done.welcome).toBe(false);
    await updateCase(owner, d.case!.id, { welcomeCallDone: true, notes: "Call done; loves the black-and-gold." });
    const after = (await caseDetail(owner, { userId: s.creatorIds.rhea }))!;
    expect(after.stages.done.welcome).toBe(true);
    expect(after.case!.notes).toContain("loves");
  });
});

describe("profile proposals: the house prepares, the creator consents", () => {
  it("a proposal never changes the profile until the creator accepts it", async () => {
    const owner = await viewer(s.ownerId);
    const rhea = await viewer(s.creatorIds.rhea);
    await proposeProfile(owner, s.creatorIds.rhea, { tagline: "Wood-fired, slow, singular.", bio: "Stoneware from a two-chamber anagama kiln." }, { message: "A first pass — edit freely." });
    expect((await getOnboarding(rhea)).profile!.tagline).toBe("Kiln notes and glaze tests.");
    const [p] = await myProposals(rhea);
    expect(p).toMatchObject({ status: "proposed", source: "house" });
    await decideProposal(rhea, p.id, true);
    expect((await getOnboarding(rhea)).profile).toMatchObject({ tagline: "Wood-fired, slow, singular.", handle: "rhea" });
    expect((await myProposals(rhea))[0].status).toBe("accepted");
  });

  it("a new proposal supersedes the open one; declined proposals change nothing", async () => {
    const owner = await viewer(s.ownerId);
    const rhea = await viewer(s.creatorIds.rhea);
    await proposeProfile(owner, s.creatorIds.rhea, { tagline: "First." });
    await proposeProfile(owner, s.creatorIds.rhea, { tagline: "Second." });
    const list = await myProposals(rhea);
    expect(list.map((x) => x.status)).toEqual(["proposed", "superseded"]);
    await decideProposal(rhea, list[0].id, false);
    expect((await getOnboarding(rhea)).profile!.tagline).toBe("Kiln notes and glaze tests.");
  });

  it("the owner cannot accept on the creator's behalf, and nobody can write another creator's proposal (RLS)", async () => {
    const owner = await viewer(s.ownerId);
    const id = await proposeProfile(owner, s.creatorIds.rhea, { tagline: "x" });
    const forged = await asViewer(owner, (q) => q.query(`update app.profile_proposals set status = 'accepted' where id = $1 returning 1`, [id])).catch((e) => e.code);
    expect(forged === "42501" || (Array.isArray(forged) && forged.length === 0)).toBe(true);
    expect(await rlsError(s.creatorIds.isadora, `insert into app.profile_proposals (user_id, author_id, source, fields) values ($1, $2, 'creator', '{}')`, [s.creatorIds.rhea, s.creatorIds.isadora], 1)).toBe("42501");
    expect(await asViewer(s.creatorIds.isadora, (q) => q.query(`select * from app.profile_proposals where user_id = $1`, [s.creatorIds.rhea]))).toHaveLength(0);
  });

  it("unsafe copy is refused at proposal time", async () => {
    await expect(proposeProfile(await viewer(s.ownerId), s.creatorIds.rhea, { bio: "Barely legal looks" })).rejects.toMatchObject({ code: "validation" });
  });
});

describe("social connections", () => {
  it("creators add claims; only the owner verifies; members see only verified + opted-in socials of visible creators", async () => {
    const rhea = await viewer(s.creatorIds.rhea);
    const { id, proofCode } = await addSocial(rhea, { platform: "tiktok", handle: "@rhea.fires" });
    expect(proofCode).toMatch(/^mnk-[a-f0-9]{8}$/);
    // Self-verification is impossible (trigger + RLS)
    expect(await rlsError(s.creatorIds.rhea, `update app.social_connections set status = 'verified' where id = $1`, [id], 1)).toBe("42501");
    await setSocialVisibility(rhea, id, true);
    await reviewVerification(await viewer(s.ownerId), s.creatorIds.rhea, "verify", { checks: { identity: true, age: true, consent_records: true } });
    const member = await viewer(s.member2Id);
    expect(await publicSocials(member, s.creatorIds.rhea)).toHaveLength(0); // still unverified
    await reviewSocial(await viewer(s.ownerId), id, "verified");
    expect(await publicSocials(member, s.creatorIds.rhea)).toEqual([{ platform: "tiktok", handle: "rhea.fires", url: "https://www.tiktok.com/@rhea.fires" }]);
    // Editing a verified handle drops it back to unverified and hides it.
    await asViewer(rhea, (q) => q.query(`update app.social_connections set handle = 'someone.else' where id = $1`, [id]));
    expect((await mySocials(rhea)).find((x) => x.id === id)).toMatchObject({ status: "unverified", show_on_profile: false });
    expect(await publicSocials(member, s.creatorIds.rhea)).toHaveLength(0);
  });

  it("platform links must stay on the platform's own domain", async () => {
    const rhea = await viewer(s.creatorIds.rhea);
    await expect(addSocial(rhea, { platform: "instagram", handle: "rhea", url: "https://evil.example/rhea" })).rejects.toMatchObject({ field: "url" });
    await expect(addSocial(rhea, { platform: "website", handle: "studio", url: "http://insecure.example" })).rejects.toMatchObject({ field: "url" });
    await expect(addSocial(rhea, { platform: "x", handle: "bad handle!" })).rejects.toMatchObject({ field: "handle" });
  });

  it("socials of hidden creators are invisible to members", async () => {
    const member = await viewer(s.member2Id);
    expect(await asViewer(member, (q) => q.query(`select * from app.social_connections where user_id = $1`, [s.creatorIds.rhea]))).toHaveLength(0);
    expect(await getProfile(member, "rhea")).toBeNull();
  });

  it("only creators can add socials", async () => {
    await expect(addSocial(await viewer(s.memberId), { platform: "x", handle: "nocturne" })).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("AI-assisted profile preparation", () => {
  const input = { displayName: "Rhea Calder", discipline: "Ceramicist", city: "Kyoto", keywords: ["glaze tests", "kiln days"], tone: "refined" as const };

  it("the local template drafts three taglines and a bio without any network call", () => {
    const d = draftFromTemplate(input);
    expect(d.taglines).toHaveLength(3);
    expect(d.bio).toContain("Rhea Calder");
    expect(d.bio).toContain("Kyoto");
    expect(checkText(d.bio, ...d.taglines).ok).toBe(true);
  });

  it("blocks minor-related and non-consent inputs and meters without storing content", async () => {
    const rhea = await viewer(s.creatorIds.rhea);
    await expect(assistDraft(rhea, s.creatorIds.rhea, { ...input, keywords: ["schoolgirl looks"] }, false)).rejects.toMatchObject({ code: "validation" });
    await expect(assistDraft(rhea, s.creatorIds.rhea, { ...input, offering: "17 years old" }, false)).rejects.toMatchObject({ code: "validation" });
    const ok = await assistDraft(rhea, s.creatorIds.rhea, input, false);
    expect(ok.provider).toBe("template");
    const usage = await system((q) => q.query<{ blocked: boolean }>(`select * from app.ai_assist_usage where user_id = $1 order by id`, [s.creatorIds.rhea]));
    expect(usage.map((u) => u.blocked)).toEqual([true, true, false]);
    const dump = JSON.stringify(await system((q) => q.query(`select * from app.ai_assist_usage`)));
    expect(dump).not.toMatch(/schoolgirl|Kyoto|glaze/);
  });

  it("only the creator themselves or the owner can request drafts for a profile", async () => {
    await expect(assistDraft(await viewer(s.creatorIds.isadora), s.creatorIds.rhea, input, false)).rejects.toMatchObject({ code: "forbidden" });
    await expect(assistDraft(await viewer(s.memberId), s.memberId, input, false)).rejects.toMatchObject({ code: "forbidden" });
    await expect(assistDraft(await viewer(s.ownerId), s.creatorIds.rhea, input, false)).resolves.toMatchObject({ provider: "template" });
  });

  it("sanitises contact details and links out of generated copy", () => {
    expect(sanitizeCopy("Find me at me@x.com or https://x.co/me, +44 20 7946 0958 @handle", 200)).toBe("Find me at or");
    expect(checkText("A 16 yo look").ok).toBe(false);
    expect(checkText("Glaze tests at dawn").ok).toBe(true);
  });
});

describe("end-to-end approval workflow", () => {
  it("invite → apply → approve → house proposal → accept → social verified → submit → verify → live", async () => {
    const owner = await viewer(s.ownerId);
    const c = await openWhiteGloveCase(owner, { name: "Ines Moreau", email: "ines@example.com" });
    const { userId } = await redeemInvitation(c.token, { alias: "Ines M", email: "ines@example.com", password: "a-long-enough-password" }, meta);
    await activate(userId);
    const ines = await viewer(userId);
    await proposeProfile(owner, userId, { handle: "ines_m", displayName: "Ines Moreau", discipline: "Dancer", category: "movement", tagline: "Contemporary, close up." }, { aiAssisted: true });
    const [p] = await myProposals(ines);
    expect(p.ai_assisted).toBe(true);
    await decideProposal(ines, p.id, true);
    const soc = await addSocial(ines, { platform: "instagram", handle: "ines.moves" });
    await reviewSocial(owner, soc.id, "verified");
    await submitVerification(ines);
    await reviewVerification(owner, userId, "verify", { checks: { identity: true, age: true, consent_records: true } });
    const row = (await pipeline(owner)).find((r) => r.user_id === userId)!;
    expect(row.stage).toBe("live");
    expect(Object.values(row.done).every(Boolean) || !row.done.welcome).toBe(true);
    expect(await getProfile(await viewer(s.member2Id), "ines_m")).not.toBeNull();
  });
});
