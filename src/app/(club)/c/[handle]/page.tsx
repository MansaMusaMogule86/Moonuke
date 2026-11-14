import { brand } from "@/config/brand";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckoutButton } from "@/components/club/CheckoutButton";
import { FollowButton } from "@/components/club/FollowButton";
import { StartConversation } from "@/components/messaging/StartConversation";
import { PostTile } from "@/components/club/PostTile";
import { BlockButton, ReportButton } from "@/components/club/SafetyButtons";
import { Badge } from "@/components/ui/Badge";
import { Portrait } from "@/components/ui/Portrait";
import { ImageReveal, Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";
import { requireViewer } from "@/server/auth/request";
import { getProfile } from "@/server/services/club";
import { PLATFORMS, publicSocials } from "@/server/services/onboarding";

export const metadata: Metadata = { title: "Creator" };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function CreatorPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams?: SP;
}) {
  const viewer = await requireViewer("club.discover");
  const { handle } = await params;
  const rawSp = searchParams ? await searchParams : {};
  const filterParam = Array.isArray(rawSp.filter) ? rawSp.filter[0] : rawSp.filter;
  const activeFilter = (
    ["all", "free", "subscription", "ppv", "unlocked"].includes(filterParam ?? "") ? filterParam : "all"
  ) as "all" | "free" | "subscription" | "ppv" | "unlocked";

  const p = await getProfile(viewer, handle);
  // Missing and not-allowed are indistinguishable by design.
  if (!p) notFound();

  const socials = await publicSocials(viewer, p.id);
  const member = p.tiers.find((t) => t.kind === "member");
  const vip = p.tiers.find((t) => t.kind === "vip");
  const unlockedCount = p.posts.filter((x) => x.unlocked).length;

  const filteredPosts = p.posts.filter((post) => {
    if (activeFilter === "free") return post.access === "preview";
    if (activeFilter === "subscription") return post.access === "members" || post.access === "vip";
    if (activeFilter === "ppv") return post.access === "ppv";
    if (activeFilter === "unlocked") return post.unlocked;
    return true;
  });

  const filterTabs = [
    { key: "all", label: "All posts", count: p.posts.length },
    { key: "free", label: "Free content", count: p.posts.filter((x) => x.access === "preview").length },
    {
      key: "subscription",
      label: "Included in subscription",
      count: p.posts.filter((x) => x.access === "members" || x.access === "vip").length,
    },
    { key: "ppv", label: "Sold individually", count: p.posts.filter((x) => x.access === "ppv").length },
    { key: "unlocked", label: "Already unlocked", count: unlockedCount },
  ] as const;

  return (
    <div className="pb-28">
      {/* Hero */}
      <section className="smoke-ambient relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -left-[10vw] top-0 h-[70vw] w-[70vw] rounded-full bg-[radial-gradient(closest-side,rgb(216_173_82/0.11),transparent)] md:h-[50vw] md:w-[50vw]" />
        <div aria-hidden className="pointer-events-none absolute -right-[10vw] top-[15%] h-[55vw] w-[55vw] rounded-full bg-[radial-gradient(closest-side,rgb(245_42_139/0.08),transparent)] md:h-[40vw] md:w-[40vw]" />
        <div className="relative mx-auto grid max-w-[1600px] gap-10 px-5 pt-10 md:grid-cols-12 md:gap-6 md:px-10 md:pt-16">
          <ImageReveal className="arch relative aspect-[3/4] overflow-hidden border border-line-strong p-[6px] md:col-span-5 lg:col-span-4">
            <Portrait alt={`Cover for ${p.displayName}`} study={p.cover} className="arch h-full w-full" priority />
          </ImageReveal>

          <Reveal className="md:col-span-7 md:col-start-6 md:self-end lg:col-span-7 lg:col-start-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 border-gold/50 bg-obsidian">
                <Portrait alt={`Avatar for ${p.displayName}`} study={p.cover} className="h-full w-full" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="eyebrow">{p.discipline}{p.city ? ` · ${p.city}` : ""}</p>
                  {p.visibility === "discreet" && <Badge tone="neutral">Discreet · not listed</Badge>}
                  {p.visibility === "private" && <Badge tone="neutral">Private · members only</Badge>}
                  {p.viewer.tier && <Badge tone={p.viewer.tier === "vip" ? "vip" : "member"}>{p.viewer.tier === "vip" ? "Your VIP room" : "You're a member"}</Badge>}
                </div>
                <p className="mt-1 text-[13px] font-medium text-gold-soft">@{p.handle}</p>
              </div>
            </div>
            <h1 className="mt-4 font-display text-[56px] leading-[0.94] tracking-[-0.03em] text-ivory md:text-[108px]">
              {p.displayName.split(" ")[0]} <em className="text-metal">{p.displayName.split(" ").slice(1).join(" ")}</em>
            </h1>
            {p.tagline && <p className="mt-6 max-w-xl font-display text-[22px] italic leading-snug text-ivory/85 md:text-[26px]">{p.tagline}</p>}
            {p.bio && <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-stone">{p.bio}</p>}

            {socials.length > 0 && (
              <ul aria-label="Verified social profiles" className="mt-6 flex flex-wrap gap-2">
                {socials.map((s) => (
                  <li key={s.platform + s.handle}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-2 rounded-full border border-line-strong px-3 py-1.5 text-[12px] text-stone transition-colors hover:border-gold/50 hover:text-ivory">
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-gold" />
                      {PLATFORMS[s.platform].label} · @{s.handle}
                      <span className="sr-only">(verified by the house, opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
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
                    Subscribe VIP · {vip.priceLabel}/mo
                  </CheckoutButton>
                )}
                {member && !p.viewer.tier && (
                  <CheckoutButton target={{ kind: "tier", id: member.id }} size="lg" variant="outline">
                    Subscribe · {member.priceLabel}/mo
                  </CheckoutButton>
                )}
                <FollowButton creatorId={p.id} handle={p.handle} following={p.viewer.following} />
                {viewer.role !== "owner" &&
                  (p.viewer.tier ? (
                    <StartConversation userId={p.id} name={p.displayName} variant="outline" />
                  ) : (
                    <a
                      href="#tiers"
                      className="inline-flex h-11 items-center rounded-full border border-line-strong px-5 text-[13px] text-stone hover:border-gold/50 hover:text-ivory"
                    >
                      Message (Members)
                    </a>
                  ))}
              </div>
            )}
            {!p.viewer.isSelf && viewer.role !== "owner" && (
              <div className="mt-4 flex gap-1">
                <ReportButton targetType="creator" targetId={p.id} label={p.displayName} />
                <BlockButton targetUserId={p.id} name={p.displayName} />
              </div>
            )}
          </Reveal>
        </div>
      </section>

      {/* Tiers */}
      <section aria-labelledby="tiers-h" id="tiers" className="mx-auto mt-24 max-w-[1600px] px-5 md:mt-36 md:px-10">
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4 border-b border-line pb-5">
          <div className="flex items-baseline gap-5">
            <span className="font-display text-[15px] italic text-gold">I</span>
            <h2 id="tiers-h" className="font-display text-[34px] text-ivory md:text-[48px]">Subscription Offers</h2>
          </div>
          <p className="text-[13px] text-stone">
            Subscriptions include membership posts for that tier. Individual pay-per-view posts and locked messages are sold separately.
          </p>
        </div>
        <ul className="grid gap-5 md:grid-cols-2 md:gap-6">
          {p.tiers.map((t) => {
            const isVip = t.kind === "vip";
            const current = p.viewer.tier === t.kind;
            const seatsLeft = t.seatLimit != null ? Math.max(0, t.seatLimit - (t.seatsTaken ?? 0)) : null;
            return (
              <li key={t.id} className={cn("flex flex-col rounded-[var(--radius-xl)] border p-7 shadow-[0_24px_64px_-24px_rgba(0,0,0,0.85)] md:p-10", isVip ? "border-gold/45 bg-ink-3 shadow-[0_0_48px_-20px_rgba(216,173,82,0.3)]" : "border-line bg-ink-2")}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="eyebrow text-gold">{isVip ? "VIP Tier" : "Member Tier"}</p>
                    <h3 className={cn("mt-2 font-display text-[40px] leading-none", isVip ? "text-metal" : "text-ivory")}>{t.name}</h3>
                  </div>
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
                <p className="mt-2 text-[12px] text-stone">
                  {isVip
                    ? "Includes all Member & VIP subscription posts + direct messaging. Individual PPV posts & paid messages sold separately."
                    : "Includes all Member subscription posts + direct messaging. VIP posts, PPV posts & paid messages sold separately."}
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
                    <p className="rounded-full border border-gold/40 px-5 py-3 text-center text-[14px] text-gold-soft">Your current subscription</p>
                  ) : seatsLeft === 0 ? (
                    <p className="rounded-full border border-line-strong px-5 py-3 text-center text-[14px] text-stone">Every seat is taken</p>
                  ) : (
                    <CheckoutButton target={{ kind: "tier", id: t.id }} variant={isVip ? "gold" : "outline"} className="w-full">
                      {isVip ? `Subscribe to VIP · ${t.priceLabel}/mo` : `Subscribe · ${t.priceLabel}/mo`}
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
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4 border-b border-line pb-5">
          <div className="flex items-baseline gap-5">
            <span className="font-display text-[15px] italic text-gold">II</span>
            <h2 id="work-h" className="font-display text-[34px] text-ivory md:text-[48px]">Creator Posts</h2>
          </div>
          <p className="text-[13px] text-stone">{unlockedCount} of {p.posts.length} unlocked for you</p>
        </div>

        {/* Access Type Filter Tabs */}
        <nav aria-label="Filter posts by access type" className="mb-8 flex flex-wrap gap-2">
          {filterTabs.map((tab) => {
            const active = activeFilter === tab.key;
            const href = tab.key === "all" ? `/c/${p.handle}#work-h` : `/c/${p.handle}?filter=${tab.key}#work-h`;
            return (
              <Link
                key={tab.key}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] transition-colors",
                  active
                    ? "border-gold/55 bg-gold/[0.12] font-medium text-gold-soft"
                    : "border-line-strong text-stone hover:border-ivory/30 hover:text-ivory",
                )}
              >
                <span>{tab.label}</span>
                <span className="rounded-full bg-obsidian/80 px-2 py-0.5 text-[11px] text-ash">{tab.count}</span>
              </Link>
            );
          })}
        </nav>

        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredPosts.map((post) => (
            <li key={post.id}>
              <PostTile post={post} vipTierId={p.viewer.isSelf ? undefined : vip?.id} memberTierId={p.viewer.isSelf ? undefined : member?.id} canReport={!p.viewer.isSelf && viewer.role !== "owner"} />
            </li>
          ))}
        </ul>
        <p className="mt-10 max-w-2xl text-[13px] leading-relaxed text-ash">
          Media is delivered through private, short-lived links issued to you alone. Please respect the creator — sharing
          it outside {brand.name} breaks the community rules.
        </p>
      </section>
    </div>
  );
}
