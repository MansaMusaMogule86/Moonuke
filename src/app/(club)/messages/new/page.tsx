import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StartConversation } from "@/components/messaging/StartConversation";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { myMembersToMessage } from "@/server/services/messaging";

export const metadata: Metadata = { title: "Message a member" };

export default async function NewConversationPage() {
  const viewer = await requireViewer("club.discover");
  if (viewer.role !== "creator") notFound();
  const members = await myMembersToMessage(viewer);
  return (
    <div className="mx-auto max-w-[860px] px-5 pb-28 pt-14 md:px-10 md:pt-20">
      <Link href="/messages" className="text-[13px] text-stone underline decoration-line-strong underline-offset-4 hover:text-ivory">← Messages</Link>
      <h1 className="mt-6 font-display text-[44px] leading-none tracking-[-0.03em] text-ivory md:text-[60px]">Message a member</h1>
      <p className="mt-4 max-w-2xl text-[14px] text-stone">You can start a conversation with current members. Members you&apos;ve blocked, or who blocked you, aren&apos;t listed.</p>
      {members.length === 0 ? (
        <p className="mt-10 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-8 text-[15px] text-stone">No current members yet.</p>
      ) : (
        <ul className="mt-10 divide-y divide-line border-y border-line" aria-label="Current members">
          {members.map((m) => (
            <li key={m.fan_id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <span className="flex items-center gap-3 text-[15px] text-ivory">
                {m.alias}
                <Badge tone={m.tier_kind === "vip" ? "vip" : "member"}>{m.tier_kind === "vip" ? "VIP" : "Member"}</Badge>
              </span>
              <StartConversation userId={m.fan_id} name={m.alias} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
