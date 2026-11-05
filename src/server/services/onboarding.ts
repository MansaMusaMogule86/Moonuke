import "server-only";
import { asViewer } from "@/server/db";
import { can, type Viewer } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { profileAssistant, type AssistInput, type AssistOutput } from "@/server/ai";
import { checkText, sanitizeCopy } from "@/server/ai/safety";
import { createInvitation } from "./admin";
import { audit } from "./audit";
import { saveProfile, type ProfileInput } from "./creatorOnboarding";
import { importHash, parseImport } from "@/server/imports/parse";
import { newProofCode, normalizeSocial, type Platform, type SocialLink } from "@/server/imports/social";

// =====================================================================
// Stages — derived from data, never stored, so they can't drift.
// =====================================================================
export const STAGES = [
  { key: "invited", label: "Invited", optional: false },
  { key: "applied", label: "Applied", optional: false },
  { key: "approved", label: "Account approved", optional: false },
  { key: "welcome", label: "Welcome call", optional: true },
  { key: "profile", label: "Profile ready", optional: false },
  { key: "socials", label: "Socials verified", optional: true },
  { key: "verification", label: "Verification submitted", optional: false },
  { key: "live", label: "Verified & live", optional: false },
] as const;
export type StageKey = (typeof STAGES)[number]["key"];

type StageFacts = {
  hasUser: boolean;
  active: boolean;
  welcomeDone: boolean;
  hasProfile: boolean;
  verifiedSocials: number;
  verification: string | null;
  published: boolean;
};

export function stagesFor(f: StageFacts) {
  const done: Record<StageKey, boolean> = {
    invited: true,
    applied: f.hasUser,
    approved: f.active,
    welcome: f.welcomeDone,
    profile: f.hasProfile,
    socials: f.verifiedSocials > 0,
    verification: ["submitted", "in_review", "verified"].includes(f.verification ?? ""),
    live: f.verification === "verified" && f.published,
  };
  const current = STAGES.find((s) => !done[s.key] && !s.optional)?.key ?? "live";
  return { done, current: done.live ? ("live" as const) : current, needsInfo: f.verification === "needs_more_info" };
}

function assertOwner(v: Viewer) {
  if (!can(v, "creators.verify")) throw new AppError("forbidden", "Not allowed.");
}
function assertCreator(v: Viewer) {
  if (v.role !== "creator" || v.status !== "active") throw new AppError("forbidden", "Not allowed.");
}

// =====================================================================
// White-glove cases (owner)
// =====================================================================

/** Issue a single-use, email-locked creator invitation and open a concierge case for it. */
export async function openWhiteGloveCase(
  owner: Viewer,
  input: { name: string; email: string; note?: string; sendEmail?: boolean },
  meta: { ipHash?: string | null } = {},
) {
  assertOwner(owner);
  const inv = await createInvitation(
    owner,
    { role: "creator", email: input.email, maxUses: 1, expiresInDays: 14, note: input.note ?? `White-glove: ${input.name}`, sendEmail: input.sendEmail },
    meta,
  );
  const caseId = await asViewer(owner, async (q) => {
    const row = await q.one<{ id: string }>(
      `insert into app.onboarding_cases (invitation_id, invitee_name, invitee_email, concierge_notes, created_by) values ($1, $2, $3, $4, $5) returning id`,
      [inv.id, input.name, input.email, input.note ?? null, owner.id],
    );
    await audit(q, { actorId: owner.id, action: "onboarding.open", targetType: "onboarding_case", targetId: row!.id, ipHash: meta.ipHash });
    return row!.id;
  });
  return { caseId, token: inv.token, expiresAt: inv.expiresAt, emailed: inv.emailed };
}

export type PipelineRow = {
  case_id: string | null;
  user_id: string | null;
  name: string;
  email: string;
  handle: string | null;
  white_glove: boolean;
  case_status: string | null;
  user_status: string | null;
  welcome_call_at: Date | null;
  stage: StageKey;
  needs_info: boolean;
  done: Record<StageKey, boolean>;
  open_proposal: boolean;
  pending_socials: number;
};

