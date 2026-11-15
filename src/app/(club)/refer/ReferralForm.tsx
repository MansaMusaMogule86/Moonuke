"use client";

import { useActionState, useEffect, useRef } from "react";
import { FormMessage, Submit, TextArea } from "@/components/forms";
import { Field } from "@/components/ui/Field";
import { idle } from "@/lib/forms";
import { referralAction } from "@/server/actions/club";

export function ReferralForm({ fixedRole = "member" }: { fixedRole?: "member" | "creator" }) {
  const [state, action] = useActionState(referralAction, idle);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success") ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="space-y-8" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="role" value={fixedRole} />
      <Field label="Their name" name="inviteeName" required maxLength={80} defaultValue={state.values?.inviteeName} error={state.fields?.inviteeName} />
      <Field label="Their email" name="inviteeEmail" type="email" required defaultValue={state.values?.inviteeEmail} error={state.fields?.inviteeEmail} hint="Only the house sees this." />
      <TextArea
        label="How do you know them?"
        name="relationship"
        rows={4}
        maxLength={500}
        required
        defaultValue={state.values?.relationship}
        error={state.fields?.relationship}
        hint="A sentence or two helps the house decide."
      />
      <Submit className="w-full">
        {fixedRole === "creator" ? "Submit creator referral to the house" : "Request fan invitation"}
      </Submit>
    </form>
  );
}
