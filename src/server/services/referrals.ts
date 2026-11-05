import "server-only";
import { asViewer } from "@/server/db";
import { can, type Viewer } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { audit } from "./audit";

export type ReferralInput = {
  inviteeName: string;
  inviteeEmail: string;
  role: "member" | "creator";
  relationship: string;
};

/**
 * A member or creator asks the house to invite someone. This records a
 * request only — it never creates an invitation or an account.
 */
export async function requestReferral(viewer: Viewer, input: ReferralInput, meta: { ipHash?: string | null } = {}) {
  if (!can(viewer, "referrals.request")) throw new AppError("forbidden", "Not allowed.");
  if (input.inviteeEmail.toLowerCase() === viewer.email.toLowerCase()) {
    throw new AppError("validation", "That's your own email address.", "inviteeEmail");
  }
  return asViewer(viewer.id, async (q) => {
    try {
      const row = await q.one<{ id: string }>(
        `insert into app.referral_requests (requester_id, invitee_name, invitee_email, intended_role, relationship)
         values ($1, $2, $3, $4, $5) returning id`,
        [viewer.id, input.inviteeName, input.inviteeEmail, input.role, input.relationship],
      );
      await audit(q, {
        actorId: viewer.id,
        action: "referral.request",
        targetType: "referral_request",
        targetId: row!.id,
        ipHash: meta.ipHash,
        metadata: { role: input.role },
      });
      return row!.id;
    } catch (e) {
      if ((e as { code?: string }).code === "23505") {
        throw new AppError("conflict", "You already have a pending request for this person.", "inviteeEmail");
      }
      throw e;
    }
  });
}

export type MyReferral = {
  id: string;
  invitee_name: string;
  invitee_email: string;
  intended_role: string;
  status: "pending" | "approved" | "declined";
  created_at: Date;
};

export async function myReferrals(viewer: Viewer): Promise<MyReferral[]> {
  if (!can(viewer, "referrals.request")) throw new AppError("forbidden", "Not allowed.");
  // Deliberately never selects invitation_id or anything that leads to a token.
  return asViewer(viewer.id, (q) =>
    q.query<MyReferral>(
      `select id, invitee_name, invitee_email::text as invitee_email, intended_role, status, created_at
         from app.referral_requests where requester_id = $1 order by created_at desc limit 50`,
      [viewer.id],
    ),
  );
}