/** Every creator in the funnel: white-glove cases (incl. not yet applied) and self-serve creators. */
export async function pipeline(owner: Viewer): Promise<PipelineRow[]> {
  assertOwner(owner);
  const rows = await asViewer(owner, (q) =>
    q.query<{
      case_id: string | null; user_id: string | null; name: string; email: string; handle: string | null; case_status: string | null;
      user_status: string | null; welcome_call_at: Date | null; welcome_done: boolean; has_profile: boolean; verified_socials: number;
      pending_socials: number; verification: string | null; published: boolean; open_proposal: boolean;
    }>(
      `with people as (
         select c.id as case_id, c.user_id, c.invitee_name as name, c.invitee_email::text as email, c.status as case_status,
                c.welcome_call_at, (c.welcome_call_done_at is not null) as welcome_done
           from app.onboarding_cases c where c.status <> 'withdrawn'
         union all
         select null, u.id, u.alias::text, u.email::text, null, null, false
           from app.users u
          where u.role = 'creator' and not exists (select 1 from app.onboarding_cases c where c.user_id = u.id)
       )
       select p.case_id, p.user_id, coalesce(cr.display_name, p.name) as name, p.email, cr.handle::text as handle, p.case_status,
              u.status::text as user_status, p.welcome_call_at, p.welcome_done,
              (cr.user_id is not null) as has_profile,
              (select count(*)::int from app.social_connections s where s.user_id = p.user_id and s.status = 'verified') as verified_socials,
              (select count(*)::int from app.social_connections s where s.user_id = p.user_id and s.status = 'unverified') as pending_socials,
              v.status::text as verification, (cr.published_at is not null) as published,
              exists (select 1 from app.profile_proposals pp where pp.user_id = p.user_id and pp.status = 'proposed') as open_proposal
         from people p
         left join app.users u on u.id = p.user_id
         left join app.creators cr on cr.user_id = p.user_id
         left join app.creator_verifications v on v.user_id = p.user_id
        order by (p.case_id is not null) desc, p.name`,
    ),
  );
  return rows.map((r) => {
    const s = stagesFor({
      hasUser: !!r.user_id, active: r.user_status === "active", welcomeDone: r.welcome_done, hasProfile: r.has_profile,
      verifiedSocials: r.verified_socials, verification: r.verification, published: r.published,
    });
    return {
      case_id: r.case_id, user_id: r.user_id, name: r.name, email: r.email, handle: r.handle, white_glove: !!r.case_id,
      case_status: r.case_status, user_status: r.user_status, welcome_call_at: r.welcome_call_at, stage: s.current,
      needs_info: s.needsInfo, done: s.done, open_proposal: r.open_proposal, pending_socials: r.pending_socials,
    };
  });
}

export type CaseDetail = {
  case: { id: string; name: string; email: string; status: string; notes: string | null; welcome_call_at: Date | null; welcome_call_done_at: Date | null } | null;
  user: { id: string; alias: string; email: string; status: string } | null;
  profile: (ProfileInput & { published: boolean }) | null;
  proposals: ProposalRow[];
  socials: SocialRow[];
  verification: string | null;
  stages: ReturnType<typeof stagesFor>;
};

