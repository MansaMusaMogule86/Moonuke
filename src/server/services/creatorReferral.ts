import "server-only";
import { asViewer, system } from "@/server/db";
import { hashPassword } from "@/server/auth/crypto";
import type { Viewer } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { featureEnabled } from "@/server/flags";
import { checkText } from "@/server/ai/safety";
import type { PortraitStudy } from "@/components/ui/Portrait";
import { formatCreatorPublicName } from "@/lib/creatorName";
import { audit } from "./audit";
import { createSession } from "./sessions";

// =====================================================================
// Creator referral links (Phase 12). A creator's stable public link is
// /join/<handle>. When the owner enables FEATURE_CREATOR_REFERRALS it can create
// a FAN account — never a creator — attributed to that creator.
//
// Everything is validated SERVER-SIDE: the handle is looked up in the database
// and must still be an eligible (listed, published, active) creator. A modified
// query parameter or a client-supplied id can never grant access, and the check
// is repeated inside the creating transaction.
// =====================================================================

const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;
/** A referral link resolves only for a creator who is listed, published and active. */
const ELIGIBLE = `c.visibility = 'listed' and c.published_at is not null and u.role = 'creator' and u.status = 'active'`;

export type ReferralCreator = {
  id: string;
  handle: string;
  displayName: string;
  discipline: string;
  city: string | null;
  tagline: string | null;
  bio: string | null;
  cover: PortraitStudy;
  tiers: number;
};

/** Public, pre-auth lookup. Anything ineligible resolves to null (indistinguishable). */
export async function referralCreator(handle: string): Promise<ReferralCreator | null> {
  if (!HANDLE_RE.test(handle)) return null;
  return system(async (q) => {
    const c = await q.one<{
      id: string; handle: string; display_name: string; discipline: string; city: string | null;
      tagline: string | null; bio: string | null; cover: PortraitStudy; tiers: number;
    }>(
      `select c.user_id as id, c.handle::text as handle, c.display_name, c.discipline, c.city, c.tagline, c.bio, c.cover,
              (select count(*)::int from app.tiers t where t.creator_id = c.user_id and t.active) as tiers
         from app.creators c join app.users u on u.id = c.user_id
        where c.handle = $1 and ${ELIGIBLE}`,
      [handle],
    );
    if (!c) return null;
    return {
      id: c.id, handle: c.handle, displayName: formatCreatorPublicName(c.display_name), discipline: c.discipline, city: c.city,
      tagline: c.tagline, bio: c.bio, cover: c.cover, tiers: c.tiers,
    };
  });
}

export type FanSignupInput = { alias: string; email: string; password: string };

/**
 * Create an active FAN account from a creator referral. Returns the new session
 * token and the handle to land on. Refused unless FEATURE_CREATOR_REFERRALS is on
 * and the creator is still eligible.
 */
export async function registerFanViaReferral(
  handle: string,
  input: FanSignupInput,
  meta: { ipHash: string | null; userAgent: string | null },
): Promise<{ sessionToken: string; handle: string }> {
  if (!featureEnabled("creator_referrals")) {
    throw new AppError("forbidden", "Joining through a creator link isn't open yet.");
  }
  if (!HANDLE_RE.test(handle)) throw new AppError("not_found", "This invite link is no longer available.");
  const verdict = checkText(input.alias);
  if (!verdict.ok) throw new AppError("validation", "Choose a different name.", "alias");
  const passwordHash = await hashPassword(input.password);
  const email = input.email.trim().toLowerCase();
  const alias = input.alias.trim();

  const done = await system(async (q) => {
    // Re-check eligibility inside the transaction: the link alone is never enough.
    const c = await q.one<{ id: string }>(
      `select c.user_id as id from app.creators c join app.users u on u.id = c.user_id where c.handle = $1 and ${ELIGIBLE}`,
      [handle],
    );
    if (!c) throw new AppError("not_found", "This invite link is no longer available.");
    const u = await q
      .one<{ id: string }>(
        `insert into app.users (email, password_hash, role, status, alias, adult_attested_at, approved_at)
         values ($1, $2, 'member', 'active', $3, now(), now()) returning id`,
        [email, passwordHash, alias],
      )
      .catch((e: { code?: string }) => {
        if (e?.code === "23505") throw new AppError("conflict", "That email or name is already taken.", "email");
        throw e;
      });
    await q.query(`insert into app.creator_referrals (creator_id, user_id) values ($1, $2)`, [c.id, u!.id]);
    const sessionToken = await createSession(u!.id, meta.userAgent, q);
    await audit(q, { actorId: u!.id, action: "account.referral_signup", targetType: "creator", targetId: c.id, ipHash: meta.ipHash });
    return { sessionToken };
  });

  return { sessionToken: done.sessionToken, handle };
}

/** The creator's own referral count (aggregate only). */
export async function myReferralCount(viewer: Viewer): Promise<number> {
  if (viewer.role !== "creator" || viewer.status !== "active") throw new AppError("forbidden", "Not allowed.");
  return asViewer(viewer, async (q) => (await q.one<{ n: number }>(`select app.my_referral_count() as n`))?.n ?? 0);
}
