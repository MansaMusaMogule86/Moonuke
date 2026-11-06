import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/server/auth/request";
import { myPost } from "@/server/services/studio";
import { uuid } from "@/server/validation";
import { DeletePost, PostComposer } from "../PostForms";
import { myConsents, myParticipants, postParticipants } from "@/server/services/participants";
import { PostParticipantsForm } from "../../participants/ParticipantForms";

export const metadata: Metadata = { title: "Edit post · Studio" };

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer("club.discover");
  if (viewer.role !== "creator") notFound();
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const post = await myPost(viewer, id);
  if (!post) notFound();
  const linked = await postParticipants(viewer, id);
  const verified = (await myParticipants(viewer)).filter((p) => p.status === "verified");
  const options = (
    await Promise.all(verified.map(async (p) => (await myConsents(viewer, p.id)).filter((c) => !c.withdrawn_at).map((c) => ({ participantId: p.id, label: p.label, consentId: c.id, scope: c.scope }))))
  ).flat();
  return (
    <div className="mx-auto max-w-[800px] px-5 pb-28 pt-14 md:px-10 md:pt-20">
      <Link href="/studio/posts" className="text-[13px] text-stone underline decoration-line-strong underline-offset-4 hover:text-ivory">← Posts</Link>
      <h1 className="mt-6 font-display text-[44px] leading-none tracking-[-0.03em] text-ivory md:text-[64px]">Edit post</h1>
      {post.hidden && (
        <p className="mt-6 rounded-[var(--radius-md)] border border-danger/40 bg-danger/[0.06] px-4 py-3 text-[14px] text-danger">
          The house has hidden this post while it&apos;s reviewed. Members can&apos;t see it.
        </p>
      )}
      {post.review === "pending" && (
        <p className="mt-6 rounded-[var(--radius-md)] border border-line-strong px-4 py-3 text-[14px] text-stone">
          Waiting for house review. Members can&apos;t see this post until it&apos;s approved.
        </p>
      )}
      {post.review === "rejected" && (
        <p className="mt-6 rounded-[var(--radius-md)] border border-danger/40 bg-danger/[0.06] px-4 py-3 text-[14px] text-danger">
          Not approved{post.reviewNote ? `: ${post.reviewNote}` : "."} Edit the post to send it for review again.
        </p>
      )}
      <div className="mt-10 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-9">
        <PostComposer post={post} />
      </div>
      <section aria-labelledby="people-h" className="mt-8 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-9">
        <h2 id="people-h" className="font-display text-[26px] text-ivory">People in this post</h2>
        <p className="mt-2 text-[14px] text-stone">
          Name everyone other than you who appears. Each person needs a verified record and an active consent. Posts that name people wait for house review.
        </p>
        <div className="mt-6"><PostParticipantsForm postId={post.id} options={options} linked={linked.map((l) => `${l.participant_id}:${l.consent_id}`)} /></div>
      </section>
      <div className="mt-8"><DeletePost id={post.id} purchased={post.purchased} /></div>
    </div>
  );
}
