import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { OwnerShell } from "@/components/owner/OwnerShell";
import { requireViewer } from "@/server/auth/request";
import { isAppError } from "@/server/errors";
import { getMyPayoutDestination, resolveAuthenticatedOwner } from "@/server/services/ownerFinance";

export const dynamic = "force-dynamic";

export default async function OwnerLayout({ children }: { children: ReactNode }) {
  const viewer = await requireViewer("owner.dashboard.view");
  let owner;
  let myDest;
  try {
    owner = await resolveAuthenticatedOwner(viewer);
    myDest = await getMyPayoutDestination(viewer);
  } catch (e) {
    if (isAppError(e)) notFound();
    throw e;
  }

  return (
    <OwnerShell viewer={viewer} owner={owner} accountCode={myDest.accountCode}>
      {children}
    </OwnerShell>
  );
}

