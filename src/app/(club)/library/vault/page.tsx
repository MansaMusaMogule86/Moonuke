import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PostTile } from "@/components/club/PostTile";
import { LibraryHeader } from "@/components/fan/LibraryHeader";
import { toPostView } from "@/components/fan/vault";
import { Button } from "@/components/ui/Button";
import { requireViewer } from "@/server/auth/request";
import { myVault } from "@/server/services/fan";

export const metadata: Metadata = { title: "Vault · Library" };

const VIA = { purchase: "Purchased", vip: "VIP membership", membership: "Membership" } as const;

export default async function VaultPage({ searchParams }: { searchParams: Promise<{ before?: string; creator?: string }> }) {
  const viewer = await requireViewer("club.follow");
  if (viewer.role !== "member" && viewer.role !== "creator") notFound();
  const sp = await searchParams;
  const creator = sp.creator && /^[a-z0-9_]{2,24}$/i.test(sp.creator) ? sp.creator : undefined;
  const { items, next } = await myVault(viewer, { before: sp.before, creatorHandle: creator });
  const q = (extra: Record<string, string>) => `/library/vault?${new URLSearchParams({ ...(creator ? { creator } : {}), ...extra })}`;

  return (
    <div className="mx-auto max-w-[1200px] px-5 pb-28 pt-14 md:px-10 md:pt-20">
      <LibraryHeader
        title={<>The <em className="text-metal">vault.</em></>}
        intro="Posts you've unlocked. Access is checked every time you open one — if a membership ends or a post is withdrawn, it leaves your vault. Images are private links that expire in minutes."
      />
      {creator && (
        <p className="mt-6 text-[14px] text-stone">
          Showing @{creator}. <Link href="/library/vault" className="text-gold underline decoration-gold/40 underline-offset-4">Show everything</Link>
        </p>
      )}
      {items.length === 0 ? (
        <p className="mt-10 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-8 text-[15px] text-stone">
          {sp.before ? "That's everything." : "Nothing here yet. Members and VIP posts from your memberships, and posts you buy, will appear here."}
        </p>
      ) : (
        <ul className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5 lg:grid-cols-4" aria-label="Unlocked posts">
          {items.map((i) => (
            <li key={i.id}>
              <PostTile post={toPostView(i)} />
              <p className="mt-2 flex flex-wrap gap-x-2 px-1 text-[12px] text-ash">
                <Link href={q({ creator: i.creator.handle })} className="hover:text-ivory">{i.creator.displayName}</Link>
                <span aria-hidden>·</span>
                <span>{VIA[i.via]}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
      {next && <div className="mt-10"><Button href={q({ before: next })} variant="outline">Older posts</Button></div>}
    </div>
  );
}