/** Owner view of one creator — by case id or (for self-serve creators) by user id. */
export async function caseDetail(owner: Viewer, ref: { caseId?: string; userId?: string }): Promise<CaseDetail | null> {
  assertOwner(owner);
  return asViewer(owner, async (q) => {
    const c = ref.caseId
      ? await q.one<{ id: string; user_id: string | null; invitee_name: string; invitee_email: string; status: string; concierge_notes: string | null; welcome_call_at: Date | null; welcome_call_done_at: Date | null }>(
          `select id, user_id, invitee_name, invitee_email::text as invitee_email, status, concierge_notes, welcome_call_at, welcome_call_done_at from app.onboarding_cases where id = $1`,
          [ref.caseId],
        )
      : ref.userId
        ? await q.one<{ id: string; user_id: string | null; invitee_name: string; invitee_email: string; status: string; concierge_notes: string | null; welcome_call_at: Date | null; welcome_call_done_at: Date | null }>(
            `select id, user_id, invitee_name, invitee_email::text as invitee_email, status, concierge_notes, welcome_call_at, welcome_call_done_at from app.onboarding_cases where user_id = $1`,
            [ref.userId],
          )
        : undefined;
    const userId = c?.user_id ?? ref.userId ?? null;
    if (!c && !userId) return null;
    const u = userId
      ? await q.one<{ id: string; alias: string; email: string; status: string; role: string }>(`select id, alias::text as alias, email::text as email, status::text as status, role::text as role from app.users where id = $1`, [userId])
      : undefined;
    if (userId && (!u || u.role !== "creator")) return null;
    const cr = userId
      ? await q.one<{ handle: string; display_name: string; discipline: string; category: string; city: string | null; tagline: string | null; bio: string | null; visibility: ProfileInput["visibility"]; published_at: Date | null }>(
          `select handle::text as handle, display_name, discipline, category, city, tagline, bio, visibility, published_at from app.creators where user_id = $1`,
          [userId],
        )
      : undefined;
    const v = userId ? await q.one<{ status: string }>(`select status::text as status from app.creator_verifications where user_id = $1`, [userId]) : undefined;
    const proposals = userId ? await listProposalsQ(q, userId) : [];
    const socials = userId ? await listSocialsQ(q, userId) : [];
    return {
      case: c ? { id: c.id, name: c.invitee_name, email: c.invitee_email, status: c.status, notes: c.concierge_notes, welcome_call_at: c.welcome_call_at, welcome_call_done_at: c.welcome_call_done_at } : null,
      user: u ? { id: u.id, alias: u.alias, email: u.email, status: u.status } : null,
      profile: cr ? toProfile(cr) : null,
      proposals,
      socials,
      verification: v?.status ?? null,
      stages: stagesFor({
        hasUser: !!u, active: u?.status === "active", welcomeDone: !!c?.welcome_call_done_at, hasProfile: !!cr,
        verifiedSocials: socials.filter((s) => s.status === "verified").length, verification: v?.status ?? null, published: !!cr?.published_at,
      }),
    };
  });
}

export async function updateCase(
  owner: Viewer,
  caseId: string,
  patch: { notes?: string; welcomeCallAt?: Date | null; welcomeCallDone?: boolean; status?: "active" | "completed" | "withdrawn" },
) {
  assertOwner(owner);
  await asViewer(owner, async (q) => {
    const r = await q.one(
      `update app.onboarding_cases set
         concierge_notes = case when $2::boolean then $3 else concierge_notes end,
         welcome_call_at = case when $4::boolean then $5::timestamptz else welcome_call_at end,
         welcome_call_done_at = case when $6::boolean then now() when $7::boolean then null else welcome_call_done_at end,
         status = coalesce($8, status), updated_at = now()
       where id = $1 returning id`,
      [caseId, patch.notes !== undefined, patch.notes ?? null, patch.welcomeCallAt !== undefined, patch.welcomeCallAt ?? null, patch.welcomeCallDone === true, patch.welcomeCallDone === false, patch.status ?? null],
    );
    if (!r) throw new AppError("not_found", "Case not found.");
    await audit(q, { actorId: owner.id, action: "onboarding.update", targetType: "onboarding_case", targetId: caseId, metadata: { fields: Object.keys(patch) } });
  });
}

// =====================================================================
// Profile proposals — the house prepares, the creator decides
// =====================================================================
export type ProposalFields = Partial<ProfileInput> & { links?: SocialLink[] };
export type ProposalRow = { id: string; source: "house" | "assistant" | "creator" | "import"; fields: ProposalFields; message: string | null; status: string; ai_assisted: boolean; created_at: Date; decided_at: Date | null };

async function listProposalsQ(q: { query: <R>(t: string, p?: unknown[]) => Promise<R[]> }, userId: string) {
  return q.query<ProposalRow>(
    `select id, source, fields, message, status, ai_assisted, created_at, decided_at from app.profile_proposals where user_id = $1 order by created_at desc limit 20`,
    [userId],
  );
}

