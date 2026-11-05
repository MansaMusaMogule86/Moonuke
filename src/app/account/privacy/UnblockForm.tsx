"use client";

import { useActionState } from "react";
import { Submit } from "@/components/forms";
import { idle } from "@/lib/forms";
import { unblockAction } from "@/server/actions/safety";

export function UnblockForm({ id, name }: { id: string; name: string }) {
  const [state, action] = useActionState(unblockAction, idle);
  if (state.status === "success") return <p role="status" className="text-[13px] text-gold-soft">Unblocked</p>;
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Submit variant="outline" className="h-9 px-4 text-[13px]">
        Unblock<span className="sr-only"> {name}</span>
      </Submit>
      {state.status === "error" && <span role="alert" className="text-[12px] text-danger">{state.message}</span>}
    </form>
  );
}
