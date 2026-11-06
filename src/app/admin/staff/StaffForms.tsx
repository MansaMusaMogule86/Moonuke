"use client";

import { useActionState } from "react";
import { FormMessage, Submit } from "@/components/forms";
import { Field } from "@/components/ui/Field";
import { idle } from "@/lib/forms";
import { grantStaffAction, moderatorsSwitchAction, revokeStaffAction } from "@/server/actions/compliance";

const small = "h-10 px-4 text-[13px]";
const CAPS = [
  ["reports.view", "See the report queue"],
  ["reports.decide", "Dismiss, resolve or escalate reports"],
  ["content.hide", "Hide or restore reported posts"],
  ["review.decide", "Approve or reject posts before publication"],
  ["takedowns.decide", "Decide takedown notices (never the requester's contact)"],
  ["appeals.decide", "Decide creator appeals (never their own decisions)"],
] as const;

export function GrantForm({ approved }: { approved: boolean }) {
  const [state, action] = useActionState(grantStaffAction, idle);
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      {!approved && <p className="text-[13px] text-stone">Granting is refused until moderator access is approved (FEATURE_MODERATORS).</p>}
      <Field label="Member's email" name="email" type="email" defaultValue={state.status === "success" ? "" : state.values?.email} error={state.fields?.email} />
      <fieldset className="space-y-2">
        <legend className="eyebrow mb-2 text-stone">Capabilities</legend>
        {CAPS.map(([value, label]) => (
          <label key={value} className="flex items-start gap-3 text-[14px] text-ivory/90">
            <input type="checkbox" name="cap" value={value} className="mt-1 size-4 accent-[var(--color-gold)]" /> {label}
          </label>
        ))}
        {state.fields?.capabilities && <p role="alert" className="text-[13px] text-danger">{state.fields.capabilities}</p>}
      </fieldset>
      <Field label="Note (vetting, training)" name="note" maxLength={300} defaultValue={state.status === "success" ? "" : state.values?.note} />
      <Submit variant="outline" className={small}>Grant</Submit>
    </form>
  );
}

export function RevokeForm({ userId }: { userId: string }) {
  const [state, action] = useActionState(revokeStaffAction, idle);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="userId" value={userId} />
      <Field label="Reason" name="reason" maxLength={300} className="min-w-[200px] flex-1" />
      <Submit variant="ghost" className={small}>Revoke</Submit>
      <FormMessage state={state} className="w-full" />
    </form>
  );
}

export function SwitchForm({ enabled }: { enabled: boolean }) {
  const [state, action] = useActionState(moderatorsSwitchAction, idle);
  const on = state.data?.enabled ? state.data.enabled === "true" : enabled;
  return (
    <form action={action} className="space-y-3">
      <Submit name="on" value={on ? "false" : "true"} variant="outline" className={small}>{on ? "Switch moderator access off" : "Switch moderator access on"}</Submit>
      <FormMessage state={state} />
    </form>
  );
}
