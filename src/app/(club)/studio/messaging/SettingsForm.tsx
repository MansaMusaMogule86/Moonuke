"use client";

import { useActionState } from "react";
import { Check, FormMessage, Submit } from "@/components/forms";
import { idle } from "@/lib/forms";
import { messagingSettingsAction } from "@/server/actions/messaging";
import type { MessagingSettings } from "@/server/services/messaging";

export function MessagingSettingsForm({ s }: { s: MessagingSettings }) {
  const [state, action] = useActionState(messagingSettingsAction, idle);
  const on = state.values ? state.values.membersCanMessage === "on" : s.membersCanMessage;
  return (
    <form action={action} className="space-y-6">
      <FormMessage state={state} />
      <Check name="membersCanMessage" defaultChecked={on}>Current members can start conversations with me</Check>
      <fieldset disabled aria-describedby="requests-help" className="space-y-2 opacity-60">
        <legend className="eyebrow mb-2 text-stone">Paid message requests from non-members</legend>
        <label className="flex items-center gap-3 text-[15px] text-ivory">
          <input type="checkbox" disabled className="h-4 w-4" /> Accept paid message requests
        </label>
        <p id="requests-help" className="text-[13px] text-ash">Not available yet: payments aren&apos;t active. This will unlock once a payment provider is approved.</p>
      </fieldset>
      <Submit>Save</Submit>
    </form>
  );
}
