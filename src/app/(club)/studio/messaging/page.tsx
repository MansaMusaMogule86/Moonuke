import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/server/auth/request";
import { mySettings } from "@/server/services/messaging";
import { MessagingSettingsForm } from "./SettingsForm";

export const metadata: Metadata = { title: "Messaging · Studio" };

export default async function StudioMessagingPage() {
  const viewer = await requireViewer("club.discover");
  if (viewer.role !== "creator") notFound();
  const s = await mySettings(viewer);
  return (
    <div className="mx-auto max-w-[800px] px-5 pb-28 pt-14 md:px-10 md:pt-20">
      <Link href="/studio" className="text-[13px] text-stone underline decoration-line-strong underline-offset-4 hover:text-ivory">← Studio</Link>
      <h1 className="mt-6 font-display text-[44px] leading-none tracking-[-0.03em] text-ivory md:text-[64px]">Messaging</h1>
      <p className="mt-4 text-[14px] leading-relaxed text-stone">
        You can always message your members, and reply to anyone in your audience. In any conversation you can mute it, restrict that person, or block them.
      </p>
      <div className="mt-10 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-9"><MessagingSettingsForm s={s} /></div>
    </div>
  );
}
