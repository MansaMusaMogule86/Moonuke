"use client";

import { useActionState } from "react";
import { FormMessage, Submit } from "@/components/forms";
import { Field } from "@/components/ui/Field";
import { idle } from "@/lib/forms";
import { decideAppealAction } from "@/server/actions/blasts";

export function DecideAppeal({ id }: { id: string }) {
  const [state, action] = useActionState(decideAppealAction, idle);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <Field label="Note to the member (optional)" name="note" maxLength={500} />
      <div className="flex flex-wrap gap-2">
        <Submit name="decision" value="overturn" variant="outline" className="h-10 px-4 text-[13px]">Overturn and lift</Submit>
        <Submit name="decision" value="uphold" variant="ghost" className="h-10 px-4 text-[13px]">Uphold</Submit>
      </div>
    </form>
  );
}
