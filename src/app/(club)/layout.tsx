import type { Metadata } from "next";
import { ClubShell } from "@/components/layout/ClubShell";
import { unreadMessagesByWorkspace } from "@/server/services/messaging";
import { unreadCount } from "@/server/services/notifications";
import { redirect } from "next/navigation";
import {
  getLocaleCookie,
  getWorkspaceCookie,
  requireViewer,
} from "@/server/auth/request";
import { gateRequest } from "@/server/compliance/access";
import { resolveActiveWorkspace } from "@/server/services/workspace";

// Members-only area: never indexed, always rendered per request.
export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ClubLayout({ children }: { children: React.ReactNode }) {
  // Layout gate is UX; each page and action re-checks with its own permission.
  const viewer = await requireViewer("club.discover");
  // Regional rules and age assurance. Inactive until approved: with the flags
  // off this returns "allowed" without any lookup.
  const gate = await gateRequest(viewer);
  if (!gate.allowed) redirect(gate.reason === "region_blocked" ? "/unavailable" : "/verify-age");
  const [unread, unreadByWorkspace, cookieWorkspace, locale] = await Promise.all([
    unreadCount(viewer),
    unreadMessagesByWorkspace(viewer),
    getWorkspaceCookie(),
    getLocaleCookie(),
  ]);
  const workspace = resolveActiveWorkspace(viewer, undefined, cookieWorkspace);
  return (
    <ClubShell
      viewer={viewer}
      unread={unread}
      unreadMessages={unreadByWorkspace.total}
      unreadFanMessages={unreadByWorkspace.fan}
      unreadCreatorMessages={unreadByWorkspace.creator}
      workspace={workspace}
      locale={locale}
    >
      {children}
    </ClubShell>
  );
}
