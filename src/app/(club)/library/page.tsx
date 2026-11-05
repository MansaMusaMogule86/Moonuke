import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PostTile } from "@/components/club/PostTile";
import { CreatorChip } from "@/components/fan/CreatorChip";
import { LibraryHeader } from "@/components/fan/LibraryHeader";
import { toPostView } from "@/components/fan/vault";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { requireViewer } from "@/server/auth/request";
import { fanDashboard } from "@/server/services/fan";

export const metadata: Metadata = { title: "Library" };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function LibraryPage() {
  const viewer = await requireViewer("club.follow");
  if (viewer.role !== "member" && viewer.role !== "creator") notFound();
  const d = await fanDashboard(viewer);

  return (
    <div className="mx-auto max-w-[1200px] px-5 pb-28 pt-14 md:px-10 md:pt-20">
      <LibraryHeader title={<>Your <em className="text-metal">library.</em></>} intro="Everything you belong to, follow and have unlocked — in one private place." />

      <dl className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
        {([
          ["Memberships", d.memberships.length, "/library/memberships"],
          ["Following", d.following.length, "#following-h"],
          ["In your vault", d.counts.vault, "/library/vault"],
          ["Unread", d.counts.unread, "/notifications"],
        ] as const).map(([label, n, href]) => (
          <div key={label} className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-5">
            <dt className="eyebrow text-stone">{label}</dt>
            <dd className="mt-3"><Link href={href} className="font-display text-[40px] leading-none text-ivory hover:text-gold-soft">{n}<span className="sr-only"> — open {label.toLowerCase()}</span></Link></dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="memberships-h" className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="memberships-h" className="font-display text-[30px] text-ivory">Memberships</h2>
          <Link href="/library/memberships" className="text-[14px] text-gold underline decoration-gold/40 underline-offset-4">Manage</Link>
        </div>
        {d.memberships.length === 0 ? (
          <p className="mt-5 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 text-[15px] text-stone">No memberships yet. <Link className="text-gold underline decoration-gold/40 underline-offset-4" href="/discover">Discover creators</Link>.</p>
        ) : (
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {d.memberships.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-4">
                {m.creator ? <CreatorChip c={m.creator} sub={`${m.tierName} · ${m.state === "ending" ? "ends" : "until"} ${day(m.periodEnd)}`} /> : <span className="text-[14px] text-ash">Creator unavailable</span>}
                <Badge tone={m.tierKind === "vip" ? "vip" : "member"}>{m.state === "ending" ? "Ending" : m.tierKind === "vip" ? "VIP" : "Member"}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="latest-h" className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="latest-h" className="font-display text-[30px] text-ivory">Latest in your vault</h2>
          {d.latest.length > 0 && <Link href="/library/vault" className="text-[14px] text-gold underline decoration-gold/40 underline-offset-4">Open the vault</Link>}
        </div>
        {d.latest.length === 0 ? (
          <p className="mt-5 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 text-[15px] text-stone">Posts you unlock through memberships or purchases appear here.</p>
        ) : (
          <ul className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5">
            {d.latest.map((i) => (
              <li key={i.id}>
                <PostTile post={toPostView(i)} />
                <p className="mt-2 px-1 text-[12px] text-ash">
                  <Link href={`/c/${i.creator.handle}`} className="hover:text-ivory">{i.creator.displayName}</Link>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="following-h" className="mt-12">
        <h2 id="following-h" className="font-display text-[30px] text-ivory">Following</h2>
        {d.following.length === 0 ? (
          <p className="mt-5 text-[15px] text-stone">You aren&apos;t following anyone yet.</p>
        ) : (
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {d.following.map((c) => (
              <li key={c.id} className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-4"><CreatorChip c={c} /></li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-12"><Button href="/discover" variant="outline">Discover more creators</Button></div>
    </div>
  );
}
