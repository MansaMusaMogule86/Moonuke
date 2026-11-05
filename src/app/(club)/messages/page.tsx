import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Portrait } from "@/components/ui/Portrait";
import { cn } from "@/lib/cn";
import { requireViewer } from "@/server/auth/request";
import { myConversations } from "@/server/services/messaging";

export const metadata: Metadata = { title: "Messages" };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");

export default async function MessagesPage() {
  const viewer = await requireViewer("club.discover");
  if (viewer.role !== "member" && viewer.role !== "creator") notFound();
  const list = await myConversations(viewer);
  return (
    <div className="mx-auto max-w-[860px] px-5 pb-28 pt-14 md:px-10 md:pt-20">
      <p className="eyebrow mb-5">Private</p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-[48px] leading-[0.98] tracking-[-0.03em] text-ivory md:text-[72px]">Messages</h1>
        {viewer.role === "creator" && <Button href="/messages/new" variant="outline">Message a member</Button>}
      </div>
      <p className="mt-5 max-w-2xl text-[14px] leading-relaxed text-stone">
        Conversations between members and the creators they belong to. Messages are private to the two of you and stored securely on our servers; they are not end-to-end encrypted. The house can only read a message if it&apos;s reported.
      </p>
      {list.length === 0 ? (
        <p className="mt-10 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-8 text-[15px] text-stone">
          {viewer.role === "creator" ? "No conversations yet." : "No conversations yet. Members can message the creators they belong to from their profile."}
        </p>
      ) : (
        <ul className="mt-10 divide-y divide-line border-y border-line" aria-label="Conversations">
          {list.map((c) => (
            <li key={c.id}>
              <Link href={`/messages/${c.id}`} className="flex items-center gap-4 rounded-[var(--radius-md)] px-1 py-4 hover:bg-ink-2">
                {c.peer.cover ? (
                  <Portrait alt="" study={c.peer.cover} className="h-12 w-12 shrink-0 rounded-full border border-line" />
                ) : (
                  <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-line-strong font-display text-[18px] text-gold-soft">{c.peer.name.slice(0, 1)}</span>
                )}
                <span className="min-w-0 flex-1">
                  <span className={cn("flex items-center gap-2 text-[15px]", c.unread ? "text-ivory" : "text-stone")}>
                    {c.unread && <span aria-hidden className="h-2 w-2 rounded-full bg-gold" />}
                    {c.unread && <span className="sr-only">Unread: </span>}
                    <span className="truncate">{c.peer.name}</span>
                    {c.muted && <Badge tone="neutral">Muted</Badge>}
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] text-ash">{c.preview ?? "No messages yet"}</span>
                </span>
                <span className="shrink-0 text-[12px] text-ash">{when(c.lastMessageAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
