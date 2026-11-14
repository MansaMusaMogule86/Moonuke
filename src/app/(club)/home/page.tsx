import type { Metadata } from "next";
import Link from "next/link";
import { CheckoutButton } from "@/components/club/CheckoutButton";
import { CreatorPlate } from "@/components/club/CreatorPlate";
import { Portrait } from "@/components/ui/Portrait";
import { requireViewer } from "@/server/auth/request";
import { myHomeFeed, type HomeFeedItem } from "@/server/services/fan";

export const metadata: Metadata = { title: "Home" };

const ACCESS_STATE_BADGE: Record<
  HomeFeedItem["access"],
  { lockedLabel: string; unlockedLabel: string; tone: string }
> = {
  preview: {
    lockedLabel: "Free Post",
    unlockedLabel: "Free Post",
    tone: "border-line-strong bg-obsidian/70 text-stone",
  },
  members: {
    lockedLabel: "Subscription Post",
    unlockedLabel: "Included in Subscription",
    tone: "border-gold/35 bg-gold/[0.08] text-gold-soft",
  },
  vip: {
    lockedLabel: "VIP Subscription Post",
    unlockedLabel: "Included in VIP",
    tone: "border-gold/45 bg-gold/[0.12] text-gold",
  },
  ppv: {
    lockedLabel: "Paid Post",
    unlockedLabel: "Purchased Post",
    tone: "border-emerald-500/35 bg-emerald-500/[0.08] text-emerald-300",
  },
};

