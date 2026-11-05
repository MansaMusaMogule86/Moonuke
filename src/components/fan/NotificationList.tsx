"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useOptimistic, startTransition } from "react";
import { FormMessage, Submit } from "@/components/forms";
import { Portrait } from "@/components/ui/Portrait";
import { cn } from "@/lib/cn";
import { idle } from "@/lib/forms";
import { notificationReadAction } from "@/server/actions/fan";
import type { FanNotification } from "@/server/services/notifications";

const when = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

export function NotificationList({ items }: { items: FanNotification[] }) {
  const router = useRouter();
  const [allState, allAction] = useActionState(notificationReadAction, idle);
  const [readIds, markLocal] = useOptimistic<Set<string>, string>(new Set(items.filter((i) => i.read).map((i) => i.id)), (s, id) => new Set(s).add(id));
  const allRead = allState.data?.all === "1";
  const unread = items.filter((i) => !(allRead || readIds.has(i.id))).length;

  const open = (n: FanNotification) => {
    if (!n.read && !readIds.has(n.id)) {
      const fd = new FormData();
      fd.set("id", n.id);
      startTransition(async () => {
        markLocal(n.id);
        await notificationReadAction(idle, fd);
      });
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] text-stone" aria-live="polite">{unread ? `${unread} unread` : "All caught up"}</p>
        {unread > 0 && !allRead && (
          <form action={allAction}>
            <input type="hidden" name="intent" value="all" />
            <Submit variant="ghost" className="h-10 px-4 text-[13px]">Mark all as read</Submit>
          </form>
        )}
        {allRead && <button type="button" onClick={() => router.refresh()} className="text-[13px] text-gold underline decoration-gold/40 underline-offset-4">Refresh</button>}
      </div>
      <FormMessage state={allState} className="mt-4" />
      <ul className="mt-6 divide-y divide-line border-y border-line" aria-label="Notifications">
        {items.map((n) => {
          const isUnread = !(allRead || readIds.has(n.id) || n.read);
          const body = (
            <div className="flex items-start gap-4 py-4">
              {n.creator ? (
                <Portrait alt="" study={n.creator.cover} className="h-11 w-11 shrink-0 rounded-full border border-line" />
              ) : (
                <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-gold/40 text-gold">✦</span>
              )}
              <div className="min-w-0 flex-1">
                <p className={cn("text-[15px]", isUnread ? "text-ivory" : "text-stone")}>
                  {isUnread && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-gold align-middle" aria-hidden />}
                  {isUnread && <span className="sr-only">Unread: </span>}
                  {n.title}
                </p>
                {n.detail && <p className="mt-1 truncate text-[13px] text-ash">{n.detail}</p>}
              </div>
              <time dateTime={n.at} className="shrink-0 text-[12px] text-ash">{when(n.at)}</time>
            </div>
          );
          return (
            <li key={n.id}>
              {n.href ? (
                <Link href={n.href} onClick={() => open(n)} className="block rounded-[var(--radius-md)] px-1 hover:bg-ink-2">{body}</Link>
              ) : (
                <button type="button" onClick={() => open(n)} className="block w-full rounded-[var(--radius-md)] px-1 text-left hover:bg-ink-2">{body}</button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
