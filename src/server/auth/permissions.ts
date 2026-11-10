export type Role = "owner" | "creator" | "member";
export type Status = "pending" | "active" | "suspended" | "rejected";

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
  /**
   * Effective moderator capabilities (Phase 11). Empty unless the moderator
   * role is switched on, this member holds a grant, and the session is AAL2.
   */
  staff?: readonly string[];
};

/**
 * Every permission requires an active account. The owner additionally needs
 * AAL2 (a second factor verified in this session) for ANY permission —
 * mirrored in the database by app.is_owner() checking app.aal.
 */
export function can(viewer: Pick<Viewer, "role" | "status" | "aal"> | null | undefined, permission: Permission): boolean {
  if (!viewer || viewer.status !== "active") return false;
  if (viewer.role === "owner" && viewer.aal !== 2) return false;
  return matrix[viewer.role].includes(permission);
}
