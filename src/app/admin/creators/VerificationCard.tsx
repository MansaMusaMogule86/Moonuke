"use client";

import { useActionState } from "react";
import { Check, FormMessage, Submit } from "@/components/forms";
import { Badge } from "@/components/ui/Badge";
import { Field } from "@/components/ui/Field";
import { idle } from "@/lib/forms";
import { reviewVerificationAction } from "@/server/actions/creators";
import type { VerificationRow } from "@/server/services/creatorOnboarding";

const CHECKS = [
  ["identity", "Identity confirmed"],
  ["age", "18+ confirmed (not only self-attested)"],
  ["consent_records", "Consent & records process in place"],
] as const;

/** Holds its own state so the decision shows immediately and never goes stale. */
export function VerificationCard({ row }: { row: VerificationRow }) {
  const [state, action] = useActionState(reviewVerificationAction, idle);
  const status = (state.data?.status as VerificationRow["status"]) ?? row.status;
  const published = state.data?.published ? state.data.published === "true" : row.published;

  return (
    <article aria-label={`Creator ${row.display_name ?? row.alias}: ${status.replace(/_/g, " ")}`} className="rounded-[var(--radius-lg)] border border-line bg-ink-2 p-5 md:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-display text-[24px] text-ivory">{row.display_name ?? row.alias}</p>
        <Badge tone={status === "verified" ? "vip" : status === "rejected" ? "live" : "neutral"}>{status.replace(/_/g, " ")}</Badge>
        <Badge tone={published ? "member" : "locked"}>{published ? "Published" : "Not published"}</Badge>
      </div>
      <p className="mt-1 break-all text-[13px] text-stone">
        {row.handle ? `/c/${row.handle}` : "No profile yet"} · {row.discipline ?? "—"}
        {row.city ? ` · ${row.city}` : ""} · {row.email}
      </p>
      <p className="mt-2 text-[12px] text-ash">
        {row.attested ? "All creator attestations recorded" : "Attestations incomplete"}
        {row.submitted_at ? ` · submitted ${new Date(row.submitted_at).toLocaleString("en-GB")}` : ""}
      </p>

      <form action={action} className="mt-5 space-y-4" aria-label={`Review ${row.display_name ?? row.alias}`}>
        <input type="hidden" name="userId" value={row.user_id} />
        <fieldset className="space-y-3">
          <legend className="eyebrow mb-1 text-stone">Owner checklist</legend>
          {CHECKS.map(([k, l]) => (
            <Check key={k} name={k}>{l}</Check>
          ))}
        </fieldset>
        <Field label="Note to creator (optional)" name="note" maxLength={1000} />
        <div className="flex flex-wrap gap-2">
          {status !== "verified" && <Submit name="action" value="verify" className="h-10 px-5 text-[13px]">Verify & publish</Submit>}
          {status === "submitted" && <Submit name="action" value="in_review" variant="outline" className="h-10 px-4 text-[13px]">Mark in review</Submit>}
          {status !== "verified" && <Submit name="action" value="needs_more_info" variant="outline" className="h-10 px-4 text-[13px]">Ask for more info</Submit>}
          {status !== "rejected" && status !== "verified" && <Submit name="action" value="reject" variant="ghost" className="h-10 px-4 text-[13px]">Reject</Submit>}
          {published && <Submit name="action" value="unpublish" variant="ghost" className="h-10 px-4 text-[13px]">Unpublish</Submit>}
        </div>
        <FormMessage state={state} />
      </form>
    </article>
  );
}