const PROPOSAL_KEYS: (keyof ProfileInput)[] = ["handle", "displayName", "discipline", "category", "city", "tagline", "bio", "visibility"];
function cleanFields(f: ProposalFields): ProposalFields {
  const out: ProposalFields = {};
  for (const k of PROPOSAL_KEYS) if (f[k] !== undefined && f[k] !== "") (out as Record<string, unknown>)[k] = f[k];
  const verdict = checkText(out.displayName, out.discipline, out.tagline, out.bio, out.city);
  if (!verdict.ok) throw new AppError("validation", "That copy can't be used on this platform. Remove any reference to minors, youth or non-consent.");
  return out;
}

/** Owner proposes profile copy for a creator. Supersedes any open proposal. Never writes the profile itself. */
export async function proposeProfile(owner: Viewer, userId: string, fields: ProposalFields, opts: { message?: string; aiAssisted?: boolean } = {}) {
  assertOwner(owner);
  const clean = cleanFields(fields);
  if (!Object.keys(clean).length) throw new AppError("validation", "Add at least one field to propose.");
  return asViewer(owner, async (q) => {
    const u = await q.one<{ role: string }>(`select role::text as role from app.users where id = $1`, [userId]);
    if (u?.role !== "creator") throw new AppError("not_found", "Creator not found.");
    await q.query(`update app.profile_proposals set status = 'superseded', decided_at = now() where user_id = $1 and status = 'proposed'`, [userId]);
    const row = await q.one<{ id: string }>(
      `insert into app.profile_proposals (user_id, author_id, source, fields, message, ai_assisted) values ($1, $2, $3, $4, $5, $6) returning id`,
      [userId, owner.id, opts.aiAssisted ? "assistant" : "house", JSON.stringify(clean), opts.message ?? null, !!opts.aiAssisted],
    );
    await audit(q, { actorId: owner.id, action: "proposal.create", targetType: "creator", targetId: userId, metadata: { fields: Object.keys(clean), ai: !!opts.aiAssisted } });
    return row!.id;
  });
}

export async function myProposals(creator: Viewer) {
  assertCreator(creator);
  return asViewer(creator, (q) => listProposalsQ(q, creator.id));
}

/**
 * The creator accepts or declines. Accepting merges the proposal into their
 * current profile and saves it AS THE CREATOR (their own consent and RLS).
 * Imported links become UNVERIFIED social connections (proof code still needed).
 */
export async function decideProposal(creator: Viewer, proposalId: string, accept: boolean, overrides: ProposalFields = {}) {
  assertCreator(creator);
  const p = await asViewer(creator, (q) =>
    q.one<{ fields: ProposalFields; status: string; source: ProposalRow["source"] }>(
      `select fields, status, source from app.profile_proposals where id = $1 and user_id = $2`,
      [proposalId, creator.id],
    ),
  );
  if (!p || p.status !== "proposed") throw new AppError("not_found", "This proposal is no longer open.");
  const { links = [], ...profileFields } = p.fields;
  if (accept && Object.keys(profileFields).length) {
    const current = await asViewer(creator, (q) =>
      q.one<{ handle: string; display_name: string; discipline: string; category: string; city: string | null; tagline: string | null; bio: string | null; visibility: ProfileInput["visibility"] }>(
        `select handle::text as handle, display_name, discipline, category, city, tagline, bio, visibility from app.creators where user_id = $1`,
        [creator.id],
      ),
    );
    const merged = { ...(current ? toProfile({ ...current, published_at: null }) : {}), ...profileFields, ...cleanFields(overrides) } as Partial<ProfileInput>;
    const missing = (["handle", "displayName", "discipline", "category"] as const).filter((k) => !merged[k]);
    if (missing.length) {
      throw new AppError("validation", current ? `Complete these before accepting: ${missing.join(", ")}.` : "Save your profile basics (handle, discipline, category) first, then accept.");
    }
    await saveProfile(creator, { visibility: "listed", ...merged } as ProfileInput);
  }
  await asViewer(creator, async (q) => {
    await q.query(`update app.profile_proposals set status = $2, decided_at = now() where id = $1`, [proposalId, accept ? "accepted" : "declined"]);
    let added = 0;
    if (accept) {
      for (const raw of links.slice(0, 8)) {
        // Re-validate: stored JSON is never trusted as-is.
        let l: SocialLink;
        try {
          l = normalizeSocial(raw);
        } catch {
          continue;
        }
        const r = await q.one<{ id: string }>(
          `insert into app.social_connections (user_id, platform, handle, url, proof_code) values ($1, $2, $3, $4, $5)
           on conflict (user_id, platform, handle) do nothing returning id`,
          [creator.id, l.platform, l.handle, l.url, newProofCode()],
        );
        if (r) {
          added++;
          await audit(q, { actorId: creator.id, action: "social.add", targetType: "social", targetId: r.id, metadata: { platform: l.platform, via: "import" } });
        }
      }
    }
    await audit(q, { actorId: creator.id, action: accept ? "proposal.accept" : "proposal.decline", targetType: "proposal", targetId: proposalId, metadata: p.source === "import" ? { source: "import", links: added } : undefined });
  });
}

