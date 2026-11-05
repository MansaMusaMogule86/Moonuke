"use client";

import { useActionState, useState } from "react";
import { FormMessage, Submit } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { idle } from "@/lib/forms";
import {
  changePasswordAction,
  confirmMfaAction,
  disableMfaAction,
  regenerateCodesAction,
  revokeOthersAction,
  revokeSessionAction,
  startMfaAction,
} from "@/server/actions/security";

function RecoveryCodes({ codes }: { codes: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-[var(--radius-md)] border border-gold/40 bg-gold/[0.06] p-5">
      <p className="eyebrow mb-3 text-gold">Recovery codes — shown once</p>
      <p className="mb-4 text-[13px] text-stone">Each works once if you lose your device. Store them somewhere safe and offline.</p>
      <pre data-testid="recovery-codes" className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-md bg-ink p-4 font-mono text-[14px] text-ivory">{codes}</pre>
      <Button
        size="sm"
        variant="outline"
        className="mt-4"
        onClick={async () => {
          await navigator.clipboard.writeText(codes);
          setCopied(true);
        }}
      >
        {copied ? "Copied" : "Copy codes"}
      </Button>
    </div>
  );
}

export function MfaSetup() {
  const [started, start] = useActionState(startMfaAction, idle);
  const [confirmed, confirm] = useActionState(confirmMfaAction, idle);

  if (confirmed.status === "success" && confirmed.data?.codes) {
    return (
      <div className="space-y-5">
        <FormMessage state={confirmed} />
        <RecoveryCodes codes={confirmed.data.codes} />
        <Button href="/discover" arrow>Continue</Button>
      </div>
    );
  }
  if (started.status !== "success" || !started.data?.secret) {
    return (
      <form action={start} className="space-y-4">
        <FormMessage state={started} />
        <Submit>Set up two-step sign-in</Submit>
      </form>
    );
  }
  return (
    <div className="space-y-6">
      <ol className="space-y-2 text-[14px] text-ivory/90">
        <li>1. Scan this code with your authenticator app.</li>
        <li>2. Enter the 6-digit code it shows.</li>
      </ol>
      <div className="flex flex-wrap items-start gap-6">
        {/* Generated server-side by the qrcode library from our own otpauth URI. */}
        <div role="img" aria-label="QR code for your authenticator app" className="h-44 w-44 overflow-hidden rounded-[var(--radius-md)] bg-ivory p-2" dangerouslySetInnerHTML={{ __html: started.data.qrSvg }} />
        <div className="min-w-0 flex-1">
          <p className="eyebrow mb-2 text-stone">Can&apos;t scan? Enter this key</p>
          <code data-testid="mfa-secret" className="block break-all rounded-md bg-ink px-3 py-2 font-mono text-[14px] tracking-[0.12em] text-gold-soft">{started.data.secret}</code>
        </div>
      </div>
      <form action={confirm} className="space-y-6" noValidate>
        <FormMessage state={confirmed} />
        <Field label="Code from your app" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required error={confirmed.fields?.code} />
        <Submit>Turn on two-step sign-in</Submit>
      </form>
    </div>
  );
}

export function MfaManage({ recoveryLeft, mandatory }: { recoveryLeft: number; mandatory: boolean }) {
  const [regen, regenerate] = useActionState(regenerateCodesAction, idle);
  const [off, disable] = useActionState(disableMfaAction, idle);
  return (
    <div className="space-y-8">
      <p className="text-[14px] text-stone">
        <span className="font-display text-[22px] tabular-nums text-ivory">{recoveryLeft}</span> recovery codes left.
      </p>
      {regen.status === "success" && regen.data?.codes ? (
        <>
          <FormMessage state={regen} />
          <RecoveryCodes codes={regen.data.codes} />
        </>
      ) : (
        <form action={regenerate} className="space-y-4" noValidate>
          <FormMessage state={regen} />
          <Field label="Current code to make new recovery codes" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} error={regen.fields?.code} />
          <Submit variant="outline">Regenerate recovery codes</Submit>
        </form>
      )}
      {!mandatory && off.status !== "success" && (
        <form action={disable} className="space-y-4 border-t border-line pt-6" noValidate>
          <FormMessage state={off} />
          <Field label="Current code to turn off" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} error={off.fields?.code} />
          <Submit variant="ghost">Turn off two-step sign-in</Submit>
        </form>
      )}
      {off.status === "success" && <FormMessage state={off} />}
    </div>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePasswordAction, idle);
  return (
    <form action={action} className="space-y-7" noValidate>
      <FormMessage state={state} />
      <Field label="Current password" name="current" type="password" autoComplete="current-password" required error={state.fields?.current} />
      <Field label="New password" name="next" type="password" autoComplete="new-password" minLength={12} required hint="At least 12 characters." error={state.fields?.next} />
      <Field label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required error={state.fields?.confirm} />
      <Submit>Change password</Submit>
    </form>
  );
}

export function RevokeSessionForm({ id, label }: { id: string; label: string }) {
  const [state, action] = useActionState(revokeSessionAction, idle);
  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <Submit variant="outline" className="h-9 px-4 text-[13px]">
        <span>Sign out</span>
        <span className="sr-only"> {label}</span>
      </Submit>
      {state.status === "error" && <span role="alert" className="text-[12px] text-danger">{state.message}</span>}
    </form>
  );
}

export function RevokeOthersForm() {
  const [state, action] = useActionState(revokeOthersAction, idle);
  return (
    <form action={action} className="flex items-center gap-3">
      <Submit variant="outline" className="h-10 px-5 text-[13px]">Sign out all other sessions</Submit>
      <FormMessage state={state} />
    </form>
  );
}
