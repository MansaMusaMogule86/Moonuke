import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BlockButton } from "@/components/club/SafetyButtons";
import { ConversationControls } from "@/components/messaging/ConversationControls";
import { Thread } from "@/components/messaging/Thread";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { CAN_SEND_COPY, conversationMessages, getConversation } from "@/server/services/messaging";
import { uuid } from "@/server/validation";

export const metadata: Metadata = { title: "Member Conversation · Creator Studio" };

export default async function StudioConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await requireViewer("club.discover");
  if (viewer.role !== "creator") notFound();
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();

  const c = await getConversation(viewer, id);
  if (!c) notFound();
  // If this conversation belongs to the account's Fan View side, open it in Fan View
  if (c.side === "fan") {
    redirect(`/messages/${id}`);
  }

  const messages = await conversationMessages(viewer, id);
  return (
    <div className="mx-auto max-w-[860px] px-5 pb-10 pt-6 md:px-10 md:pt-8">
      <Link
        href="/studio/messaging"
        className="text-[13px] text-stone underline decoration-line-strong underline-offset-4 hover:text-ivory"
      >
        ← Studio Inbox
      </Link>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-[32px] leading-none text-ivory md:text-[40px]">
            {c.peer.name}
          </h1>
          <Badge tone="member">Fan</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ConversationControls id={c.id} side="creator" muted={c.muted} restricted={c.restricted} />
          <BlockButton targetUserId={c.peer.id} name={c.peer.name} />
        </div>
      </div>
      <Thread
        conversationId={c.id}
        initial={messages}
        canSend={c.canSend === "ok"}
        blockedReason={c.canSend === "ok" ? null : CAN_SEND_COPY[c.canSend]}
        peerName={c.peer.name}
        side="creator"
      />
    </div>
  );
}