// =====================================================================
// Profile imports — pasted text or a small export file, parsed locally.
// The result is ALWAYS a proposal: nothing reaches the profile until the
// creator accepts it. The raw input is never stored or logged.
// =====================================================================
export type ImportResult = { proposalId: string; fields: string[]; links: number; warnings: string[] };

export async function importProfile(viewer: Viewer, targetUserId: string, text: string): Promise<ImportResult> {
  const isOwner = can(viewer, "creators.verify");
  if (!isOwner) {
    assertCreator(viewer);
    if (targetUserId !== viewer.id) throw new AppError("forbidden", "Not allowed.");
  }
  const parsed = parseImport(text);
  const hash = importHash(parsed);
  const fields: ProposalFields = { ...parsed.fields, ...(parsed.links.length ? { links: parsed.links } : {}) };
  return asViewer(viewer, async (q) => {
    const u = await q.one<{ role: string }>(`select role::text as role from app.users where id = $1`, [targetUserId]);
    if (u?.role !== "creator") throw new AppError("not_found", "Creator not found.");
    const dup = await q.one(`select 1 from app.profile_proposals where user_id = $1 and import_hash = $2 and status <> 'superseded'`, [targetUserId, hash]);
    if (dup) throw new AppError("conflict", "This matches an import that was already filed. Nothing new was added.", "text");
    const open = await q.one<{ source: string }>(`select source from app.profile_proposals where user_id = $1 and status = 'proposed'`, [targetUserId]);
    if (open) {
      if (!isOwner) throw new AppError("conflict", "You have a proposal waiting. Accept or decline it first.", "text");
      await q.query(`update app.profile_proposals set status = 'superseded', decided_at = now() where user_id = $1 and status = 'proposed'`, [targetUserId]);
    }
    let row: { id: string } | undefined;
    try {
      row = await q.one<{ id: string }>(
        `insert into app.profile_proposals (user_id, author_id, source, fields, message, import_hash) values ($1, $2, 'import', $3, $4, $5) returning id`,
        [targetUserId, viewer.id, JSON.stringify(fields), isOwner ? "Imported by the house from details you shared." : null, hash],
      );
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw new AppError("conflict", "This matches an import that was already filed. Nothing new was added.", "text");
      throw e;
    }
    await audit(q, {
      actorId: viewer.id,
      action: "proposal.import",
      targetType: "creator",
      targetId: targetUserId,
      metadata: { fields: Object.keys(parsed.fields), links: parsed.links.length, by: isOwner ? "owner" : "creator" },
    });
    return { proposalId: row!.id, fields: Object.keys(parsed.fields), links: parsed.links.length, warnings: parsed.warnings };
  });
}

