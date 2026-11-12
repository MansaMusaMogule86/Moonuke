import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StudioHeader } from "@/components/studio/StudioHeader";
import { requireViewer } from "@/server/auth/request";
import { PostComposer } from "../PostForms";

export const metadata: Metadata = { title: "New post · Studio" };

export default async function NewPostPage() {
  const viewer = await requireViewer("club.discover");
  if (viewer.role !== "creator") notFound();
  return (
    <div className="mx-auto max-w-[800px] px-5 pb-28 pt-6 md:px-10 md:pt-8">
      <StudioHeader eyebrow="Content" title="New post" />
      <div className="mt-8 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-9">
        <PostComposer />
      </div>
    </div>
  );
}
