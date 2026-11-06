"use client";

import { useActionState } from "react";
import { FormMessage, Select, Submit } from "@/components/forms";
import { Field } from "@/components/ui/Field";
import { idle } from "@/lib/forms";
import { addConsentAction, addParticipantAction, postParticipantsAction, withdrawConsentAction } from "@/server/actions/compliance";

const small = "h-10 px-4 text-[13px]";
const DOCS = [["passport", "Passport"], ["driving_licence", "Driving licence"], ["national_id", "National ID card"], ["other_government_id", "Other government ID"]] as const;

export function AddParticipantForm() {
  const [state, action] = useActionState(addParticipantAction, idle);
  const v = state.values ?? {};
  return (
    <form action={action} className="space-y-6" noValidate>
      <FormMessage state={state} />
      <Field label="Label (only you and the house see this)" name="label" maxLength={60} defaultValue={state.status === "success" ? "" : v.label} error={state.fields?.label} />
      <Field label="Full legal name" name="legalName" maxLength={120} autoComplete="off" error={state.fields?.legalName} />
      <Field label="Date of birth" name="dateOfBirth" type="date" autoComplete="off" error={state.fields?.dateOfBirth} hint="Everyone must be 18 or older." />
      <div className="grid gap-6 sm:grid-cols-2">
        {/* Keyed so it remounts with the echoed choice: React's form reset would otherwise clear it. */}
        <Select key={v.documentType ?? ""} label="ID document seen" name="documentType" defaultValue={v.documentType ?? ""} error={state.fields?.documentType}>
          <option value="" disabled>Choose one</option>
          {DOCS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
        <Field label="Country of the ID (2 letters)" name="documentCountry" maxLength={2} autoComplete="off" defaultValue={state.status === "success" ? "" : v.documentCountry} error={state.fields?.documentCountry} />
      </div>
      <p className="text-[13px] text-ash">Name and date of birth are encrypted. Don&apos;t upload or send ID images: the house will ask for them through a verified channel.</p>
      <Submit variant="outline">Add person</Submit>
    </form>
  );
}

export function AddConsentForm({ participantId }: { participantId: string }) {
  const [state, action] = useActionState(addConsentAction, idle);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="participantId" value={participantId} />
      <Field label="What the consent covers" name="scope" maxLength={500} defaultValue={state.status === "success" ? "" : state.values?.scope} error={state.fields?.scope} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date signed" name="signedOn" type="date" defaultValue={state.status === "success" ? "" : state.values?.signedOn} error={state.fields?.signedOn} />
        <Field label="Name they signed with" name="signature" maxLength={120} autoComplete="off" error={state.fields?.signature} />
      </div>
      <Submit variant="outline" className={small}>Record consent</Submit>
    </form>
  );
}

export function WithdrawConsent({ consentId }: { consentId: string }) {
  const [state, action] = useActionState(withdrawConsentAction, idle);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="consentId" value={consentId} />
      <Field label="Reason (optional)" name="reason" maxLength={500} className="min-w-[200px] flex-1" />
      <Submit variant="ghost" className={small}>Withdraw consent</Submit>
      <FormMessage state={state} className="w-full" />
    </form>
  );
}

export function PostParticipantsForm({ postId, options, linked }: { postId: string; options: { participantId: string; label: string; consentId: string; scope: string }[]; linked: string[] }) {
  const [state, action] = useActionState(postParticipantsAction, idle);
  if (options.length === 0 && linked.length === 0) {
    return <p className="text-[14px] text-ash">No verified people with an active consent yet. Add them in Participants.</p>;
  }
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <input type="hidden" name="postId" value={postId} />
      <fieldset className="space-y-3">
        <legend className="eyebrow mb-2 text-stone">Who appears</legend>
        {options.map((o) => {
          const value = `${o.participantId}:${o.consentId}`;
          return (
            <label key={value} className="flex cursor-pointer items-start gap-3 text-[14px] text-ivory/90">
              <input type="checkbox" name="link" value={value} defaultChecked={linked.includes(value)} className="mt-1 size-4 accent-[var(--color-gold)]" />
              <span>{o.label} <span className="text-stone">· consent: {o.scope}</span></span>
            </label>
          );
        })}
      </fieldset>
      <Submit variant="outline" className={small}>Save people</Submit>
    </form>
  );
}
