"use client";

import { useActionState } from "react";
import { Check, FormMessage, Select, Submit, TextArea } from "@/components/forms";
import { Field } from "@/components/ui/Field";
import { idle } from "@/lib/forms";
import { saveProfileAction, submitVerificationAction } from "@/server/actions/creators";
import type { ProfileInput } from "@/server/services/creatorOnboarding";

export function ProfileForm({ initial, categories }: { initial: (ProfileInput & { published: boolean }) | null; categories: { slug: string; label: string }[] }) {
  const [state, action] = useActionState(saveProfileAction, idle);
  const v = (k: keyof ProfileInput) => state.values?.[k] ?? (initial?.[k] as string | undefined) ?? "";
  return (
    <form action={action} className="space-y-7" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-7 sm:grid-cols-2">
        <Field label="Handle" name="handle" defaultValue={v("handle")} required maxLength={24} hint="Your profile address: /c/handle" error={state.fields?.handle} />
        <Field label="Display name" name="displayName" defaultValue={v("displayName")} required maxLength={60} error={state.fields?.displayName} />
        <Field label="Discipline" name="discipline" defaultValue={v("discipline")} required maxLength={60} placeholder="Photographer" error={state.fields?.discipline} />
        <Select label="Category" name="category" defaultValue={v("category") || categories[0]?.slug} error={state.fields?.category}>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>{c.label}</option>
          ))}
        </Select>
        <Field label="City (optional)" name="city" defaultValue={v("city")} maxLength={60} />
        <Select label="Visibility once published" name="visibility" defaultValue={v("visibility") || "listed"}>
          <option value="listed">Listed — appears in discovery</option>
          <option value="discreet">Discreet — reachable by link only</option>
          <option value="private">Private — current members only</option>
        </Select>
      </div>
      <Field label="Tagline (optional)" name="tagline" defaultValue={v("tagline")} maxLength={160} />
      <TextArea label="About (optional)" name="bio" defaultValue={v("bio")} rows={4} maxLength={2000} />
      <Submit>Save profile</Submit>
    </form>
  );
}

export function VerificationForm() {
  const [state, action] = useActionState(submitVerificationAction, idle);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <Check name="age" error={state.fields?.age}>I am 18 or older, and I&apos;ll provide proof of age when the house asks.</Check>
      <Check name="identity" error={state.fields?.identity}>I am the person this profile represents, and I&apos;ll verify my identity when asked.</Check>
      <Check name="consent" error={state.fields?.consent}>Everyone who appears in my content is 18+, has consented, and I keep the records the law requires.</Check>
      <Check name="terms" error={state.fields?.terms}>I accept the creator terms and house rules.</Check>
      <Submit className="w-full">Request verification</Submit>
    </form>
  );
}
