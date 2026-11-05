"use client";

import { useActionState } from "react";
import { FormMessage, Submit } from "@/components/forms";
import { idle } from "@/lib/forms";
import { openConversationAction } from "@/server/actions/messaging";

/** "Message" button: opens (or finds) the conversation, then navigates to it. */
export function StartConversation({ userId, label = "Message", name, variant = "outline" }: { userId: string; label?: string; name: string; variant?: "gold" | "outline" | "ghost" }) {
  const [state, action] = useActionState(openConversationAction, idle);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="userId" value={userId} />
      <Submit variant={variant}>{label}<span className="sr-only"> {name}</span></Submit>
      <FormMessage state={state} />
    </form>
  );
}
