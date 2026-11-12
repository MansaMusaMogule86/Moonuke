"use client";

import { useActionState } from "react";
import { Check, FormMessage, Submit } from "@/components/forms";
import { Field } from "@/components/ui/Field";
import { idle } from "@/lib/forms";
import { fanSignupAction } from "@/server/actions/auth";

export function SignupForm({ handle, displayName }: { handle: string; displayName: string }) {
  const [state, action] = useActionState(fanSignupAction.bind(null, handle), idle);
  return (
    <form action={action} className="space-y-8" noValidate>
      <FormMessage state={state} />
      <Field
        label="Alias"
        name="alias"
        autoComplete="nickname"
        required
        maxLength={32}
        placeholder="The name creators will see"
        hint="Shown to creators instead of your real name."
        defaultValue={state.values?.alias}
        error={state.fields?.alias}
      />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        hint="Private. Used for sign-in and receipts only."
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
        <Check key={`adult-${state.values?.adult ?? ""}`} name="adult" defaultChecked={state.values?.adult === "on"} error={state.fields?.adult}>
          I confirm I am 18 or older.
        </Check>
        <Check key={`terms-${state.values?.terms ?? ""}`} name="terms" defaultChecked={state.values?.terms === "on"} error={state.fields?.terms}>
          I accept the community rules and the privacy policy.
        </Check>
      </div>
      <Submit className="w-full">Create my account</Submit>
      <p className="text-[13px] leading-relaxed text-ash">
        You&apos;ll land on {displayName}&apos;s profile. Following is free, and memberships are optional — payments
        aren&apos;t open yet.
      </p>
    </form>
  );
}
