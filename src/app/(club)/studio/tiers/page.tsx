import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/server/auth/request";
import { myTiers } from "@/server/services/studio";
import { NewTierForm, TierEditor } from "./TierForms";

export const metadata: Metadata = { title: "Tiers · Studio" };

export default async function TiersPage() {
  const viewer = await requireViewer("club.discover");
  if (viewer.role !== "creator") notFound();
  const tiers = await myTiers(viewer);
  return (
    <div className="mx-auto max-w-[1000px] px-5 pb-28 pt-14 md:px-10 md:pt-20">
      <Link href="/studio" className="text-[13px] text-stone underline decoration-line-strong underline-offset-4 hover:text-ivory">← Studio</Link>
      <h1 className="mt-6 font-display text-[48px] leading-none tracking-[-0.03em] text-ivory md:text-[72px]">Tiers</h1>
      <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-stone">
        Memberships unlock your members posts; VIP also unlocks VIP posts. Payments aren&apos;t active yet, so prices are quotes and nobody is charged.
      </p>
      <div className="mt-10 grid gap-6 lg:grid-cols-12">
        <section aria-labelledby="tiers-h" className="space-y-6 lg:col-span-7">
          <h2 id="tiers-h" className="sr-only">Your tiers</h2>
          {tiers.length === 0 ? (
            <p className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-8 text-[15px] text-stone">No tiers yet. Add one so members can join.</p>
          ) : (
            tiers.map((t) => (
              <div key={t.id} className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-8">
                <TierEditor tier={t} />
              </div>
            ))
          )}
        </section>
        <section aria-labelledby="new-tier-h" className="h-fit rounded-[var(--radius-xl)] border border-gold/30 bg-ink-2 p-6 md:p-8 lg:col-span-5">
          <h2 id="new-tier-h" className="font-display text-[28px] text-ivory">Add a tier</h2>
          <div className="mt-6"><NewTierForm /></div>
        </section>
      </div>
    </div>
  );
}
