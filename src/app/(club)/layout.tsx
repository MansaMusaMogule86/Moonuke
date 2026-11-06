import type { Metadata } from "next";
import { ClubShell } from "@/components/layout/ClubShell";
import { unreadCount } from "@/server/services/notifications";
import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth/request";
import { gateRequest } from "@/server/compliance/access";

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
  return <ClubShell viewer={viewer} unread={await unreadCount(viewer)}>{children}</ClubShell>;
}
