"use client";

import { useActionState } from "react";
import { FormMessage, Submit } from "@/components/forms";
import { Field } from "@/components/ui/Field";
import { idle } from "@/lib/forms";
import { forgotPasswordAction } from "@/server/actions/auth";

export function ForgotForm() {
  const [state, action] = useActionState(forgotPasswordAction, idle);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-8" noValidate>
      <FormMessage state={state} />
      <Field label="Email" name="email" type="email" autoComplete="email" required error={state.fields?.email} />
      <Submit className="w-full">Send reset link</Submit>
    </form>
  );
}
