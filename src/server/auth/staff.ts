import { AppError } from "@/server/errors";
import { can, type Viewer } from "./permissions";

/**
 * Restricted moderator role (Phase 11, INACTIVE until approved).
 *
 * A moderator is an active MEMBER with a staff grant naming a strict subset of
 * these capabilities. A capability is effective only when the server flag
 * (FEATURE_MODERATORS), the owner's switch (safety_settings.moderators_enabled),
 * an unrevoked grant and an AAL2 session all hold, and RLS checks the same
 * through app.has_capability().
 *
 * Principles kept for staff:
 *  - no browsing private conversations;
 *  - every action is written to the append-only audit log, including queue views;
 *  - staff never act on their own reports, reports about themselves, or
 *    appeals of decisions they made.
 */
export const STAFF_CAPABILITIES = [
  "reports.view", // the report queue
  "reports.decide", // in review / dismiss / resolve / escalate
  "content.hide", // hide or restore a reported post
  "review.decide", // pre-publication review
  "takedowns.decide", // takedown notices (never the requester's contact details)
  "appeals.decide", // creator appeals (never of their own decisions; never participant or consent cases)
] as const;
export type StaffCapability = (typeof STAFF_CAPABILITIES)[number];

/** Owner-only, never delegable. */
export const OWNER_ONLY = [
  "invitations.manage", "applications.review", "accounts.suspend", "exceptional_access", "payments", "verification.decide",
  "safeguarding", "identity.reveal", "takedown.contact", "settings", "access.rules", "staff.manage",
] as const;

export const isStaffCapability = (c: string): c is StaffCapability => (STAFF_CAPABILITIES as readonly string[]).includes(c);

/** Does this viewer hold an effective staff capability? */
export function canStaff(v: Viewer, cap: StaffCapability): boolean {
  return v.role === "member" && v.status === "active" && v.aal === 2 && !!v.staff?.includes(cap);
}

export const isStaff = (v: Viewer) => v.role === "member" && v.aal === 2 && (v.staff?.length ?? 0) > 0;

/** The owner (moderation.review) or a moderator holding `cap`. */
export function assertOwnerOrStaff(v: Viewer, ...caps: StaffCapability[]) {
  if (can(v, "moderation.review")) return;
  if (caps.some((c) => canStaff(v, c))) return;
  throw new AppError("forbidden", "Not allowed.");
}
