"use client";

import { useActionState, useId, useState } from "react";
import { Check, FormMessage, Submit } from "@/components/forms";
import { Field } from "@/components/ui/Field";
import {
  CREATOR_CHOSEN_NAME_MAX_LENGTH,
  CREATOR_NAME_PREFIX,
  formatCreatorPublicName,
  normalizeCreatorChosenName,
} from "@/lib/creatorName";
import { idle } from "@/lib/forms";
import { applyAction } from "@/server/actions/auth";

export function ApplyForm({ token, emailLocked, role }: { token: string; emailLocked: boolean; role: "member" | "creator" }) {
  const [state, action] = useActionState(applyAction.bind(null, token), idle);
  const initialCreatorName = normalizeCreatorChosenName(state.values?.alias ?? "");
  const [chosenName, setChosenName] = useState(initialCreatorName);
  const id = useId();
  const inputId = `${id}-creator-name`;
  const hintId = `${id}-creator-name-hint`;
  const previewId = `${id}-creator-name-preview`;
  const errId = `${id}-creator-name-err`;

  const livePreview = chosenName.trim()
    ? formatCreatorPublicName(chosenName)
    : `${CREATOR_NAME_PREFIX} Miriam`;

  return (
    <form action={action} className="space-y-8" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="role" value={role} />
      {role === "creator" ? (
        <div className="space-y-2.5">
          <label htmlFor={inputId} className="block text-[11px] uppercase tracking-[0.22em] text-stone">
            Your name
          </label>
          <div className="flex min-w-0 items-stretch overflow-hidden rounded-[var(--radius-md)] border border-line-strong bg-ink-2/70 focus-within:border-gold/70">
            <span
              aria-label="Fixed prefix: Diva"
              className="inline-flex shrink-0 select-none items-center border-r border-line-strong bg-ink-3/80 px-3.5 font-display text-[17px] tracking-[0.04em] text-gold sm:px-4"
            >
              {CREATOR_NAME_PREFIX}
            </span>
            <input
              id={inputId}
              name="alias"
              type="text"
              dir="auto"
              required
              maxLength={CREATOR_CHOSEN_NAME_MAX_LENGTH}
              placeholder="Miriam"
              defaultValue={initialCreatorName}
              onChange={(e) => setChosenName(e.target.value)}
              aria-invalid={state.fields?.alias ? true : undefined}
              aria-describedby={state.fields?.alias ? `${previewId} ${errId}` : `${previewId} ${hintId}`}
              className="min-w-0 flex-1 bg-transparent px-3.5 py-3 text-[16px] text-ivory placeholder:text-ash/60 focus:outline-none sm:px-4"
            />
          </div>
          <div
            id={previewId}
            aria-live="polite"
            className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-line bg-ink-2/60 px-3.5 py-2 text-[13px]"
          >
            <span className="text-ash">Live preview</span>
            <span dir="auto" className="font-display text-[16px] text-ivory">
              {livePreview}
            </span>
          </div>
          {state.fields?.alias ? (
            <p id={errId} role="alert" className="text-[13px] text-danger">
              {state.fields.alias}
            </p>
          ) : (
            <p id={hintId} className="text-[13px] text-ash">
              The &ldquo;{CREATOR_NAME_PREFIX}&rdquo; prefix is fixed. Enter the name to show after {CREATOR_NAME_PREFIX} (Arabic and other scripts supported).
            </p>
          )}
        </div>
      ) : (
        <Field
          label="Alias"
          name="alias"
          autoComplete="nickname"
          required
          maxLength={32}
          placeholder="Nocturne"
          hint="Shown to creators and members instead of your name."
          defaultValue={state.values?.alias}
          error={state.fields?.alias}
        />
      )}
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
        <Check key={`adult-${state.values?.adult ?? ""}`} name="adult" defaultChecked={state.values?.adult === "on"} error={state.fields?.adult}>
          I confirm I am 18 or older. I understand we may ask for an age check before approval.
        </Check>
        <Check key={`terms-${state.values?.terms ?? ""}`} name="terms" defaultChecked={state.values?.terms === "on"} error={state.fields?.terms}>
          I accept the community rules and the privacy policy.
        </Check>
      </div>
      <Submit className="w-full">Request approval</Submit>
      <p className="text-[13px] leading-relaxed text-ash">
        Applying doesn&apos;t open your account straight away. Our team approves every new account.
      </p>
    </form>
  );
}
