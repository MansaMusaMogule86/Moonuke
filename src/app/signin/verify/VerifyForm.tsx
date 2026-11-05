"use client";

import { useActionState } from "react";
import { FormMessage, Submit } from "@/components/forms";
import { Field } from "@/components/ui/Field";
import { idle } from "@/lib/forms";
import { verifyChallengeAction } from "@/server/actions/security";

export function VerifyForm() {
  const [state, action] = useActionState(verifyChallengeAction, idle);
  return (
    <form action={action} className="space-y-8" noValidate>
      <FormMessage state={state} />
      <Field
        label="Code"
        name="code"
        inputMode="text"
        autoComplete="one-time-code"
        autoFocus
        required
        maxLength={20}
        placeholder="123456"
        hint="6 digits, or a recovery code like K7QX-M2PA-9D."
        error={state.fields?.code}
      />
      <Submit className="w-full">Verify</Submit>
    </form>
  );
}
