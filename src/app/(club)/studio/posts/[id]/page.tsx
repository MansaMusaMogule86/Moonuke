import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/server/auth/request";
import { myPost } from "@/server/services/studio";
import { uuid } from "@/server/validation";
import { DeletePost, PostComposer } from "../PostForms";

export const metadata: Metadata = { title: "Edit post · Studio" };

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer("club.discover");
  if (viewer.role !== "creator") notFound();
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const post = await myPost(viewer, id);
  if (!post) notFound();
  return (
    <div className="mx-auto max-w-[800px] px-5 pb-28 pt-14 md:px-10 md:pt-20">
      <Link href="/studio/posts" className="text-[13px] text-stone underline decoration-line-strong underline-offset-4 hover:text-ivory">← Posts</Link>
      <h1 className="mt-6 font-display text-[44px] leading-none tracking-[-0.03em] text-ivory md:text-[64px]">Edit post</h1>
      {post.hidden && (
        <p className="mt-6 rounded-[var(--radius-md)] border border-danger/40 bg-danger/[0.06] px-4 py-3 text-[14px] text-danger">
          The house has hidden this post while it&apos;s reviewed. Members can&apos;t see it.
        </p>
      )}
      <div className="mt-10 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-9">
        <PostComposer post={post} />
      </div>
      <div className="mt-8"><DeletePost id={post.id} purchased={post.purchased} /></div>
    </div>
  );
}
