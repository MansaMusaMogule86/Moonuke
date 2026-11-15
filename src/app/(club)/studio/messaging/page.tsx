import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StudioHeader } from "@/components/studio/StudioHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { requireViewer } from "@/server/auth/request";
import { myCreatorConversations, mySettings } from "@/server/services/messaging";
import { MessagingSettingsForm } from "./SettingsForm";

export const metadata: Metadata = { title: "Inbox · Creator Studio" };

type SP = Promise<Record<string, string | string[] | undefined>>;

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";

export default async function StudioMessagingPage({ searchParams }: { searchParams?: SP }) {
  const viewer = await requireViewer("club.discover");
  if (viewer.role !== "creator") notFound();

  const rawSp = searchParams ? await searchParams : {};
  const qRaw = Array.isArray(rawSp.q) ? rawSp.q[0] : rawSp.q;
  const q = (qRaw ?? "").trim();

  const [list, s] = await Promise.all([myCreatorConversations(viewer), mySettings(viewer)]);
  const unreadTotal = list.filter((c) => c.unread).length;

  const filtered = q
    ? list.filter(
        (c) =>
          c.peer.name.toLowerCase().includes(q.toLowerCase()) ||
          (c.preview && c.preview.toLowerCase().includes(q.toLowerCase())),
      )
    : list;

  return (
    <div className="mx-auto max-w-[960px] px-5 pb-28 pt-6 md:px-10 md:pt-8">
      <StudioHeader
        eyebrow="Creator Studio · Member Inbox"
        title="Inbox"
        lede="Manage conversations with your active members and followers, send exclusive paid messages, or configure inbox access."
        actions={
          <Button href="/studio/messaging/new" variant="outline">
            Message a member
          </Button>
        }
      />

      {unreadTotal > 0 && (
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-gold/45 bg-gold/[0.12] px-3.5 py-1 text-[12px] font-medium text-gold-soft">
          <span className="h-2 w-2 rounded-full bg-gold" aria-hidden />
          <span>{unreadTotal} unread member conversation{unreadTotal === 1 ? "" : "s"}</span>
        </div>
      )}

      {list.length > 0 && (
        <form role="search" action="/studio/messaging" className="mt-6 flex items-center gap-3">
          <label htmlFor="studio-conv-q" className="sr-only">
            Search member conversations
          </label>
          <input
            id="studio-conv-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search member conversations by fan alias or message preview…"
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
              href="/studio/messaging"
              className="text-[13px] text-stone underline underline-offset-4 hover:text-ivory"
            >
              Clear
            </Link>
          )}
        </form>
      )}

      <section aria-labelledby="studio-inbox-h" className="mt-6">
        <h2 id="studio-inbox-h" className="sr-only">
          Member conversations
        </h2>
        {list.length === 0 ? (
          <div className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-8 text-[15px] text-stone">
            <p className="font-display text-[24px] text-ivory">No member conversations yet.</p>
            <p className="mt-2 text-[14px] text-stone">
              Start a conversation with any of your active members or send a Blast to your audience.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button href="/studio/messaging/new" size="sm">
                Message a member
              </Button>
              <Button href="/studio/blasts" variant="outline" size="sm">
                Send a Blast
              </Button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <p className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-8 text-[15px] text-stone">
            No member conversations match &ldquo;{q}&rdquo;.
          </p>
        ) : (
          <ul
            className="divide-y divide-line rounded-[var(--radius-lg)] border border-line bg-obsidian/45"
            aria-label="Member conversations"
          >
            {filtered.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/studio/messaging/${c.id}`}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-ink-2/80"
                >
                  <span
                    aria-hidden
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-line-strong font-display text-[18px] text-gold-soft"
                  >
                    {c.peer.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "flex flex-wrap items-center gap-2 text-[15px]",
                        c.unread ? "font-medium text-ivory" : "text-ivory/90",
                      )}
                    >
                      {c.unread && <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-gold" />}
                      {c.unread && <span className="sr-only">Unread: </span>}
                      <span className="truncate font-display text-[19px]">{c.peer.name}</span>
                      <Badge tone="member">Fan</Badge>
                      {c.muted && <Badge tone="neutral">Muted</Badge>}
                      {c.restricted && <Badge tone="locked">Paused</Badge>}
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 block truncate text-[13px]",
                        c.unread ? "text-ivory" : "text-stone",
                      )}
                    >
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
      </section>

      <section
        aria-labelledby="inbox-settings-h"
        className="mt-10 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-9"
      >
        <h2 id="inbox-settings-h" className="font-display text-[24px] text-ivory">
          Inbox access settings
        </h2>
        <p className="mt-1.5 text-[13px] text-stone">
          Control whether active subscribers can initiate direct conversations with you.
        </p>
        <div className="mt-5">
          <MessagingSettingsForm s={s} />
        </div>
      </section>
    </div>
  );
}
