import type { Metadata } from "next";
import { ClubShell } from "@/components/layout/ClubShell";
import { requireViewer } from "@/server/auth/request";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  // The account area is reachable during mandatory owner MFA setup; nothing else is.
  const viewer = await requireViewer(undefined, { allowMfaSetup: true });
  return <ClubShell viewer={viewer}>{children}</ClubShell>;
}
