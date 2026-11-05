import type { Metadata } from "next";
import { ClubShell } from "@/components/layout/ClubShell";
import { unreadCount } from "@/server/services/notifications";
import { requireViewer } from "@/server/auth/request";

// Members-only area: never indexed, always rendered per request.
export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ClubLayout({ children }: { children: React.ReactNode }) {
  // Layout gate is UX; each page and action re-checks with its own permission.
  const viewer = await requireViewer("club.discover");
  return <ClubShell viewer={viewer} unread={await unreadCount(viewer)}>{children}</ClubShell>;
}
