import "server-only";
import { asViewer, system } from "@/server/db";
import { sha256 } from "@/server/auth/crypto";
import { can, type Viewer } from "@/server/auth/permissions";
import { appUrl } from "@/server/env";
import { AppError } from "@/server/errors";
import { enqueue } from "@/server/email/outbox";
import { emails } from "@/server/email/templates";
import { REQUIRED_CHECKS, type VerificationCheck } from "@/server/verification";
import type { PortraitStudy } from "@/components/ui/Portrait";
import { audit } from "./audit";

export type VerificationStatus = "not_started" | "submitted" | "in_review" | "needs_more_info" | "verified" | "rejected";

export type ProfileInput = {
  handle: string;
  displayName: string;
  discipline: string;
  category: string;
  city?: string;
  tagline?: string;
  bio?: string;
  visibility: "listed" | "discreet" | "private";
};

export type Onboarding = {
  profile: (ProfileInput & { published: boolean }) | null;
  verification: { status: VerificationStatus; reviewNote: string | null; submittedAt: Date | null };
};

function assertCreator(viewer: Viewer) {
  if (viewer.role !== "creator" || viewer.status !== "active") throw new AppError("forbidden", "Not allowed.");
}

/** A deterministic placeholder cover so new profiles look intentional before real photography. */
function coverFor(userId: string): PortraitStudy {
  const b = sha256(userId);
  const hair = (["long", "bun", "crop", "wrap"] as const)[b[0] % 4];
  const adorn = (["hoops", "crown", "collar", "none"] as const)[b[1] % 4];
  return { hair, adorn, light: b[2] % 2 ? "left" : "right", tilt: (b[3] % 9) - 4, glow: 0.55 + (b[4] % 40) / 100 };
}

export async function getOnboarding(viewer: Viewer): Promise<Onboarding> {
  assertCreator(viewer);
  return asViewer(viewer, async (q) => {
    const c = await q.one<{ handle: string; display_name: string; discipline: string; category: string; city: string | null; tagline: string | null; bio: string | null; visibility: ProfileInput["visibility"]; published_at: Date | null }>(
      `select handle::text as handle, display_name, discipline, category, city, tagline, bio, visibility, published_at from app.creators where user_id = $1`,
      [viewer.id],
    );
    const v = await q.one<{ status: VerificationStatus; review_note: string | null; submitted_at: Date | null }>(
      `select status, review_note, submitted_at from app.creator_verifications where user_id = $1`,
      [viewer.id],
    );
    return {
      profile: c
        ? { handle: c.handle, displayName: c.display_name, discipline: c.discipline, category: c.category, city: c.city ?? undefined, tagline: c.tagline ?? undefined, bio: c.bio ?? undefined, visibility: c.visibility, published: !!c.published_at }
        : null,
      verification: { status: v?.status ?? "not_started", reviewNote: v?.review_note ?? null, submittedAt: v?.submitted_at ?? null },
    };
  });
}

/** Create or update the creator's own profile draft. Publication is owner-only. */
export async function saveProfile(viewer: Viewer, input: ProfileInput) {
  assertCreator(viewer);
  await asViewer(viewer, async (q) => {
    try {
      await q.query(
        `insert into app.creators (user_id, handle, display_name, discipline, category, city, tagline, bio, visibility, cover)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         on conflict (user_id) do update set handle = excluded.handle, display_name = excluded.display_name, discipline = excluded.discipline,
           category = excluded.category, city = excluded.city, tagline = excluded.tagline, bio = excluded.bio, visibility = excluded.visibility`,
        [viewer.id, input.handle, input.displayName, input.discipline, input.category, input.city ?? null, input.tagline ?? null, input.bio ?? null, input.visibility, JSON.stringify(coverFor(viewer.id))],
      );
    } catch (e) {
      const code = (e as { code?: string; constraint?: string }).code;
      if (code === "23505") throw new AppError("conflict", "That handle is taken.", "handle");
      if (code === "23503") throw new AppError("validation", "Choose a category.", "category");
      throw e;
    }
    await audit(q, { actorId: viewer.id, action: "creator.profile_save", targetType: "creator", targetId: viewer.id });
  });
}

/** Submit attestations for review. The owner is notified; nothing becomes visible yet. */
export async function submitVerification(viewer: Viewer) {
  assertCreator(viewer);
  await asViewer(viewer, async (q) => {
    const c = await q.one(`select 1 from app.creators where user_id = $1`, [viewer.id]);
    if (!c) throw new AppError("validation", "Save your profile first.");
    const existing = await q.one<{ status: VerificationStatus }>(`select status from app.creator_verifications where user_id = $1`, [viewer.id]);
    if (existing && !["not_started", "needs_more_info", "rejected"].includes(existing.status)) {
      throw new AppError("conflict", existing.status === "verified" ? "You're already verified." : "Your verification is already with the house.");
    }
    const sets = `status = 'submitted', submitted_at = now(), age_attested_at = now(), identity_attested_at = now(),
                  consent_records_attested_at = now(), terms_accepted_at = now(), checks = '{}'::jsonb, reviewed_by = null, updated_at = now()`;
    if (existing) await q.query(`update app.creator_verifications set ${sets} where user_id = $1`, [viewer.id]);
    else
      await q.query(
        `insert into app.creator_verifications (user_id, status, submitted_at, age_attested_at, identity_attested_at, consent_records_attested_at, terms_accepted_at)
         values ($1, 'submitted', now(), now(), now(), now(), now())`,
        [viewer.id],
      );
    await audit(q, { actorId: viewer.id, action: "verification.submit", targetType: "creator", targetId: viewer.id });
  });
  // Let the owner know (privileged: a creator cannot mail the owner directly).
  await system(async (q) => {
    const owner = await q.one<{ id: string; email: string }>(`select id, email::text as email from app.users where role = 'owner'`);
    if (owner) {
      await enqueue(q, owner.email, emails.verificationSubmitted({ url: `${appUrl()}/admin/creators` }), owner.id);
    }
  });
}

