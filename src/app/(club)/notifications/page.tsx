import type { Metadata } from "next";
import { NotificationList } from "@/components/fan/NotificationList";
import { requireViewer } from "@/server/auth/request";
import { myNotifications } from "@/server/services/notifications";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const viewer = await requireViewer("club.discover");
  const items = await myNotifications(viewer, { limit: 100 });
  return (
    <div className="mx-auto max-w-[800px] px-5 pb-28 pt-14 md:px-10 md:pt-20">
      <p className="eyebrow mb-5">Inbox</p>
      <h1 className="font-display text-[48px] leading-[0.98] tracking-[-0.03em] text-ivory md:text-[72px]">Notifications</h1>
      <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-stone">New posts from creators you follow or belong to, and updates from the house. Nothing about your activity is shared with creators.</p>
      <div className="mt-10">
        {items.length === 0 ? <p className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-8 text-[15px] text-stone">Nothing yet.</p> : <NotificationList items={items} />}
      </div>
    </div>
  );
}
