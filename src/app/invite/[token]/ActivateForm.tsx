"use client";

import { useActionState } from "react";
import { Check, FormMessage, Submit } from "@/components/forms";
import { Field } from "@/components/ui/Field";
import { idle } from "@/lib/forms";
import { activateAction } from "@/server/actions/auth";

/** Passwords are never echoed back after a failed submit; the attestations are. */
export function ActivateForm({ token }: { token: string }) {
  const [state, action] = useActionState(activateAction.bind(null, token), idle);
  return (
    <form action={action} className="space-y-8" noValidate>
      <FormMessage state={state} />
      <Field label="Temporary password" name="temporaryPassword" type="password" autoComplete="current-password" required error={state.fields?.temporaryPassword} />
      <Field label="New password" name="password" type="password" autoComplete="new-password" required minLength={12} hint="At least 12 characters, different from the temporary one." error={state.fields?.password} />
      <Field label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required error={state.fields?.confirm} />
      <div className="space-y-4">
        <Check key={`adult-${state.values?.adult ?? ""}`} name="adult" defaultChecked={state.values?.adult === "on"} error={state.fields?.adult}>
          I confirm I am 18 or older.
        </Check>
        <Check key={`terms-${state.values?.terms ?? ""}`} name="terms" defaultChecked={state.values?.terms === "on"} error={state.fields?.terms}>
          I accept the creator terms, the community rules and the privacy policy.
        </Check>
      </div>
      <Submit className="w-full">Activate my account</Submit>
    </form>
  );
}
