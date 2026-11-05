import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/server/auth/request";
import { PostComposer } from "../PostForms";

export const metadata: Metadata = { title: "New post · Studio" };

export default async function NewPostPage() {
  const viewer = await requireViewer("club.discover");
  if (viewer.role !== "creator") notFound();
  return (
    <div className="mx-auto max-w-[800px] px-5 pb-28 pt-14 md:px-10 md:pt-20">
      <Link href="/studio/posts" className="text-[13px] text-stone underline decoration-line-strong underline-offset-4 hover:text-ivory">← Posts</Link>
      <h1 className="mt-6 font-display text-[44px] leading-none tracking-[-0.03em] text-ivory md:text-[64px]">New post</h1>
      <div className="mt-10 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-9">
        <PostComposer />
      </div>
    </div>
  );
}
