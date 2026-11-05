"use client";

import { useActionState } from "react";
import { Submit } from "@/components/forms";
import { idle } from "@/lib/forms";
import { blastOptOutAction } from "@/server/actions/blasts";

export function BlastOptOut({ creatorId, optedOut }: { creatorId: string; optedOut: boolean }) {
  const [state, action] = useActionState(blastOptOutAction, idle);
  const off = state.data?.optedOut ? state.data.optedOut === "1" : optedOut;
  return (
    <form action={action}>
      <input type="hidden" name="creatorId" value={creatorId} />
      <Submit name="intent" value={off ? "optin" : "optout"} variant="ghost" className="h-9 px-3 text-[13px]">{off ? "Allow broadcasts" : "Stop broadcasts"}</Submit>
    </form>
  );
}
