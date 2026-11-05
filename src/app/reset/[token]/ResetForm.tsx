"use client";

import { useActionState } from "react";
import { FormMessage, Submit } from "@/components/forms";
import { Field } from "@/components/ui/Field";
import { idle } from "@/lib/forms";
import { resetPasswordAction } from "@/server/actions/auth";

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction.bind(null, token), idle);
  return (
    <form action={action} className="space-y-8" noValidate>
      <FormMessage state={state} />
      <Field label="New password" name="password" type="password" autoComplete="new-password" minLength={12} required hint="At least 12 characters." error={state.fields?.password} />
      <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password" required error={state.fields?.confirm} />
      <Submit className="w-full">Set new password</Submit>
    </form>
  );
}
