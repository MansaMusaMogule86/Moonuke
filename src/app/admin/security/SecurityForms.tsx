"use client";

import { useActionState } from "react";
import { FormMessage, Submit } from "@/components/forms";
import { Field } from "@/components/ui/Field";
import { idle } from "@/lib/forms";
import { alertAction, settingsAction } from "@/server/actions/securityMonitor";

const small = "h-10 px-4 text-[13px]";

/** Keeps the result on screen after the action (no revalidation unmount); the list refreshes on the next visit. */
export function AlertControls({ id, status }: { id: string; status: string }) {
  const [state, action] = useActionState(alertAction, idle);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
      <input type="hidden" name="id" value={id} />
      <Field label="Investigation note" name="note" maxLength={1000} className="min-w-[220px] flex-1" error={state.fields?.note} />
      <Submit name="action" value="note" variant="ghost" className={small}>Save note</Submit>
      {status === "open" && <Submit name="action" value="acknowledge" variant="outline" className={small}>Acknowledge</Submit>}
      <Submit name="action" value="resolve" variant="outline" className={small}>Resolve</Submit>
      <FormMessage state={state} className="w-full" />
    </form>
  );
}

type SettingsValues = Record<string, string | number | boolean>;
const NUMBERS: [string, string][] = [
  ["failed_account_threshold", "Failed attempts per account"],
  ["failed_ip_threshold", "Failed attempts per network"],
  ["stuffing_accounts_threshold", "Accounts tried from one network"],
  ["distributed_threshold", "Failed attempts site-wide"],
  ["mfa_failure_threshold", "Failed second-factor attempts"],
  ["window_minutes", "Sliding window (minutes)"],
  ["alert_cooldown_minutes", "Alert cooldown (minutes)"],
  ["max_alert_emails_per_hour", "Alert emails per hour (cap)"],
];

export function SettingsForm({ settings }: { settings: SettingsValues }) {
  const [state, action] = useActionState(settingsAction, idle);
  const v = (k: string) => String(state.values?.[k] ?? settings[k] ?? "");
  return (
    <form action={action} className="space-y-6" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
        {NUMBERS.map(([k, label]) => (
          <Field key={k} label={label} name={k} type="number" inputMode="numeric" defaultValue={v(k)} error={state.fields?.[k]} />
        ))}
        <Field label="Daily digest time (Asia/Dubai, HH:MM)" name="digest_local_time" defaultValue={v("digest_local_time").slice(0, 5)} error={state.fields?.digest_local_time} />
      </div>
      <fieldset className="space-y-2">
        <legend className="eyebrow mb-2 text-stone">Immediate emails (otherwise in the daily digest)</legend>
        <label className="flex items-start gap-3 text-[14px] text-ivory/90">
          <input type="checkbox" name="immediate_registration" defaultChecked={!!settings.immediate_registration} className="mt-1 size-4 accent-[var(--color-gold)]" />
          New registrations
        </label>
        <label className="flex items-start gap-3 text-[14px] text-ivory/90">
          <input type="checkbox" name="immediate_creator_application" defaultChecked={!!settings.immediate_creator_application} className="mt-1 size-4 accent-[var(--color-gold)]" />
          New creator applications
        </label>
      </fieldset>
      <Submit variant="outline" className={small}>Save settings</Submit>
    </form>
  );
}
