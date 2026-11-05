"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FormMessage, Submit } from "@/components/forms";
import { Badge } from "@/components/ui/Badge";
import { Field } from "@/components/ui/Field";
import { idle } from "@/lib/forms";
import { moderateAction } from "@/server/actions/safety";
import type { QueueRow } from "@/server/services/safety";

const reasonLabel: Record<string, string> = {
  harassment: "Harassment",
  impersonation: "Impersonation",
  spam: "Spam",
  copyright: "Copyright",
  other: "Other",
  underage_concern: "Possible minor",
  non_consensual: "Non-consensual",
  illegal_content: "Illegal content",
};
const sevTone = { 3: "live", 2: "vip", 1: "neutral" } as const;
const sevLabel = { 3: "Critical", 2: "High", 1: "Normal" } as const;

/**
 * One report. State lives here, so the card reflects each decision
 * immediately instead of disappearing (or going stale) on revalidation.
 */
export function ModerationCard({ row }: { row: QueueRow }) {
  const [state, action] = useActionState(moderateAction, idle);
  const [escalating, setEscalating] = useState(false);
  const status = (state.data?.status as QueueRow["status"]) ?? row.status;
  const hidden = state.data?.postHidden ? state.data.postHidden === "true" : !!row.post_hidden;
  const closed = status === "actioned" || status === "dismissed";

  return (
    <article aria-label={`${sevLabel[row.severity]} report: ${reasonLabel[row.reason]}`} className="rounded-[var(--radius-lg)] border border-line bg-ink-2 p-5 md:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={sevTone[row.severity]}>{sevLabel[row.severity]}</Badge>
        <Badge tone="neutral">{reasonLabel[row.reason]}</Badge>
        <Badge tone={closed ? "locked" : status === "escalated" ? "vip" : "member"}>{status.replace("_", " ")}</Badge>
        {row.target_type === "post" && hidden && <Badge tone="locked">Post hidden</Badge>}
        {row.similar_open > 0 && <span className="text-[12px] text-gold-soft">+{row.similar_open} other open report{row.similar_open === 1 ? "" : "s"} on this</span>}
      </div>
      <p className="mt-4 text-[15px] text-ivory">
        <span className="text-stone">{row.target_type === "post" ? "Post" : row.target_type === "message" ? "Message" : "Creator"}:</span> {row.target_label ?? "—"}{" "}
        {row.target_type === "message" && (
          <Link href={`/admin/messaging/report/${row.id}`} className="text-[13px] text-gold underline decoration-gold/40 underline-offset-4">
            Review message (logged)
          </Link>
        )}
        {row.target_handle && (
          <Link href={`/c/${row.target_handle}`} className="text-[13px] text-gold underline decoration-gold/40 underline-offset-4">
            /c/{row.target_handle}
          </Link>
        )}
        {row.target_status && row.target_status !== "active" && <span className="ml-2 text-[12px] text-danger">account {row.target_status}</span>}
      </p>
      {row.details && <p className="mt-2 text-[14px] leading-relaxed text-ivory/85">“{row.details}”</p>}
      <p className="mt-2 text-[12px] text-ash">
        Filed by {row.reporter_alias ?? "—"} · {new Date(row.created_at).toLocaleString("en-GB")}
        {row.escalation_ref ? ` · ref ${row.escalation_ref}` : ""}
      </p>

      <form action={action} className="mt-5 space-y-3" aria-label="Moderation decision">
        <input type="hidden" name="id" value={row.id} />
        {escalating && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="External reference" name="escalationRef" maxLength={120} hint="Case or ticket number." error={state.fields?.escalationRef} />
            <Field label="Note (private)" name="note" maxLength={1000} />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {escalating ? (
            <>
              <Submit name="action" value="escalate" className="h-10 px-5 text-[13px]">Record escalation</Submit>
              <button type="button" onClick={() => setEscalating(false)} className="rounded-full px-3 py-2 text-[13px] text-stone hover:text-ivory">Cancel</button>
            </>
          ) : (
            <>
              {status === "open" && <Submit name="action" value="in_review" variant="outline" className="h-10 px-4 text-[13px]">Mark in review</Submit>}
              {row.target_type === "post" &&
                (hidden ? (
                  <Submit name="action" value="restore_post" variant="outline" className="h-10 px-4 text-[13px]">Restore post</Submit>
                ) : (
                  <Submit name="action" value="hide_post" className="h-10 px-4 text-[13px]">Hide post</Submit>
                ))}
              {row.target_user_id && row.target_status === "active" && (
                <Submit name="action" value="suspend_user" variant="outline" className="h-10 px-4 text-[13px]">Suspend account</Submit>
              )}
              {!closed && <Submit name="action" value="dismiss" variant="ghost" className="h-10 px-4 text-[13px]">Dismiss</Submit>}
              {status !== "escalated" && (
                <button type="button" onClick={() => setEscalating(true)} className="rounded-full px-3 py-2 text-[13px] text-stone underline decoration-line-strong underline-offset-4 hover:text-ivory">
                  Escalate…
                </button>
              )}
            </>
          )}
        </div>
        <FormMessage state={state} />
      </form>
    </article>
  );
}
