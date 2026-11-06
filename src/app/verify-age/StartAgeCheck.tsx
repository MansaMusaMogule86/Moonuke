"use client";

import { useActionState } from "react";
import { FormMessage, Submit } from "@/components/forms";
import { idle } from "@/lib/forms";
import { startAgeCheckAction } from "@/server/actions/access";

export function StartAgeCheck() {
  const [state, action] = useActionState(startAgeCheckAction, idle);
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <Submit className="w-full">Start age check</Submit>
    </form>
  );
}
