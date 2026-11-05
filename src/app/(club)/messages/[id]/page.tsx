import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlockButton } from "@/components/club/SafetyButtons";
import { ConversationControls } from "@/components/messaging/ConversationControls";
import { Thread } from "@/components/messaging/Thread";
import { BlastOptOut } from "@/components/messaging/BlastOptOut";
import { isOptedOut } from "@/server/services/blasts";
import { requireViewer } from "@/server/auth/request";
import { CAN_SEND_COPY, conversationMessages, getConversation } from "@/server/services/messaging";
import { uuid } from "@/server/validation";

export const metadata: Metadata = { title: "Conversation" };

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer("club.discover");
  if (viewer.role !== "member" && viewer.role !== "creator") notFound();
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const c = await getConversation(viewer, id);
  if (!c) notFound();
  const messages = await conversationMessages(viewer, id);
  return (
    <div className="mx-auto max-w-[860px] px-5 pb-10 pt-10 md:px-10 md:pt-14">
      <Link href="/messages" className="text-[13px] text-stone underline decoration-line-strong underline-offset-4 hover:text-ivory">← Messages</Link>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <h1 className="font-display text-[32px] leading-none text-ivory md:text-[40px]">
          {c.peer.handle ? <Link href={`/c/${c.peer.handle}`} className="hover:text-gold-soft">{c.peer.name}</Link> : c.peer.name}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <ConversationControls id={c.id} side={c.side} muted={c.muted} restricted={c.restricted} />
          {c.side === "fan" && <BlastOptOut creatorId={c.peer.id} optedOut={await isOptedOut(viewer, c.peer.id)} />}
          <BlockButton targetUserId={c.peer.id} name={c.peer.name} />
        </div>
      </div>
      <Thread
        conversationId={c.id}
        initial={messages}
        canSend={c.canSend === "ok"}
        blockedReason={c.canSend === "ok" ? null : CAN_SEND_COPY[c.canSend]}
        peerName={c.peer.name}
      />
    </div>
  );
}
