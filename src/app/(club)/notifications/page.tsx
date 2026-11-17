import type { Metadata } from "next";
import Link from "next/link";
import { NotificationList } from "@/components/fan/NotificationList";
import { requireViewer } from "@/server/auth/request";
import { myNotifications, type NotificationKind } from "@/server/services/notifications";

export const metadata: Metadata = { title: "Notifications" };

const KINDS: NotificationKind[] = [
  "post.published",
  "message.received",
  "tip.received",
  "subscription.started",
  "payment.succeeded",
  "referral.commission",
  "payout.available",
  "security.alert",
];

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; unread?: string }>;
}) {
  const viewer = await requireViewer("club.discover");
  const sp = await searchParams;
  const kind = KINDS.includes(sp.kind as NotificationKind) ? (sp.kind as NotificationKind) : undefined;
  const items = await myNotifications(viewer, { limit: 100, unreadOnly: sp.unread === "1", kind });
  return (
    <div className="mx-auto max-w-[800px] px-5 pb-28 pt-14 md:px-10 md:pt-20">
      <p className="eyebrow mb-5">Inbox</p>
      <h1 className="font-display text-[48px] leading-[0.98] tracking-[-0.03em] text-ivory md:text-[72px]">Notifications</h1>
      <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-stone">New posts from creators you follow or belong to, and updates from the house. Nothing about your activity is shared with creators.</p>
      <nav aria-label="Notification filters" className="mt-6 flex flex-wrap gap-2">
        <Link href="/notifications" className="rounded-full border border-line px-3 py-1 text-[13px] text-stone">All</Link>
        <Link href="/notifications?unread=1" className="rounded-full border border-line px-3 py-1 text-[13px] text-stone">Unread</Link>
        {KINDS.map((k) => (
          <Link key={k} href={`/notifications?kind=${k}`} className="rounded-full border border-line px-3 py-1 text-[13px] text-stone">
            {k}
          </Link>
        ))}
      </nav>
      <div className="mt-10">
        {items.length === 0 ? <p className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-8 text-[15px] text-stone">Nothing yet.</p> : <NotificationList items={items} />}
      </div>
    </div>
  );
}
