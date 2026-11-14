import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PostTile } from "@/components/club/PostTile";
import { CreatorChip } from "@/components/fan/CreatorChip";
import { MembershipCard } from "@/components/fan/MembershipCard";
import { toPostView } from "@/components/fan/vault";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { requireViewer } from "@/server/auth/request";
import {
  mySubscriptions,
  myTransactionHistory,
  myUnlockedMessages,
  myVault,
} from "@/server/services/fan";

export const metadata: Metadata = { title: "My Access" };

type SP = Promise<Record<string, string | string[] | undefined>>;

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function MyAccessPage({ searchParams }: { searchParams?: SP }) {
  const viewer = await requireViewer("club.follow");
  if (viewer.role !== "member" && viewer.role !== "creator") notFound();

  const rawSp = searchParams ? await searchParams : {};
  const tabRaw = Array.isArray(rawSp.tab) ? rawSp.tab[0] : rawSp.tab;
  const activeTab = (
    ["all", "subscriptions", "posts", "messages", "history"].includes(tabRaw ?? "")
      ? tabRaw
      : "all"
  ) as "all" | "subscriptions" | "posts" | "messages" | "history";

  const [subs, vault, unlockedMessages, history] = await Promise.all([
    mySubscriptions(viewer),
    myVault(viewer, { limit: 24 }),
    myUnlockedMessages(viewer),
    myTransactionHistory(viewer),
  ]);

  const activeSubs = subs.filter((s) => s.state !== "ended");

  const tabs = [
    { key: "all", label: "All Access", count: null },
    { key: "subscriptions", label: "Active subscriptions", count: activeSubs.length },
    { key: "posts", label: "Unlocked posts", count: vault.items.length },
    { key: "messages", label: "Unlocked messages", count: unlockedMessages.length },
    { key: "history", label: "Purchase history", count: history.length },
  ] as const;

  const showSubs = activeTab === "all" || activeTab === "subscriptions";
  const showPosts = activeTab === "all" || activeTab === "posts";
  const showMessages = activeTab === "all" || activeTab === "messages";
  const showHistory = activeTab === "all" || activeTab === "history";

  return (
    <div className="mx-auto max-w-[1160px] px-5 pb-28 pt-10 md:px-10 md:pt-14">
      <header className="border-b border-line pb-6">
        <p className="eyebrow mb-2">My Access</p>
        <h1 className="font-display text-[42px] leading-[0.98] tracking-[-0.03em] text-ivory md:text-[64px]">
          Everything you&apos;ve <em className="text-metal">unlocked.</em>
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-stone">
          Manage your active subscriptions, view unlocked posts and messages, and review your complete purchase history.
        </p>

        {/* Simple Filter Tabs */}
        <nav aria-label="My Access sections" className="mt-6 flex flex-wrap gap-2">
          {tabs.map((t) => {
            const active = activeTab === t.key;
            const href = t.key === "all" ? "/library" : `/library?tab=${t.key}`;
            return (
              <Link
                key={t.key}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] transition-colors",
                  active
                    ? "border-gold/55 bg-gold/[0.12] font-medium text-gold-soft"
                    : "border-line-strong text-stone hover:border-ivory/30 hover:text-ivory",
                )}
              >
                <span>{t.label}</span>
                {t.count != null && (
                  <span className="rounded-full bg-obsidian/80 px-2 py-0.5 text-[11px] text-ash">
                    {t.count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </header>

      {/* 1. Active Subscriptions */}
      {showSubs && (
        <section aria-labelledby="subs-h" className="mt-10">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 id="subs-h" className="font-display text-[28px] text-ivory">
                Active subscriptions
              </h2>
              <p className="text-[13px] text-stone">
                Recurring monthly memberships. Cancel anytime; access continues through the end of your billing period.
              </p>
            </div>
            <Link
              href="/library/memberships"
              className="text-[13px] text-gold-soft underline underline-offset-4"
            >
              All memberships →
            </Link>
          </div>
          {activeSubs.length === 0 ? (
            <div className="mt-4 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 text-[14px] text-stone">
              You have no active subscriptions right now.{" "}
              <Link href="/discover" className="text-gold-soft underline underline-offset-4">
                Explore creators
              </Link>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {activeSubs.map((m) => (
                <MembershipCard key={m.id} m={m} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* 2. Unlocked Posts */}
      {showPosts && (
        <section aria-labelledby="posts-h" className="mt-12">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 id="posts-h" className="font-display text-[28px] text-ivory">
                Unlocked posts
              </h2>
              <p className="text-[13px] text-stone">
                Posts unlocked through your active subscriptions and one-time pay-per-view purchases.
              </p>
            </div>
            <Link href="/library/vault" className="text-[13px] text-gold-soft underline underline-offset-4">
              Full vault →
            </Link>
          </div>
          {vault.items.length === 0 ? (
            <div className="mt-4 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 text-[14px] text-stone">
              Posts you unlock through subscriptions or individual purchases appear here.
            </div>
          ) : (
            <ul className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {vault.items.map((item) => (
                <li key={item.id} className="flex flex-col">
                  <PostTile post={toPostView(item)} />
                  <div className="mt-2.5 flex items-center justify-between px-1 text-[12px]">
                    <Link
                      href={`/c/${item.creator.handle}`}
                      className="font-medium text-ivory hover:text-gold-soft"
                    >
                      {item.creator.displayName}
                    </Link>
                    <div className="flex items-center gap-3">
                      <span className="text-ash">
                        {item.via === "purchase"
                          ? "One-time unlock"
                          : item.via === "vip"
                            ? "VIP subscription"
                            : "Subscription"}
                      </span>
                      <Link
                        href={`/c/${item.creator.handle}#post-${item.id}`}
                        className="text-gold-soft underline underline-offset-4"
                      >
                        Open post →
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* 3. Unlocked Messages */}
      {showMessages && (
        <section aria-labelledby="msgs-h" className="mt-12">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 id="msgs-h" className="font-display text-[28px] text-ivory">
                Unlocked messages
              </h2>
              <p className="text-[13px] text-stone">
                Exclusive messages you unlocked in private creator conversations.
              </p>
            </div>
            <Link href="/messages" className="text-[13px] text-gold-soft underline underline-offset-4">
              Open Messages →
            </Link>
          </div>
          {unlockedMessages.length === 0 ? (
            <div className="mt-4 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 text-[14px] text-stone">
              Exclusive paid messages you unlock in conversations will appear here for quick access.
            </div>
          ) : (
            <ul className="mt-4 space-y-4">
              {unlockedMessages.map((um) => (
                <li
                  key={um.id}
                  className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {um.creator ? (
                      <CreatorChip c={um.creator} sub={`Unlocked ${day(um.unlockedAt)}`} />
                    ) : (
                      <span className="text-[14px] text-stone">Creator unavailable</span>
                    )}
                    <div className="flex items-center gap-2">
                      <Badge tone="member">One-time message unlock · {um.priceLabel}</Badge>
                      <Link
                        href={`/messages/${um.conversationId}`}
                        className="inline-flex h-9 items-center rounded-full border border-gold/45 px-4 text-[12px] text-gold-soft hover:bg-gold/[0.1]"
                      >
                        Open conversation →
                      </Link>
                    </div>
                  </div>
                  {um.previewText && (
                    <p className="mt-3 text-[12px] italic text-stone">Preview: {um.previewText}</p>
                  )}
                  {um.body && (
                    <p className="mt-2 rounded-[var(--radius-md)] border border-line bg-obsidian/70 p-3.5 text-[14px] leading-relaxed text-ivory">
                      {um.body}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* 4. Purchase History */}
      {showHistory && (
        <section aria-labelledby="history-h" className="mt-12">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 id="history-h" className="font-display text-[28px] text-ivory">
                Purchase history
              </h2>
              <p className="text-[13px] text-stone">
                Receipts and records distinguishing recurring subscriptions from one-time post and message unlocks.
              </p>
            </div>
            <Link
              href="/library/purchases"
              className="text-[13px] text-gold-soft underline underline-offset-4"
            >
              Entitlement status →
            </Link>
          </div>
          {history.length === 0 ? (
            <div className="mt-4 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 text-[14px] text-stone">
              No purchases recorded yet.
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-[var(--radius-xl)] border border-line bg-ink-2">
              <ul className="divide-y divide-line">
                {history.map((tx) => (
                  <li
                    key={tx.id}
                    className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em]",
                            tx.billingType === "recurring"
                              ? "border-gold/40 bg-gold/[0.1] text-gold-soft"
                              : "border-line-strong bg-obsidian text-stone",
                          )}
                        >
                          {tx.kindLabel}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]",
                            tx.status === "succeeded"
                              ? "bg-emerald-500/15 text-emerald-300"
                              : tx.status === "failed" || tx.status === "canceled"
                                ? "bg-danger/15 text-danger"
                                : "bg-gold/15 text-gold-soft",
                          )}
                        >
                          {tx.status}
                        </span>
                        <span className="text-[12px] text-ash">{day(tx.createdAt)}</span>
                      </div>
                      <p className="mt-1.5 font-medium text-ivory">{tx.title}</p>
                      <p className="mt-0.5 text-[12px] text-stone">
                        Creator:{" "}
                        {tx.creatorHandle ? (
                          <Link
                            href={`/c/${tx.creatorHandle}`}
                            className="text-ivory underline underline-offset-4 hover:text-gold-soft"
                          >
                            {tx.creatorName}
                          </Link>
                        ) : (
                          tx.creatorName
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-display text-[20px] text-ivory">
                          {tx.amountLabel ?? "Included"}
                        </p>
                        <p className="text-[11px] text-ash">
                          {tx.billingType === "recurring" ? "Recurring monthly" : "One-time purchase"}
                        </p>
                      </div>
                      {tx.href && tx.status === "succeeded" && (
                        <Link
                          href={tx.href}
                          className="inline-flex h-9 items-center rounded-full border border-line-strong px-3.5 text-[12px] text-ivory hover:border-gold/50"
                        >
                          View →
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
