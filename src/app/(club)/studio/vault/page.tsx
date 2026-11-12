import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudioHeader } from "@/components/studio/StudioHeader";
import { Button } from "@/components/ui/Button";
import { requireViewer } from "@/server/auth/request";
import { myPosts } from "@/server/services/studio";
import { VaultWorkspace } from "./VaultWorkspace";

export const metadata: Metadata = { title: "Vault · Studio" };

export default async function StudioVaultPage() {
  const viewer = await requireViewer("club.discover");
  if (viewer.role !== "creator") notFound();

  const posts = await myPosts(viewer);
  const uploadsEnabled = process.env.FEATURE_UPLOADS === "1";

  return (
    <div className="mx-auto max-w-[1100px] px-5 pb-28 pt-6 md:px-10 md:pt-8">
      <StudioHeader
        eyebrow="Studio · Media Library"
        title="Creator Vault"
        lede="Organize your private photos, gallery sets, and video releases. Every asset remains in private storage and is served only to authorized subscribers or pay-per-view unlocks."
        actions={<Button href="/studio/posts/new">New release</Button>}
      />

      <VaultWorkspace posts={posts} uploadsEnabled={uploadsEnabled} />
    </div>
  );
}

