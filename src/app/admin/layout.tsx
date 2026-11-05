import type { Metadata } from "next";
import { ClubShell } from "@/components/layout/ClubShell";
import { requireViewer } from "@/server/auth/request";
import { AdminTabs } from "./AdminTabs";

export const metadata: Metadata = { title: { default: "The House", template: "%s · The House" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Non-owners get a 404, not a 403. Each page and action re-checks too.
  const viewer = await requireViewer("applications.review");
  return (
    <ClubShell viewer={viewer}>
      <div className="mx-auto max-w-[1400px] px-5 pb-28 pt-12 md:px-10 md:pt-16">
        <p className="eyebrow mb-4">The House · owner console</p>
        <AdminTabs />
        <div className="mt-10">{children}</div>
      </div>
    </ClubShell>
  );
}
