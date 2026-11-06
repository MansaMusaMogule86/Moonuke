import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { requireViewer } from "@/server/auth/request";
import { formatMoney } from "@/server/payments";
import { myPosts, type StudioPost } from "@/server/services/studio";

export const metadata: Metadata = { title: "Posts · Studio" };

const ACCESS: Record<StudioPost["access"], string> = { preview: "Everyone", members: "Members", vip: "VIP", ppv: "Pay per view" };
const STATE_TONE = { draft: "neutral", scheduled: "member", published: "vip" } as const;
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

export default async function PostsPage() {
  const viewer = await requireViewer("club.discover");
  if (viewer.role !== "creator") notFound();
  const posts = await myPosts(viewer);
  const counts = { draft: 0, scheduled: 0, published: 0 };
  for (const p of posts) counts[p.state]++;

  return (
    <div className="mx-auto max-w-[1000px] px-5 pb-28 pt-14 md:px-10 md:pt-20">
      <Link href="/studio" className="text-[13px] text-stone underline decoration-line-strong underline-offset-4 hover:text-ivory">← Studio</Link>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-[48px] leading-none tracking-[-0.03em] text-ivory md:text-[72px]">Posts</h1>
        <Button href="/studio/posts/new">New post</Button>
      </div>
      <p className="mt-4 text-[14px] text-stone">
        {counts.published} published · {counts.scheduled} scheduled · {counts.draft} draft{counts.draft === 1 ? "" : "s"}. Members only see published posts, and only once your profile is live.
      </p>

      {posts.length === 0 ? (
        <p className="mt-10 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-8 text-[15px] text-stone">No posts yet. Start with a draft — nobody sees it until you publish.</p>
      ) : (
        <ul className="mt-10 divide-y divide-line border-y border-line" aria-label="Your posts">
          {posts.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={STATE_TONE[p.state]}>{p.state}</Badge>
                  <Badge tone="neutral">{ACCESS[p.access]}{p.priceCents != null ? ` · ${formatMoney({ amountCents: p.priceCents, currency: "USD" })}` : ""}</Badge>
                  {p.hidden && <Badge tone="live">Hidden by the house</Badge>}
                  {p.review === "pending" && <Badge tone="locked">Waiting for review</Badge>}
                  {p.review === "rejected" && <Badge tone="live">Not approved</Badge>}
                </div>
                <p className="mt-2 truncate text-[16px] text-ivory">{p.teaser}</p>
                <p className="mt-1 text-[12px] text-ash">
                  {p.state === "draft" ? `Edited ${when(p.updatedAt)}` : p.state === "scheduled" ? `Publishes ${when(p.publishedAt!)}` : `Published ${when(p.publishedAt!)}`}
                </p>
              </div>
              <Link href={`/studio/posts/${p.id}`} className="text-[14px] text-gold underline decoration-gold/40 underline-offset-4 hover:text-gold-soft">
                Edit<span className="sr-only"> “{p.teaser}”</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
