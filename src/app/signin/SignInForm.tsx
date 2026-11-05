"use client";

import { useActionState } from "react";
import { FormMessage, Submit } from "@/components/forms";
import { Field } from "@/components/ui/Field";
import { idle } from "@/lib/forms";
import { signInAction } from "@/server/actions/auth";

export function SignInForm() {
  const [state, action] = useActionState(signInAction, idle);
  return (
    <form action={action} className="space-y-8" noValidate>
      <FormMessage state={state} />
      <Field label="Email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={state.fields?.email} />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required error={state.fields?.password} />
      <Submit className="w-full">Sign in</Submit>
    </form>
  );
}
