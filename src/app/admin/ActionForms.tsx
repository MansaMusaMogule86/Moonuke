"use client";

import { useActionState, useState } from "react";
import { FormMessage, Select, Submit, TextArea } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { idle, type FormState } from "@/lib/forms";
import {
  createInvitationAction,
  decideApplicationAction,
  decideReferralAction,
  revokeInvitationAction,
  setSuspendedAction,
} from "@/server/actions/admin";

/** Shows a just-issued invitation link exactly once, with copy. */
function IssuedLink({ state }: { state: FormState }) {
  const [copied, setCopied] = useState(false);
  if (state.status !== "success" || !state.data?.link) return null;
  return (
    <div className="rounded-[var(--radius-md)] border border-gold/40 bg-gold/[0.06] p-4">
      <p className="eyebrow mb-2 text-gold">Invitation link — shown once</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <code data-testid="invite-link" className="min-w-0 flex-1 break-all rounded-md bg-ink px-3 py-2 text-[12px] text-ivory">{state.data.link}</code>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(state.data!.link);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
      <p className="mt-2 text-[12px] text-stone">Expires {new Date(state.data.expiresAt).toLocaleString("en-GB")}. Send it privately.</p>
    </div>
  );
}

export function CreateInvitationForm() {
  const [state, action] = useActionState(createInvitationAction, idle);
  return (
    <form action={action} className="space-y-7" noValidate>
      <div className="grid gap-7 sm:grid-cols-2">
        <Select label="Role" name="role" defaultValue="member" error={state.fields?.role}>
          <option value="member">Member</option>
          <option value="creator">Creator</option>
        </Select>
        <Field label="Lock to email (optional)" name="email" type="email" error={state.fields?.email} />
        <Field label="Uses" name="maxUses" type="number" min={1} max={100} defaultValue={1} error={state.fields?.maxUses} />
        <Field label="Expires in (days)" name="expiresInDays" type="number" min={1} max={30} defaultValue={7} error={state.fields?.expiresInDays} />
      </div>
      <Field label="Private note" name="note" maxLength={500} hint="Only you see this." error={state.fields?.note} />
      <FormMessage state={state} />
      <IssuedLink state={state} />
      <Submit>Create invitation</Submit>
    </form>
  );
}

export function RevokeForm({ id }: { id: string }) {
  const [state, action] = useActionState(revokeInvitationAction, idle);
  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <Submit variant="quiet" className="h-9 px-3 text-[13px] text-danger hover:text-danger">Revoke</Submit>
      {state.status === "error" && <span role="alert" className="text-[12px] text-danger">{state.message}</span>}
    </form>
  );
}

export function DecisionForm({ id, kind, label }: { id: string; kind: "application" | "referral"; label: string }) {
  const [state, action] = useActionState(kind === "application" ? decideApplicationAction : decideReferralAction, idle);
  const [noteOpen, setNoteOpen] = useState(false);
  const no = kind === "application" ? "reject" : "decline";
  if (state.status === "success") {
    return (
      <div className="space-y-3">
        <FormMessage state={state} />
        <IssuedLink state={state} />
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3" aria-label={`Decide on ${label}`}>
      <input type="hidden" name="id" value={id} />
      {noteOpen && <TextArea label="Note (private)" name="note" rows={2} maxLength={500} />}
      <div className="flex flex-wrap items-center gap-2">
        <Submit name="decision" value="approve" className="h-10 px-5 text-[13px]">
          {kind === "application" ? "Approve" : "Approve & issue invitation"}
        </Submit>
        <Submit name="decision" value={no} variant="outline" className="h-10 px-5 text-[13px]">
          {kind === "application" ? "Decline" : "Decline"}
        </Submit>
        {!noteOpen && (
          <button type="button" onClick={() => setNoteOpen(true)} className="rounded-full px-3 py-2 text-[13px] text-stone hover:text-ivory">
            Add note
          </button>
        )}
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function SuspendForm({ id, suspended, alias }: { id: string; suspended: boolean; alias: string }) {
  const [state, action] = useActionState(setSuspendedAction, idle);
  const [confirming, setConfirming] = useState(false);
  if (!suspended && !confirming) {
    return (
      <Button size="sm" variant="outline" onClick={() => setConfirming(true)} aria-label={`Suspend ${alias}`}>
        Suspend
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="suspend" value={suspended ? "false" : "true"} />
      {!suspended && <Field label="Reason" name="reason" maxLength={500} className="min-w-[12rem]" />}
      <Submit variant={suspended ? "outline" : "gold"} className="h-9 px-4 text-[13px]">
        {suspended ? "Reactivate" : "Confirm suspension"}
      </Submit>
      {!suspended && (
        <button type="button" onClick={() => setConfirming(false)} className="rounded-full px-3 py-2 text-[13px] text-stone hover:text-ivory">Cancel</button>
      )}
      <FormMessage state={state} className="w-full" />
    </form>
  );
}
