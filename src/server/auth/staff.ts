/**
 * Moderator capability design (NOT ACTIVE). Today the single owner holds all
 * moderation powers (A1). The brief asks for "authorized moderators"; adding
 * a staff role needs the owner's decision on who, how they are vetted, and
 * which of these capabilities each gets. This file fixes the vocabulary so a
 * future role can be granted a strict subset — never owner powers.
 *
 * Principles already enforced for the owner and to be kept for staff:
 *  - no browsing private conversations (reported context only, audited);
 *  - exceptional access needs a written justification, logged first;
 *  - every action is written to the append-only audit log;
 *  - staff can never act on their own reports, appeals or account.
 */
export const STAFF_CAPABILITIES = [
  "reports.view", // queue and report metadata
  "reports.context", // reported message + minimal context (audited)
  "reports.decide", // dismiss / action / escalate
  "content.hide", // hide a post or withhold a message pending review
  "accounts.pause_messaging",
  "appeals.decide",
] as const;
export type StaffCapability = (typeof STAFF_CAPABILITIES)[number];

/** Owner-only, never delegable: invitations, approvals, suspensions, exceptional access, payments, settings. */
export const OWNER_ONLY = ["invitations.manage", "applications.review", "accounts.suspend", "exceptional_access", "payments", "verification.decide"] as const;

export const MODERATOR_ROLE_ENABLED = false as const;
