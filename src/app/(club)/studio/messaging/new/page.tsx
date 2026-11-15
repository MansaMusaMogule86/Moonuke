import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StartConversation } from "@/components/messaging/StartConversation";
import { StudioHeader } from "@/components/studio/StudioHeader";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { myMembersToMessage } from "@/server/services/messaging";

export const metadata: Metadata = { title: "Message a Member · Creator Studio" };

export default async function StudioNewConversationPage() {
  const viewer = await requireViewer("club.discover");
  if (viewer.role !== "creator") notFound();
  const members = await myMembersToMessage(viewer);

  return (
    <div className="mx-auto max-w-[860px] px-5 pb-28 pt-6 md:px-10 md:pt-8">
      <Link
        href="/studio/messaging"
        className="text-[13px] text-stone underline decoration-line-strong underline-offset-4 hover:text-ivory"
      >
        ← Studio Inbox
      </Link>
      <div className="mt-4">
        <StudioHeader
          eyebrow="Creator Studio · Member Inbox"
          title="Message a member"
          lede="Start a private conversation with any of your current members. Members are shown by their fan alias."
        />
      </div>
      {members.length === 0 ? (
        <p className="mt-8 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-8 text-[15px] text-stone">
          No current members yet.
        </p>
      ) : (
        <ul className="mt-8 divide-y divide-line border-y border-line" aria-label="Current members">
          {members.map((m) => (
            <li key={m.fan_id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <span className="flex items-center gap-3 text-[15px] text-ivory">
                {m.alias}
                <Badge tone={m.tier_kind === "vip" ? "vip" : "member"}>
                  {m.tier_kind === "vip" ? "VIP" : "Member"}
                </Badge>
              </span>
              <StartConversation userId={m.fan_id} name={m.alias} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