export default async function FanHomePage() {
  const viewer = await requireViewer("club.discover");
  const feed = await myHomeFeed(viewer, { limit: 36 });

  return (
    <div className="mx-auto max-w-[980px] px-5 py-8 md:px-10 md:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-soft">Home Feed</p>
          <h1 className="mt-1.5 font-display text-[clamp(30px,4vw,44px)] leading-[1.06] text-ivory">
            Your followed & subscribed creators.
          </h1>
          <p className="mt-1.5 text-[14px] text-stone">
            Latest posts from the Diva creators you follow or subscribe to.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link
            href="/discover"
            className="inline-flex h-10 items-center rounded-full border border-line-strong px-4 text-[13px] text-ivory hover:border-gold/50"
          >
            Explore creators
          </Link>
          <Link
            href="/library"
            className="inline-flex h-10 items-center rounded-full border border-line px-4 text-[13px] text-stone hover:text-ivory"
          >
            My Access
          </Link>
        </div>
      </header>

      {!feed.hasConnections || feed.items.length === 0 ? (
        <section className="mt-8 space-y-8">
          <div className="rounded-[var(--radius-lg)] border border-gold/30 bg-obsidian/70 p-7 md:p-9">
            <p className="text-[11px] uppercase tracking-[0.22em] text-gold-soft">Welcome to DivaFans</p>
            <h2 className="mt-2 font-display text-[28px] leading-snug text-ivory">
              Follow or subscribe to creators to build your personal feed.
            </h2>
            <p className="mt-2 max-w-[56ch] text-[14px] leading-relaxed text-stone">
              When you follow or subscribe to a Diva creator, their free previews, membership updates, and individual unlockable posts appear right here in chronological order.
            </p>
            <div className="mt-6">
              <Link
                href="/discover"
                className="inline-flex h-11 items-center rounded-full bg-gold px-6 text-[13px] font-medium tracking-[0.06em] text-ink hover:bg-gold-soft"
              >
                Explore creators
              </Link>
            </div>
          </div>

          {feed.recommendedCreators.length > 0 && (
            <div>
              <div className="mb-4 flex items-baseline justify-between">
                <h3 className="font-display text-[22px] text-ivory">Available creators to explore</h3>
                <Link href="/discover" className="text-[13px] text-gold-soft underline underline-offset-4">
                  See all in Explore
                </Link>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {feed.recommendedCreators.map((c) => (
                  <CreatorPlate key={c.id} c={c} />
                ))}
              </div>
            </div>
          )}
        </section>
      ) : (
        <section aria-label="Personalized creator feed" className="mt-8 space-y-6">
          {feed.items.map((item) => {
            const badge = ACCESS_STATE_BADGE[item.access];
            const stateLabel = item.unlocked ? badge.unlockedLabel : badge.lockedLabel;
            const postHref = `/c/${item.creator.handle}#post-${item.id}`;

            return (
              <article
                key={item.id}
                className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-obsidian/65 transition-colors hover:border-line-strong"
              >
                {/* Creator header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
                  <Link href={`/c/${item.creator.handle}`} className="flex items-center gap-3.5 group">
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-line-strong">
                      <Portrait
                        study={item.creator.cover}
                        alt={item.creator.displayName}
                        className="h-full w-full"
                      />
                    </div>
                    <div>
                      <p className="font-display text-[19px] leading-tight text-ivory group-hover:text-gold-soft">
                        {item.creator.displayName}
                      </p>
                      <p className="text-[12px] text-stone">
                        @{item.creator.handle} · {item.creator.discipline}
                      </p>
                    </div>
                  </Link>

                  <div className="flex items-center gap-2.5">
                    <span
                      className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${
                        item.unlocked
                          ? "border-emerald-500/35 bg-emerald-500/[0.08] text-emerald-300"
                          : badge.tone
                      }`}
                    >
                      {stateLabel}
                    </span>
                    <time dateTime={item.publishedAt} className="text-[12px] text-ash">
                      {new Date(item.publishedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                  </div>
                </div>

                {/* Post preview / media */}
                <div className="grid gap-5 p-5 md:grid-cols-[240px_1fr]">
                  <div className="relative aspect-[4/5] overflow-hidden rounded-[var(--radius-md)] border border-line bg-ink">
                    {item.unlocked && item.media?.[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.media[0]}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center bg-[radial-gradient(ellipse_at_50%_30%,rgba(201,164,107,0.18),transparent_70%),#100d13] p-5 text-center">
                        <span className="grid h-11 w-11 place-items-center rounded-full border border-gold/40 bg-obsidian/80 text-gold">
                          <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
                            <rect x="3" y="7" width="10" height="7" rx="1.5" />
                            <path d="M5 7V5a3 3 0 0 1 6 0v2" />
                          </svg>
                        </span>
                        <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-gold-soft">
                          {item.access === "ppv" && item.priceLabel
                            ? `Unlock for ${item.priceLabel}`
                            : item.access === "vip"
                              ? "VIP Members Only"
                              : "Subscribers Only"}
                        </p>
                      </div>
                    )}
                    <span className="absolute bottom-2.5 left-2.5 rounded-full border border-line bg-ink/80 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] text-stone backdrop-blur-sm">
                      {item.mediaKind === "set"
                        ? `${item.mediaCount} photos`
                        : item.mediaKind === "video"
                          ? "Video"
                          : "Photo"}
                    </span>
                  </div>

                  <div className="flex flex-col justify-between gap-4">
                    <div>
                      <p className="font-display text-[22px] leading-snug text-ivory">{item.teaser}</p>
                      {item.unlocked && item.body ? (
                        <p className="mt-2.5 text-[14px] leading-relaxed text-stone">{item.body}</p>
                      ) : (
                        <p className="mt-2.5 text-[13px] leading-relaxed text-ash">
                          {item.access === "ppv" && item.priceLabel
                            ? `One-time pay-per-view release (${item.priceLabel}). Unlock once to keep permanent access.`
                            : item.access === "vip"
                              ? `Included with a VIP subscription to ${item.creator.displayName}.`
                              : `Included with a monthly subscription to ${item.creator.displayName}.`}
                        </p>
                      )}
                    </div>

                    {/* One obvious primary action */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                      {item.unlocked ? (
                        <Link
                          href={postHref}
                          className="inline-flex h-10 items-center rounded-full border border-gold/45 bg-gold/[0.1] px-5 text-[13px] font-medium text-gold-soft hover:bg-gold/[0.18]"
                        >
                          {item.access === "preview" ? "View post" : "View unlocked post"}
                        </Link>
                      ) : item.access === "ppv" && item.priceLabel ? (
                        <CheckoutButton target={{ kind: "post", id: item.id }} size="md">
                          Unlock for {item.priceLabel}
                        </CheckoutButton>
                      ) : item.requiredTier ? (
                        <CheckoutButton target={{ kind: "tier", id: item.requiredTier.id }} variant="outline" size="md">
                          Subscribe to access · {item.requiredTier.priceLabel}/mo
                        </CheckoutButton>
                      ) : (
                        <Link
                          href={`/c/${item.creator.handle}`}
                          className="inline-flex h-10 items-center rounded-full border border-gold/45 px-5 text-[13px] text-gold-soft hover:bg-gold/[0.1]"
                        >
                          Subscribe to access
                        </Link>
                      )}

                      <Link
                        href={`/c/${item.creator.handle}`}
                        className="text-[12px] text-stone underline underline-offset-4 hover:text-ivory"
                      >
                        Visit {item.creator.displayName} →
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
