import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CreatorChip } from "@/components/fan/CreatorChip";
import { LibraryHeader } from "@/components/fan/LibraryHeader";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { myPurchases, type PurchaseState } from "@/server/services/fan";

export const metadata: Metadata = { title: "Purchases · Library" };

const STATE: Record<PurchaseState, { label: string; tone: "vip" | "locked" | "neutral"; help: string }> = {
  available: { label: "Unlocked", tone: "vip", help: "" },
  under_review: { label: "Under review", tone: "locked", help: "The house has paused this post while it's reviewed. It returns to your vault if it's restored." },
  unavailable: { label: "Unavailable", tone: "neutral", help: "This creator isn't available to you right now." },
};
const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export default async function PurchasesPage() {
  const viewer = await requireViewer("club.follow");
  if (viewer.role !== "member" && viewer.role !== "creator") notFound();
  const list = await myPurchases(viewer);
  return (
    <div className="mx-auto max-w-[1000px] px-5 pb-28 pt-14 md:px-10 md:pt-20">
      <LibraryHeader
        title="Purchases"
        intro="Posts you own, and whether you can open them right now. Payments aren't active yet, so no amounts are recorded here."
      />
      {list.length === 0 ? (
        <p className="mt-10 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-8 text-[15px] text-stone">No purchases yet.</p>
      ) : (
        <ul className="mt-10 divide-y divide-line border-y border-line" aria-label="Your purchases">
          {list.map((p) => {
            const s = STATE[p.state];
            return (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-4 py-5">
                <div className="min-w-0 flex-1">
                  {p.creator ? <CreatorChip c={p.creator} sub={`Bought ${when(p.purchasedAt)}`} /> : <p className="text-[14px] text-stone">Bought {when(p.purchasedAt)}</p>}
                  {p.teaser && <p className="mt-3 text-[15px] text-ivory">{p.teaser}</p>}
                  {s.help && <p className="mt-2 text-[13px] text-ash">{s.help}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={s.tone}>{s.label}</Badge>
                  {p.state === "available" && p.creator && (
                    <Link href={`/c/${p.creator.handle}#post-${p.postId}`} className="text-[14px] text-gold underline decoration-gold/40 underline-offset-4">Open<span className="sr-only"> “{p.teaser}”</span></Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
