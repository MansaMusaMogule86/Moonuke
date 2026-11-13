export type Role = "owner" | "creator" | "member";
export type PlatformRoleLabel = "OWNER" | "CREATOR" | "FAN" | "MODERATOR";
export type Status = "pending" | "active" | "suspended" | "rejected";

/**
 * Verified platform owner authentication user IDs (Section 1 & Section 2).
 * Ownership percentages and payout destinations are NEVER derived from usernames,
 * emails, or frontend state — they are resolved server-side from app.platform_owners
 * and app.ownership_allocations.
 */
export const VERIFIED_OWNER_USER_IDS = {
  OWNER_001: "c570c63a-c9d8-44fc-b47b-165aed89d764",
  OWNER_002: "aa44892b-67d1-4c22-93d0-371a61e51caa",
} as const;

export function isVerifiedPlatformOwnerUserId(userId: string): boolean {
  return (
    userId === VERIFIED_OWNER_USER_IDS.OWNER_001 ||
    userId === VERIFIED_OWNER_USER_IDS.OWNER_002
  );
}

export const PERMISSIONS = [
  "club.discover",
  "club.follow",
  "referrals.request",
  "invitations.manage",
  "applications.review",
  "referrals.review",
  "accounts.suspend",
  "audit.view",
  "moderation.review",
  "creators.verify",
  "club.report",
  "security.view",
  // Two-owner governance & financial permissions (distinct from economic ownership)
  "owner.dashboard.view",
  "owner.revenue.view",
  "owner.share.view",
  "owner.distributions.view",
  "owner.distributions.calculate",
  "owner.distributions.approve",
  "owner.payout_accounts.manage",
  "owner.payouts.simulate",
  "owner.creators.view",
  "owner.analytics.view",
  "owner.reports.view",
  "owner.audit.view",
  "owner.settings.view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const matrix: Record<Role, readonly Permission[]> = {
  owner: [
    "club.discover",
    "club.follow",
    "invitations.manage",
    "applications.review",
    "referrals.review",
    "accounts.suspend",
    "audit.view",
    "moderation.review",
    "creators.verify",
    "security.view",
    "owner.dashboard.view",
    "owner.revenue.view",
    "owner.share.view",
    "owner.distributions.view",
    "owner.distributions.calculate",
    "owner.distributions.approve",
    "owner.payout_accounts.manage",
    "owner.payouts.simulate",
    "owner.creators.view",
    "owner.analytics.view",
    "owner.reports.view",
    "owner.audit.view",
    "owner.settings.view",
  ],
  creator: ["club.discover", "club.follow", "referrals.request", "club.report"],
  member: ["club.discover", "club.follow", "referrals.request", "club.report"],
};

export type MfaState = "none" | "pending" | "verified";

export type Viewer = {
  id: string;
  role: Role;
  status: Status;
  alias: string;
  email: string;
  /** Authenticator assurance level of THIS session: 2 once a second factor was verified. */
  aal: 1 | 2;
  mfa: MfaState;
  /** Public handle of the current session (never the token or its hash). */
  sessionId?: string;
  /** Whether the account's email address has been confirmed (required for creator permissions). */
  emailVerified?: boolean;
  /**
   * Effective moderator capabilities (Phase 11). Empty unless the moderator
   * role is switched on, this member holds a grant, and the session is AAL2.
   */
  staff?: readonly string[];
};

/**
 * Resolves the canonical platform role label (OWNER, CREATOR, FAN, MODERATOR).
 * - Creators never receive OWNER permissions.
 * - Fans ("member") never receive CREATOR or OWNER permissions.
 * - MODERATOR is a restricted staff capability on a FAN account at AAL2 when enabled.
 */
export function resolvePlatformRoleLabel(viewer: Pick<Viewer, "role" | "aal" | "staff"> | null | undefined): PlatformRoleLabel | null {
  if (!viewer) return null;
  if (viewer.role === "owner") return "OWNER";
  if (viewer.role === "creator") return "CREATOR";
  if (viewer.role === "member" && viewer.aal === 2 && (viewer.staff?.length ?? 0) > 0) return "MODERATOR";
  return "FAN";
}

/**
 * Every permission requires an active account. The owner additionally needs
 * AAL2 (a second factor verified in this session) for ANY permission —
 * mirrored in the database by app.is_owner() checking app.aal.
 */
export function can(viewer: Pick<Viewer, "role" | "status" | "aal" | "emailVerified"> | null | undefined, permission: Permission): boolean {
  if (!viewer || viewer.status !== "active") return false;
  if (viewer.role === "owner" && viewer.aal !== 2) return false;
  // Creators need a confirmed email address for every permission. Two-step
  // sign-in is OPTIONAL for creators — they may enable it in Account security —
  // so it is not required here. The owner above still needs AAL2.
  if (viewer.role === "creator" && viewer.emailVerified !== true) return false;
  return matrix[viewer.role].includes(permission);
}
