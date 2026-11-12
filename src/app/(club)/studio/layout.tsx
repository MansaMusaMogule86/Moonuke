import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudioShell } from "@/components/studio/StudioShell";
import { requireViewer } from "@/server/auth/request";

// Creator workspace. The guard is centralised here: a signed-in creator needs
// two-step sign-in (requireViewer redirects to MFA setup) and a verified email
// (enforced by `can()` inside requireViewer). Anyone else gets a 404, which
// never reveals that the route exists.
export const metadata: Metadata = { title: "Studio", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer("club.discover");
  if (viewer.role !== "creator") notFound();
  return <StudioShell alias={viewer.alias}>{children}</StudioShell>;
}
