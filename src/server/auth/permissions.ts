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
  ],
  creator: ["club.discover", "club.follow", "referrals.request"],
  member: ["club.discover", "club.follow", "referrals.request"],
};

export type Viewer = { id: string; role: Role; status: Status; alias: string; email: string };

/** Every permission additionally requires an active account. */
export function can(viewer: Pick<Viewer, "role" | "status"> | null | undefined, permission: Permission): boolean {
  if (!viewer || viewer.status !== "active") return false;
  return matrix[viewer.role].includes(permission);
}
