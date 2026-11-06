"use client";

import { useActionState } from "react";
import { Check, FormMessage, Select, Submit, TextArea } from "@/components/forms";
import { Field } from "@/components/ui/Field";
import { idle } from "@/lib/forms";
import { takedownAction } from "@/server/actions/compliance";

const CATEGORIES = [
  ["ncii", "Intimate images shared without consent"],
  ["consent_withdrawn", "I appear in this content and withdraw my consent"],
  ["csam", "A person under 18 (child sexual abuse material)"],
  ["impersonation", "Someone is impersonating me"],
  ["other_illegal", "Other illegal content"],
] as const;
const ROLES = [
  ["depicted_person", "I am the person shown"],
  ["authorized_representative", "I'm authorised to act for the person shown"],
  ["other", "Neither (for example, I'm reporting child abuse material)"],
] as const;

export function TakedownForm() {
  const [state, action] = useActionState(takedownAction, idle);
  if (state.status === "success") {
    return (
      <div role="status" className="space-y-4 rounded-[var(--radius-lg)] border border-gold/35 bg-gold/[0.06] p-6">
        <p className="text-[15px] text-ivory">Your notice was received.</p>
        <p className="text-[14px] text-stone">
          Your reference is <strong data-testid="takedown-ref" className="font-mono text-gold-soft">{state.data?.reference}</strong>. Keep it if you
          contact us about this notice. We&apos;ll reply by email.
        </p>
      </div>
    );
  }
  const v = state.values ?? {};
  return (
    <form action={action} className="space-y-8" noValidate>
      <FormMessage state={state} />
      {/* Keyed so they remount with the echoed choice: React's form reset would otherwise clear them. */}
      <Select key={`c-${v.category ?? ""}`} label="What is this about?" name="category" defaultValue={v.category ?? ""} required error={state.fields?.category}>
        <option value="" disabled>Choose one</option>
        {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </Select>
      <Select key={`r-${v.requesterRole ?? ""}`} label="How are you connected to it?" name="requesterRole" defaultValue={v.requesterRole ?? ""} required error={state.fields?.requesterRole}>
        <option value="" disabled>Choose one</option>
        {ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </Select>
      <TextArea
        label="Where is the content?"
        name="location"
        rows={3}
        maxLength={1000}
        defaultValue={v.location}
        required
        hint="A link to the page, or a description that lets us find it."
        error={state.fields?.location}
      />
      <TextArea label="Anything else we should know (optional)" name="description" rows={4} maxLength={2000} defaultValue={v.description} error={state.fields?.description} />
      <Field label="Your name" name="name" autoComplete="name" defaultValue={v.name} required error={state.fields?.name} />
      <Field label="Email for our reply" name="email" type="email" autoComplete="email" defaultValue={v.email} required error={state.fields?.email} />
      {/* Left empty by people; filled by bots. Hidden from everyone, including screen readers. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      <Check name="goodFaith" error={state.fields?.goodFaith}>
        I believe in good faith that this content is shared without the consent of the person shown, or is otherwise illegal, and the information
        in this notice is accurate.
      </Check>
      <Field label="Signature: type your full name" name="signature" autoComplete="name" defaultValue={v.signature} required error={state.fields?.signature} />
      <p className="text-[13px] leading-relaxed text-ash">
        Your name and email are encrypted and seen only by the people who handle notices. We don&apos;t share them with the account that posted the content.
      </p>
      <Submit className="w-full">Send notice</Submit>
    </form>
  );
}