function toProfile(c: { handle: string; display_name: string; discipline: string; category: string; city: string | null; tagline: string | null; bio: string | null; visibility: ProfileInput["visibility"]; published_at: Date | null }) {
  return {
    handle: c.handle, displayName: c.display_name, discipline: c.discipline, category: c.category, city: c.city ?? undefined,
    tagline: c.tagline ?? undefined, bio: c.bio ?? undefined, visibility: c.visibility, published: !!c.published_at,
  };
}

// =====================================================================
// Social profile connections — claims until the owner verifies
// =====================================================================
export { PLATFORMS, type Platform } from "@/server/imports/social";
export type SocialRow = { id: string; platform: Platform; handle: string; url: string; proof_code: string; status: "unverified" | "verified" | "failed" | "revoked"; show_on_profile: boolean; verified_at: Date | null; note: string | null };

async function listSocialsQ(q: { query: <R>(t: string, p?: unknown[]) => Promise<R[]> }, userId: string) {
  return q.query<SocialRow>(
    `select id, platform, handle, url, proof_code, status, show_on_profile, verified_at, note from app.social_connections where user_id = $1 order by created_at`,
    [userId],
  );
}

export async function mySocials(creator: Viewer) {
  assertCreator(creator);
  return asViewer(creator, (q) => listSocialsQ(q, creator.id));
}

/**
 * Add a social profile. A proof code is generated; the creator places it in
 * that profile's bio so the house can confirm ownership (no paid API needed).
 */
export async function addSocial(creator: Viewer, input: { platform: Platform; handle: string; url?: string }) {
  assertCreator(creator);
  const { handle, url } = normalizeSocial(input);
  const proof = newProofCode();
  return asViewer(creator, async (q) => {
    try {
      const row = await q.one<{ id: string }>(
        `insert into app.social_connections (user_id, platform, handle, url, proof_code) values ($1, $2, $3, $4, $5) returning id`,
        [creator.id, input.platform, handle, url, proof],
      );
      await audit(q, { actorId: creator.id, action: "social.add", targetType: "social", targetId: row!.id, metadata: { platform: input.platform } });
      return { id: row!.id, proofCode: proof };
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw new AppError("conflict", "You've already added that profile.", "handle");
      throw e;
    }
  });
}

export async function removeSocial(viewer: Viewer, id: string) {
  await asViewer(viewer, async (q) => {
    const r = await q.one(`delete from app.social_connections where id = $1 returning 1`, [id]);
    if (!r) throw new AppError("not_found", "Not found.");
    await audit(q, { actorId: viewer.id, action: "social.remove", targetType: "social", targetId: id });
  });
}

export async function setSocialVisibility(creator: Viewer, id: string, show: boolean) {
  assertCreator(creator);
  await asViewer(creator, async (q) => {
    const r = await q.one(`update app.social_connections set show_on_profile = $2 where id = $1 and user_id = $3 returning 1`, [id, show, creator.id]);
    if (!r) throw new AppError("not_found", "Not found.");
  });
}

/** Owner confirms (or rejects) ownership after checking the proof code on the public profile. */
export async function reviewSocial(owner: Viewer, id: string, verdict: "verified" | "failed" | "revoked", note?: string) {
  assertOwner(owner);
  await asViewer(owner, async (q) => {
    const r = await q.one(
      `update app.social_connections set status = $2, verified_at = case when $2 = 'verified' then now() end,
              verified_by = $3, note = coalesce($4, note), method = 'manual' where id = $1 returning 1`,
      [id, verdict, owner.id, note ?? null],
    );
    if (!r) throw new AppError("not_found", "Not found.");
    await audit(q, { actorId: owner.id, action: `social.${verdict === "verified" ? "verify" : verdict === "failed" ? "fail" : "revoke"}`, targetType: "social", targetId: id });
  });
}

/** Verified socials a member may see on a profile (RLS enforces visibility + verification + opt-in). */
export async function publicSocials(viewer: Viewer, creatorId: string) {
  return asViewer(viewer, (q) =>
    q.query<{ platform: Platform; handle: string; url: string }>(
      `select platform, handle, url from app.social_connections where user_id = $1 and status = 'verified' and show_on_profile order by platform`,
      [creatorId],
    ),
  );
}

