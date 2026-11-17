"use client";

import { useActionState } from "react";
import { FormMessage, Submit } from "@/components/forms";
import { idle } from "@/lib/forms";
import { confirmReferralAttributionAction } from "@/server/actions/creators";

/**
 * One explicit step: the referred creator reviews who referred them and
 * accepts the single-level referral terms. Commissions can only accrue on a
 * confirmed attribution; confirming grants no Studio access by itself.
 */
export function AttributionForm() {
  const [state, action] = useActionState(confirmReferralAttributionAction, idle);
  return (
    <form action={action} className="mt-5 space-y-4" noValidate>
      <FormMessage state={state} />
      <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-line bg-obsidian/50 p-4">
        <input type="checkbox" name="acceptTerms" className="mt-1 h-4 w-4 accent-[#c9a46b]" />
        <span className="text-[13px] leading-relaxed text-stone">
          I confirm <strong className="text-ivory">this creator referred me</strong> and I accept the referral terms:
          a direct single-level reward of 10% of the 15% platform fee (1.5% of eligible sales), funded from the
          platform fee — my 85% creator allocation is never reduced.
        </span>
      </label>
      {state.fields?.acceptTerms && (
        <p role="alert" className="text-[12px] text-danger">
          {state.fields.acceptTerms}
        </p>
      )}
      <Submit variant="outline">Confirm attribution</Submit>
    </form>
  );
}
