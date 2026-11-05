"use client";

import { useActionState } from "react";
import { Check, FormMessage, Submit } from "@/components/forms";
import { Field } from "@/components/ui/Field";
import { idle } from "@/lib/forms";
import { applyAction } from "@/server/actions/auth";

export function ApplyForm({ token, emailLocked, role }: { token: string; emailLocked: boolean; role: "member" | "creator" }) {
  const [state, action] = useActionState(applyAction.bind(null, token), idle);
  return (
    <form action={action} className="space-y-8" noValidate>
      <FormMessage state={state} />
      <Field
        label="Alias"
        name="alias"
        autoComplete="nickname"
        required
        maxLength={32}
        placeholder={role === "creator" ? "The name on your profile" : "Nocturne"}
        hint="Shown to creators and members instead of your name."
        defaultValue={state.values?.alias}
        error={state.fields?.alias}
      />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        hint={emailLocked ? "This invitation is for one specific email address." : "Private. Used for sign-in and receipts only."}
        defaultValue={state.values?.email}
        error={state.fields?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={12}
        hint="At least 12 characters."
        error={state.fields?.password}
      />
      <div className="space-y-4">
        <Check name="adult" error={state.fields?.adult}>
          I confirm I am 18 or older. I understand the house may ask for age verification before approval.
        </Check>
        <Check name="terms" error={state.fields?.terms}>
          I accept the house rules and the privacy policy.
        </Check>
      </div>
      <Submit className="w-full">Request approval</Submit>
      <p className="text-[13px] leading-relaxed text-ash">
        Applying does not grant access. The house approves every account personally.
      </p>
    </form>
  );
}