// =====================================================================
// AI-assisted profile preparation
// =====================================================================
export type AssistResult = AssistOutput & { provider: string; model: string | null; external: boolean };

export function assistantInfo() {
  const a = profileAssistant();
  return a ? { enabled: true, id: a.id, external: a.external, model: a.model } : { enabled: false as const, id: null, external: false, model: null };
}

/**
 * Draft tagline + bio suggestions. Inputs and outputs pass the safety filter;
 * contact details are stripped. Usage is metered WITHOUT storing content.
 * When the provider is external, `consent` must be true.
 */
export async function assistDraft(viewer: Viewer, targetUserId: string, input: AssistInput, consent: boolean): Promise<AssistResult> {
  const isOwner = can(viewer, "creators.verify");
  if (!isOwner && !(viewer.role === "creator" && viewer.status === "active" && viewer.id === targetUserId)) throw new AppError("forbidden", "Not allowed.");
  const a = profileAssistant();
  if (!a) throw new AppError("forbidden", "The profile assistant is turned off.");
  if (a.external && !consent) throw new AppError("validation", "Confirm you're happy to send these notes to the assistant.", "consent");

  const clean: AssistInput = {
    displayName: input.displayName.trim().slice(0, 60),
    discipline: input.discipline.trim().slice(0, 60),
    city: input.city?.trim().slice(0, 60) || undefined,
    keywords: input.keywords.map((k) => k.trim().slice(0, 40)).filter(Boolean).slice(0, 8),
    offering: input.offering?.trim().slice(0, 300) || undefined,
    tone: input.tone,
  };
  const inputChars = JSON.stringify(clean).length;
  const meter = (blocked: boolean, outputChars = 0) =>
    asViewer(viewer, (q) =>
      q.query(`insert into app.ai_assist_usage (user_id, actor_id, provider, model, input_chars, output_chars, blocked) values ($1, $2, $3, $4, $5, $6, $7)`, [
        targetUserId, viewer.id, a.id, a.model, inputChars, outputChars, blocked,
      ]),
    );

  if (!checkText(clean.displayName, clean.discipline, clean.city, clean.offering, ...clean.keywords).ok) {
    await meter(true);
    throw new AppError("validation", "Those notes can't be used here. Remove any reference to minors, youth or non-consent.");
  }
  let out: AssistOutput;
  try {
    out = await a.draft(clean);
  } catch {
    throw new AppError("conflict", "The assistant couldn't draft this right now. Try again, or write it yourself.");
  }
  const taglines = out.taglines.map((t) => sanitizeCopy(t, 160)).filter(Boolean).slice(0, 3);
  const bio = sanitizeCopy(out.bio, 2000);
  if (!checkText(bio, ...taglines).ok || !bio) {
    await meter(true, bio.length);
    throw new AppError("conflict", "The draft didn't meet the house rules, so it was discarded. Try different notes.");
  }
  await meter(false, bio.length + taglines.join("").length);
  return { taglines, bio, provider: a.id, model: a.model, external: a.external };
}

// =====================================================================
// Creator-facing onboarding summary
// =====================================================================
export async function myOnboarding(creator: Viewer) {
  assertCreator(creator);
  return asViewer(creator, async (q) => {
    const c = await q.one<{ id: string; welcome_call_at: Date | null; welcome_call_done_at: Date | null }>(`select * from app.my_onboarding_case()`);
    const cr = await q.one<{ published: boolean }>(`select published_at is not null as published from app.creators where user_id = $1`, [creator.id]);
    const v = await q.one<{ status: string }>(`select status::text as status from app.creator_verifications where user_id = $1`, [creator.id]);
    const socials = await listSocialsQ(q, creator.id);
    return {
      whiteGlove: !!c,
      welcomeCallAt: c?.welcome_call_at ?? null,
      stages: stagesFor({
        hasUser: true, active: true, welcomeDone: !!c?.welcome_call_done_at, hasProfile: !!cr,
        verifiedSocials: socials.filter((s) => s.status === "verified").length, verification: v?.status ?? null, published: !!cr?.published,
      }),
    };
  });
}
