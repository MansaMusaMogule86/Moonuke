import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckoutButton } from "@/components/club/CheckoutButton";
import { FollowButton } from "@/components/club/FollowButton";
import { PostTile } from "@/components/club/PostTile";
import { Badge } from "@/components/ui/Badge";
import { Portrait } from "@/components/ui/Portrait";
import { ImageReveal, Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";
import { requireViewer } from "@/server/auth/request";
import { getProfile } from "@/server/services/club";

export const metadata: Metadata = { title: "Creator" };

export default async function CreatorPage({ params }: { params: Promise<{ handle: string }> }) {
  const viewer = await requireViewer("club.discover");
  const { handle } = await params;
  const p = await getProfile(viewer, handle);
  // Missing and not-allowed are indistinguishable by design.
  if (!p) notFound();

  const member = p.tiers.find((t) => t.kind === "member");
  const vip = p.tiers.find((t) => t.kind === "vip");
  const unlockedCount = p.posts.filter((x) => x.unlocked).length;

  return (
    <div className="pb-28">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -left-[10vw] top-0 h-[70vw] w-[70vw] rounded-full bg-[radial-gradient(closest-side,rgb(214_181_109/0.09),transparent)] md:h-[50vw] md:w-[50vw]" />
        <div className="relative mx-auto grid max-w-[1600px] gap-10 px-5 pt-10 md:grid-cols-12 md:gap-6 md:px-10 md:pt-16">
          <ImageReveal className="arch relative aspect-[3/4] overflow-hidden border border-line-strong p-[6px] md:col-span-5 lg:col-span-4">
            <Portrait alt={`Portrait study of ${p.displayName}`} study={p.cover} className="arch h-full w-full" priority />
          </ImageReveal>

          <Reveal className="md:col-span-7 md:col-start-6 md:self-end lg:col-span-7 lg:col-start-6">
            <div className="flex flex-wrap items-center gap-2">
              <p className="eyebrow">{p.discipline}{p.city ? ` · ${p.city}` : ""}</p>
              {p.visibility === "discreet" && <Badge tone="neutral">Discreet · not listed</Badge>}
              {p.visibility === "private" && <Badge tone="neutral">Private · members only</Badge>}
              {p.viewer.tier && <Badge tone={p.viewer.tier === "vip" ? "vip" : "member"}>{p.viewer.tier === "vip" ? "Your VIP room" : "You're a member"}</Badge>}
            </div>
            <h1 className="mt-5 font-display text-[60px] leading-[0.92] tracking-[-0.03em] text-ivory md:text-[120px]">
              {p.displayName.split(" ")[0]} <em className="text-metal">{p.displayName.split(" ").slice(1).join(" ")}</em>
            </h1>
            {p.tagline && <p className="mt-6 max-w-xl font-display text-[22px] italic leading-snug text-ivory/85 md:text-[26px]">{p.tagline}</p>}
            {p.bio && <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-stone">{p.bio}</p>}

            <dl className="mt-10 flex gap-10 border-t border-line pt-6">
              {[
                ["Members", p.stats.members],
                ["Followers", p.stats.followers],
                ["Posts", p.stats.posts],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <dt className="eyebrow text-[10px] text-ash">{k}</dt>
                  <dd className="mt-1 font-display text-[30px] tabular-nums text-ivory">{v}</dd>
                </div>
              ))}
            </dl>

            {!p.viewer.isSelf && (
              <div className="mt-8 flex flex-wrap items-start gap-3">
                {vip && p.viewer.tier !== "vip" && (
                  <CheckoutButton target={{ kind: "tier", id: vip.id }} size="lg">
                    Join VIP · {vip.priceLabel}
                  </CheckoutButton>
                )}
                {member && !p.viewer.tier && (
                  <CheckoutButton target={{ kind: "tier", id: member.id }} size="lg" variant="outline">
                    Member · {member.priceLabel}
                  </CheckoutButton>
                )}
                <FollowButton creatorId={p.id} handle={p.handle} following={p.viewer.following} />
              </div>
            )}
          </Reveal>
        </div>
      </section>

      {/* Tiers */}
      <section aria-labelledby="tiers-h" id="tiers" className="mx-auto mt-24 max-w-[1600px] px-5 md:mt-36 md:px-10">
        <div className="mb-10 flex items-baseline gap-5 border-b border-line pb-5">
          <span className="font-display text-[15px] italic text-gold">I</span>
          <h2 id="tiers-h" className="font-display text-[34px] text-ivory md:text-[48px]">Rooms</h2>
        </div>
        <ul className="grid gap-5 md:grid-cols-2 md:gap-6">
          {p.tiers.map((t) => {
            const isVip = t.kind === "vip";
            const current = p.viewer.tier === t.kind;
            const seatsLeft = t.seatLimit != null ? Math.max(0, t.seatLimit - (t.seatsTaken ?? 0)) : null;
            return (
              <li key={t.id} className={cn("flex flex-col rounded-[var(--radius-xl)] border p-7 md:p-10", isVip ? "border-gold/40 bg-ink-3" : "border-line bg-ink-2")}>
                <div className="flex items-start justify-between gap-4">
                  <h3 className={cn("font-display text-[40px] leading-none", isVip ? "text-metal" : "text-ivory")}>{t.name}</h3>
                  {seatsLeft != null && (
                    <p className="text-right text-[12px] text-stone">
                      <span className="block font-display text-[22px] tabular-nums text-gold-soft">{seatsLeft}</span>
                      of {t.seatLimit} seats left
                    </p>
                  )}
                </div>
                <p className="mt-6 font-display text-[34px] text-ivory">
                  {t.priceLabel}
                  <span className="ml-2 align-middle font-sans text-[12px] uppercase tracking-[0.18em] text-ash">per month</span>
                </p>
                <div aria-hidden className="hairline my-7" />
                <ul className="space-y-3 text-[14px] text-ivory/85">
                  {t.perks.map((perk) => (
                    <li key={perk} className="flex gap-3">
                      <span aria-hidden className={cn("mt-[9px] h-px w-3 shrink-0", isVip ? "bg-gold" : "bg-stone/60")} />
                      {perk}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-9">
                  {p.viewer.isSelf ? null : current ? (
                    <p className="rounded-full border border-gold/40 px-5 py-3 text-center text-[14px] text-gold-soft">Your current room</p>
                  ) : seatsLeft === 0 ? (
                    <p className="rounded-full border border-line-strong px-5 py-3 text-center text-[14px] text-stone">Every seat is taken</p>
                  ) : (
                    <CheckoutButton target={{ kind: "tier", id: t.id }} variant={isVip ? "gold" : "outline"} className="w-full">
                      {isVip ? "Join VIP" : "Become a member"}
                    </CheckoutButton>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Feed */}
      <section aria-labelledby="work-h" className="mx-auto mt-24 max-w-[1600px] px-5 md:mt-36 md:px-10">
        <div className="mb-10 flex flex-wrap items-baseline justify-between gap-4 border-b border-line pb-5">
          <div className="flex items-baseline gap-5">
            <span className="font-display text-[15px] italic text-gold">II</span>
            <h2 id="work-h" className="font-display text-[34px] text-ivory md:text-[48px]">The work</h2>
          </div>
          <p className="text-[13px] text-stone">{unlockedCount} of {p.posts.length} open to you</p>
        </div>
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {p.posts.map((post) => (
            <li key={post.id}>
              <PostTile post={post} vipTierId={p.viewer.isSelf ? undefined : vip?.id} memberTierId={p.viewer.isSelf ? undefined : member?.id} />
            </li>
          ))}
        </ul>
        <p className="mt-10 max-w-2xl text-[13px] leading-relaxed text-ash">
          Media is delivered through private, short-lived links issued to you alone. Please respect the creator — sharing
          outside the Circle breaks the house rules.
        </p>
      </section>
    </div>
  );
}
