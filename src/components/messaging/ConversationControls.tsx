"use client";

import { useActionState } from "react";
import { FormMessage, Submit } from "@/components/forms";
import { idle } from "@/lib/forms";
import { conversationFlagsAction } from "@/server/actions/messaging";

export function ConversationControls({ id, side, muted, restricted }: { id: string; side: "fan" | "creator"; muted: boolean; restricted: boolean }) {
  const [state, action] = useActionState(conversationFlagsAction, idle);
  const intent = state.data?.intent;
  const isMuted = intent === "mute" ? true : intent === "unmute" ? false : muted;
  const isRestricted = intent === "restrict" ? true : intent === "unrestrict" ? false : restricted;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="conversationId" value={id} />
      <Submit name="intent" value={isMuted ? "unmute" : "mute"} variant="ghost" className="h-9 px-3 text-[13px]">{isMuted ? "Unmute" : "Mute"}</Submit>
      {side === "creator" && (
        <Submit name="intent" value={isRestricted ? "unrestrict" : "restrict"} variant="ghost" className="h-9 px-3 text-[13px]">{isRestricted ? "Allow messages" : "Restrict"}</Submit>
      )}
      <FormMessage state={state} className="w-full" />
    </form>
  );
}