// ---------------------------------------------------------------- owner review

export type VerificationRow = {
  user_id: string;
  alias: string;
  email: string;
  handle: string | null;
  display_name: string | null;
  discipline: string | null;
  city: string | null;
  status: VerificationStatus;
  checks: Partial<Record<VerificationCheck, boolean>>;
  review_note: string | null;
  submitted_at: Date | null;
  attested: boolean;
  published: boolean;
};

export async function verificationQueue(viewer: Viewer, view: "pending" | "all" = "pending"): Promise<VerificationRow[]> {
  if (!can(viewer, "creators.verify")) throw new AppError("forbidden", "Not allowed.");
  return asViewer(viewer, (q) =>
    q.query<VerificationRow>(
      `select u.id as user_id, u.alias::text as alias, u.email::text as email, c.handle::text as handle, c.display_name, c.discipline, c.city,
              coalesce(v.status, 'not_started') as status, coalesce(v.checks, '{}') as checks, v.review_note, v.submitted_at,
              (v.age_attested_at is not null and v.identity_attested_at is not null and v.consent_records_attested_at is not null and v.terms_accepted_at is not null) as attested,
              (c.published_at is not null) as published
         from app.users u
         left join app.creators c on c.user_id = u.id
         left join app.creator_verifications v on v.user_id = u.id
        where u.role = 'creator' and u.status = 'active'
          and ($1 = 'all' or coalesce(v.status, 'not_started') in ('submitted', 'in_review', 'needs_more_info'))
        order by (coalesce(v.status, 'not_started') = 'submitted') desc, v.submitted_at nulls last, u.created_at desc
        limit 200`,
      [view],
    ),
  );
}

export type ReviewAction = "in_review" | "needs_more_info" | "reject" | "verify" | "unpublish";

/**
 * Owner decision. "verify" requires every REQUIRED_CHECKS item ticked and a
 * complete set of creator attestations; it marks the creator verified and
 * publishes the profile in the same transaction.
 */
export async function reviewVerification(
  viewer: Viewer,
  userId: string,
  action: ReviewAction,
  input: { checks?: Partial<Record<VerificationCheck, boolean>>; note?: string } = {},
): Promise<{ status: VerificationStatus; published: boolean }> {
  if (!can(viewer, "creators.verify")) throw new AppError("forbidden", "Not allowed.");
  const checks = Object.fromEntries(REQUIRED_CHECKS.map((c) => [c.key, !!input.checks?.[c.key]]));
  return asViewer(viewer, async (q) => {
    const v = await q.one<{ status: VerificationStatus; attested: boolean }>(
      `select status, (age_attested_at is not null and identity_attested_at is not null and consent_records_attested_at is not null and terms_accepted_at is not null) as attested
         from app.creator_verifications where user_id = $1 for update`,
      [userId],
    );
    if (!v) throw new AppError("not_found", "No verification on file for this creator.");
    const profile = await q.one(`select 1 from app.creators where user_id = $1`, [userId]);

    let status: VerificationStatus = v.status;
    let published = false;
    if (action === "verify") {
      if (!v.attested) throw new AppError("validation", "The creator hasn't completed every attestation.");
      if (!profile) throw new AppError("validation", "The creator has no profile to publish.");
      const missing = REQUIRED_CHECKS.filter((c) => !checks[c.key]).map((c) => c.label);
      if (missing.length) throw new AppError("validation", `Confirm before verifying: ${missing.join(", ")}.`, "checks");
      status = "verified";
      await q.query(`update app.creators set published_at = coalesce(published_at, now()) where user_id = $1`, [userId]);
      published = true;
    } else if (action === "unpublish") {
      await q.query(`update app.creators set published_at = null where user_id = $1`, [userId]);
    } else {
      status = action === "reject" ? "rejected" : action;
      if (action === "reject") await q.query(`update app.creators set published_at = null where user_id = $1`, [userId]);
    }
    await q.query(
      `update app.creator_verifications set status = $2, checks = $3, review_note = coalesce($4, review_note), reviewed_by = $5, reviewed_at = now(), updated_at = now() where user_id = $1`,
      [userId, status, JSON.stringify(checks), input.note ?? null, viewer.id],
    );
    await audit(q, { actorId: viewer.id, action: `verification.${action}`, targetType: "creator", targetId: userId, metadata: { checks } });
    if (action === "verify") {
      const u = await q.one<{ email: string; alias: string }>(`select email::text as email, alias::text as alias from app.users where id = $1`, [userId]);
      if (u) await enqueue(q, u.email, emails.creatorVerified({ alias: u.alias, url: `${appUrl()}/studio` }), userId);
    }
    if (action === "unpublish") published = false;
    return { status, published };
  });
}
