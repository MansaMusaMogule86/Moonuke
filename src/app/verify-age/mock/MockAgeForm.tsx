"use client";

import { useActionState } from "react";
import { FormMessage, Submit } from "@/components/forms";
import { idle } from "@/lib/forms";
import { mockAgeResultAction } from "@/server/actions/access";

export function MockAgeForm({ check }: { check: string }) {
  const [state, action] = useActionState(mockAgeResultAction, idle);
  return (
    <form action={action} className="flex flex-wrap gap-3">
      <input type="hidden" name="check" value={check} />
      <Submit name="result" value="passed">Simulate pass</Submit>
      <Submit name="result" value="failed" variant="outline">Simulate fail</Submit>
      <FormMessage state={state} className="w-full" />
    </form>
  );
}
