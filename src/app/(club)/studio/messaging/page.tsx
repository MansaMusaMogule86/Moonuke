import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudioHeader } from "@/components/studio/StudioHeader";
import { requireViewer } from "@/server/auth/request";
import { mySettings } from "@/server/services/messaging";
import { MessagingSettingsForm } from "./SettingsForm";

export const metadata: Metadata = { title: "Messaging · Studio" };

export default async function StudioMessagingPage() {
  const viewer = await requireViewer("club.discover");
  if (viewer.role !== "creator") notFound();
  const s = await mySettings(viewer);
  return (
    <div className="mx-auto max-w-[800px] px-5 pb-28 pt-6 md:px-10 md:pt-8">
      <StudioHeader
        eyebrow="Studio"
        title="Messages"
        lede="You can always message your members, and reply to anyone in your audience. In any conversation you can mute it, restrict that person, or block them."
      />
      <div className="mt-8 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-9"><MessagingSettingsForm s={s} /></div>
    </div>
  );
}
