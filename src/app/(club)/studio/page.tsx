import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyLink } from "@/components/studio/CopyLink";
import { StudioHeader } from "@/components/studio/StudioHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatCreatorPublicName } from "@/lib/creatorName";
import { requireViewer } from "@/server/auth/request";
import { myBlasts } from "@/server/services/blasts";
import { getOnboarding } from "@/server/services/creatorOnboarding";
import { myEarnings } from "@/server/services/earnings";
import { myCreatorConversations } from "@/server/services/messaging";
import { myAnalytics, myPosts } from "@/server/services/studio";

export const metadata: Metadata = { title: "Overview · Studio" };

const STATE_TONE = { draft: "neutral", scheduled: "member", published: "vip" } as const;
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

function Stat({ label, value, sub, href, accent = "gold" }: { label: string; value: string | number; sub?: string; href?: string; accent?: "gold" | "pink" }) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow text-stone">{label}</p>
        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${accent === "pink" ? "bg-pink" : "bg-gold"}`} />
      </div>
      <p className="mt-2.5 font-display text-[34px] leading-none text-ivory tabular-nums">{value}</p>
      {sub && <p className="mt-2 text-[12px] text-ash">{sub}</p>}
    </>
  );
  const cls = "block rounded-[var(--radius-lg)] border border-line bg-ink-2/90 p-5 shadow-[0_14px_36px_-20px_rgba(0,0,0,0.85)] transition-colors";
  return href ? (
    <Link href={href} className={`${cls} hover:border-gold/45`}>{inner}</Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export default async function StudioOverviewPage() {
  const viewer = await requireViewer("club.discover");
  if (viewer.role !== "creator") notFound();

  const [a, posts, blasts, earnings, onboarding, conversations] = await Promise.all([
    myAnalytics(viewer),
    myPosts(viewer),
    myBlasts(viewer),
    myEarnings(viewer),
    getOnboarding(viewer),
    myCreatorConversations(viewer),
  ]);
  const unread = conversations.filter((c) => c.unread).length;
  const verified = onboarding.verification.status === "verified";
  const scheduled = a.posts.scheduled + blasts.filter((b) => b.status === "scheduled").length;

  const checks = [
    { label: "Email confirmed", done: viewer.emailVerified === true, href: "/account/security" },
    { label: "Two-step sign-in", done: viewer.mfa === "verified" || viewer.aal === 2, href: "/account/security" },
    { label: "Profile saved", done: !!onboarding.profile, href: "/studio/settings" },
    { label: "Membership tier added", done: a.tiers.length > 0, href: "/studio/tiers" },
    { label: "First post published", done: a.posts.published > 0, href: "/studio/posts/new" },
    { label: "Verified by the house", done: verified, href: "/studio/settings" },
  ];
  const doneCount = checks.filter((c) => c.done).length;
  const handle = onboarding.profile?.handle;
  const profileUrl = handle ? `https://www.divafans.io/c/${handle}` : null;
  const publicCreatorName = formatCreatorPublicName(onboarding.profile?.displayName ?? viewer.alias);
  const needsNamePrompt = !onboarding.profile || onboarding.profile.needsNameSetup;

  return (
    <div className="mx-auto max-w-[1100px] px-5 pb-28 pt-6 md:px-10 md:pt-8">
      <StudioHeader
        eyebrow="Studio"
        title="Overview"
        lede={
          <>
            Signed in as <span className="text-ivory">{publicCreatorName}</span>
            {verified ? " · verified" : " · verification in progress"}. Numbers below come from your own data — never fan identities.
          </>
        }
        actions={
          <>
            <Button href="/studio/blasts" variant="outline">Send a Blast</Button>
            <Button href="/studio/posts/new">New post</Button>
          </>
        }
      />

      {needsNamePrompt && (
        <section
          aria-label="Creator name setup required"
          className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-gold/45 bg-ink-2 p-5"
        >
          <div>
            <p className="eyebrow text-gold">Creator identity</p>
            <h2 className="mt-1 font-display text-[22px] text-ivory">Choose your public Diva name</h2>
            <p className="mt-1 text-[14px] text-stone">
              Every creator on DivaFans appears publicly as <strong className="text-ivory">Diva [your name]</strong>. Confirm your chosen name in Settings before publishing.
            </p>
          </div>
          <Button href="/studio/settings">Choose creator name</Button>
        </section>
      )}

      <section aria-label="Key numbers" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active members" value={a.members.active} sub={`${a.members.vip} VIP`} href="/studio/analytics" accent="gold" />
        <Stat label="New members" value={a.members.new30} sub="Last 30 days" href="/studio/analytics" accent="pink" />
        <Stat label="Followers" value={a.followers.total} sub={`${a.followers.new30} new in 30 days`} href="/studio/analytics" accent="gold" />
        <Stat label="Published posts" value={a.posts.published} sub={`${a.posts.draft} draft · ${a.posts.scheduled} scheduled`} href="/studio/posts" accent="pink" />
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <section aria-labelledby="content-h" className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-8">
            <div className="flex items-center justify-between gap-3">
              <h2 id="content-h" className="text-[18px] font-medium text-ivory">Recent content</h2>
              <Link href="/studio/posts" className="text-[13px] text-gold underline decoration-gold/40 underline-offset-4">All posts</Link>
            </div>
            {posts.length === 0 ? (
              <p className="mt-4 text-[14px] text-ash">No posts yet. <Link href="/studio/posts/new" className="text-gold underline decoration-gold/40 underline-offset-4">Write your first post</Link>.</p>
            ) : (
              <ul className="mt-4 divide-y divide-line">
                {posts.slice(0, 5).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge tone={STATE_TONE[p.state]}>{p.state}</Badge>
                        {p.hidden && <Badge tone="live">Hidden</Badge>}
                      </div>
                      <p className="mt-1.5 truncate text-[14px] text-ivory">{p.teaser}</p>
                    </div>
                    <Link href={`/studio/posts/${p.id}`} className="shrink-0 text-[13px] text-gold underline decoration-gold/40 underline-offset-4">Edit</Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="blasts-h" className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-8">
            <div className="flex items-center justify-between gap-3">
              <h2 id="blasts-h" className="text-[18px] font-medium text-ivory">Recent Blasts</h2>
              <Link href="/studio/blasts" className="text-[13px] text-gold underline decoration-gold/40 underline-offset-4">All Blasts</Link>
            </div>
            {blasts.length === 0 ? (
              <p className="mt-4 text-[14px] text-ash">No Blasts yet. <Link href="/studio/blasts" className="text-gold underline decoration-gold/40 underline-offset-4">Write one</Link>.</p>
            ) : (
              <ul className="mt-4 divide-y divide-line">
                {blasts.slice(0, 4).map((b) => (
                  <li key={b.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={b.status === "sent" ? "vip" : b.status === "canceled" ? "locked" : "member"}>{b.status}</Badge>
                      <span className="text-[12px] text-ash">{b.status === "scheduled" ? `Sends ${when(b.scheduledAt)}` : when(b.scheduledAt)}</span>
                    </div>
                    <p className="mt-1.5 line-clamp-1 text-[14px] text-ivory">{b.body}</p>
                    {(b.status === "sent" || b.status === "sending") && (
                      <p className="mt-1 text-[12px] text-stone">{b.delivered} delivered · {b.read} read · {b.replies} replied</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6 lg:col-span-4">
          <section aria-labelledby="setup-h" className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 id="setup-h" className="text-[18px] font-medium text-ivory">Get set up</h2>
              <span className="text-[13px] tabular-nums text-stone">{doneCount}/{checks.length}</span>
            </div>
            <ul className="mt-4 space-y-2">
              {checks.map((c) => (
                <li key={c.label}>
                  <Link href={c.href} className="flex items-center gap-2.5 text-[14px]">
                    <span aria-hidden className={c.done ? "text-gold" : "text-ash"}>{c.done ? "●" : "○"}</span>
                    <span className={c.done ? "text-stone line-through decoration-line-strong" : "text-ivory"}>{c.label}</span>
                    <span className="sr-only">{c.done ? "done" : "not done"}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {profileUrl && (
              <div className="mt-5 border-t border-line pt-4">
                <p className="eyebrow text-stone">Your profile link</p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-[var(--radius-sm)] bg-ink px-2.5 py-1.5 text-[12px] text-stone">{profileUrl}</code>
                  <CopyLink url={profileUrl} label="Copy" />
                </div>
              </div>
            )}
          </section>

          <section aria-labelledby="earn-h" className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6">
            <h2 id="earn-h" className="text-[18px] font-medium text-ivory">Earnings</h2>
            {!earnings.paymentsEnabled ? (
              <p className="mt-3 text-[14px] leading-relaxed text-stone">
                Payments aren&apos;t active yet, so nobody is charged and there is no income to show. When they open, your balances, transactions and payouts appear in <Link href="/studio/earnings" className="text-gold underline decoration-gold/40 underline-offset-4">Earnings</Link>.
              </p>
            ) : (
              <p className="mt-3 text-[14px] text-stone">See balances and history in <Link href="/studio/earnings" className="text-gold underline decoration-gold/40 underline-offset-4">Earnings</Link>.</p>
            )}
          </section>

          <section aria-labelledby="msg-h" className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6">
            <h2 id="msg-h" className="text-[18px] font-medium text-ivory">Inbox</h2>
            <p className="mt-3 text-[14px] text-stone">
              {unread > 0 ? <><span className="text-ivory">{unread}</span> unread member conversation{unread === 1 ? "" : "s"}.</> : "You're all caught up."}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button href="/studio/messaging" variant="outline" size="sm">Open Studio Inbox</Button>
              {scheduled > 0 && <span className="text-[12px] text-ash">{scheduled} scheduled</span>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

