import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Portrait } from "@/components/ui/Portrait";
import { cn } from "@/lib/cn";
import { requireViewer } from "@/server/auth/request";
import { myConversations } from "@/server/services/messaging";
import { myMessagingPause } from "@/server/services/blasts";
import { PauseBanner } from "@/components/messaging/PauseBanner";

export const metadata: Metadata = { title: "Messages" };

type SP = Promise<Record<string, string | string[] | undefined>>;

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");

export default async function MessagesPage({ searchParams }: { searchParams?: SP }) {
  const viewer = await requireViewer("club.discover");
  if (viewer.role !== "member" && viewer.role !== "creator") notFound();
  const rawSp = searchParams ? await searchParams : {};
  const qRaw = Array.isArray(rawSp.q) ? rawSp.q[0] : rawSp.q;
  const q = (qRaw ?? "").trim();

  const list = await myConversations(viewer);
  const pause = await myMessagingPause(viewer);
  const unreadTotal = list.filter((c) => c.unread).length;

  const filtered = q
    ? list.filter(
        (c) =>
          c.peer.name.toLowerCase().includes(q.toLowerCase()) ||
          (c.peer.handle && c.peer.handle.toLowerCase().includes(q.toLowerCase())) ||
          (c.preview && c.preview.toLowerCase().includes(q.toLowerCase())),
      )
    : list;

  return (
    <div className="mx-auto max-w-[900px] px-5 pb-28 pt-10 md:px-10 md:pt-14">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div>
          <p className="eyebrow mb-2">Private Conversations</p>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-[42px] leading-[0.98] tracking-[-0.03em] text-ivory md:text-[60px]">
              Messages
            </h1>
            {unreadTotal > 0 && (
              <span className="rounded-full bg-gold px-3 py-1 text-[12px] font-semibold text-ink">
                {unreadTotal} unread
              </span>
            )}
          </div>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-stone">
            Direct conversations with Diva creators and unlockable exclusive messages.
          </p>
        </div>
        {viewer.role === "creator" && (
          <Button href="/messages/new" variant="outline">
            Message a member
          </Button>
        )}
      </div>

      {pause && (
        <PauseBanner
          pause={{
            id: pause.id,
            until: new Date(pause.until).toISOString(),
            reason: pause.reason,
            appealStatus: pause.appeal_status,
            decisionNote: pause.decision_note,
          }}
        />
      )}

      {list.length > 0 && (
        <form role="search" action="/messages" className="mt-6 flex items-center gap-3">
          <label htmlFor="conv-q" className="sr-only">
            Search conversations
          </label>
          <input
            id="conv-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search conversations by Diva name, @handle, or preview…"
            className="h-11 flex-1 rounded-full border border-line-strong bg-obsidian/60 px-4 text-[14px] text-ivory placeholder:text-ash focus:border-gold focus:outline-none"
          />
          <button
            type="submit"
            className="h-11 rounded-full border border-line-strong px-5 text-[13px] text-ivory hover:border-gold/50"
          >
            Search
          </button>
          {q && (
            <Link
              href="/messages"
              className="text-[13px] text-stone underline underline-offset-4 hover:text-ivory"
            >
              Clear
            </Link>
          )}
        </form>
      )}

      {list.length === 0 ? (
        <div className="mt-8 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-8 text-[15px] text-stone">
          <p className="font-display text-[24px] text-ivory">No conversations yet.</p>
          <p className="mt-2 text-[14px] text-stone">
            {viewer.role === "creator"
              ? "Start a conversation with any of your active members."
              : "Subscribe to a Diva creator to open a private conversation and receive exclusive messages."}
          </p>
          {viewer.role !== "creator" && (
            <Link
              href="/discover"
              className="mt-5 inline-flex h-10 items-center rounded-full bg-gold px-5 text-[13px] font-medium text-ink hover:bg-gold-soft"
            >
              Explore creators
            </Link>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <p className="mt-8 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-8 text-[15px] text-stone">
          No conversations match &ldquo;{q}&rdquo;.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-[var(--radius-lg)] border border-line bg-obsidian/45" aria-label="Conversations">
          {filtered.map((c) => (
            <li key={c.id}>
              <Link
                href={`/messages/${c.id}`}
                className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-ink-2/80"
              >
                {c.peer.cover ? (
                  <Portrait
                    alt={c.peer.name}
                    study={c.peer.cover}
                    className="h-12 w-12 shrink-0 rounded-full border border-line-strong"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-line-strong font-display text-[18px] text-gold-soft"
                  >
                    {c.peer.name.replace(/^Diva\s+/i, "").slice(0, 1)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className={cn("flex flex-wrap items-center gap-2 text-[15px]", c.unread ? "font-medium text-ivory" : "text-ivory/90")}>
                    {c.unread && <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-gold" />}
                    {c.unread && <span className="sr-only">Unread: </span>}
                    <span className="truncate font-display text-[19px]">{c.peer.name}</span>
                    {c.peer.handle && <span className="text-[12px] text-stone">@{c.peer.handle}</span>}
                    {c.muted && <Badge tone="neutral">Muted</Badge>}
                  </span>
                  <span className={cn("mt-0.5 block truncate text-[13px]", c.unread ? "text-ivory" : "text-stone")}>
                    {c.preview ?? "No messages yet"}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[12px] text-ash">{when(c.lastMessageAt)}</span>
                  {c.unread && (
                    <span className="mt-1 inline-block rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-gold-soft">
                      New
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
