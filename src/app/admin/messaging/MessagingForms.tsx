"use client";

import { useActionState, useState } from "react";
import { FormMessage, Submit, TextArea } from "@/components/forms";
import { Field } from "@/components/ui/Field";
import { idle } from "@/lib/forms";
import { exceptionalAccessAction, heldReviewAction, moderateMessageAction, restrictAction } from "@/server/actions/messaging";

export function HeldReview({ id }: { id: string }) {
  const [state, action] = useActionState(heldReviewAction, idle);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} className="flex flex-wrap gap-2">
      <input type="hidden" name="id" value={id} />
      <Submit name="decision" value="release" variant="outline" className="h-10 px-4 text-[13px]">Release</Submit>
      <Submit name="decision" value="remove" variant="ghost" className="h-10 px-4 text-[13px]">Remove</Submit>
      <FormMessage state={state} className="w-full" />
    </form>
  );
}

export function ReportedMessageActions({ reportId, messageId, status }: { reportId: string; messageId: string; status: string }) {
  const [state, action] = useActionState(moderateMessageAction, idle);
  const current = state.data?.status ?? status;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="reportId" value={reportId} />
      <input type="hidden" name="messageId" value={messageId} />
      <p className="text-[13px] text-stone">Message is currently <strong className="text-ivory">{current === "sent" ? "visible" : current === "held" ? "withheld" : "removed"}</strong>.</p>
      <div className="flex flex-wrap gap-2">
        {current !== "removed" && <Submit name="status" value="removed" variant="outline" className="h-10 px-4 text-[13px]">Remove message</Submit>}
        {current !== "held" && <Submit name="status" value="held" variant="ghost" className="h-10 px-4 text-[13px]">Withhold</Submit>}
        {current !== "sent" && <Submit name="status" value="sent" variant="ghost" className="h-10 px-4 text-[13px]">Restore</Submit>}
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function RestrictForm({ userId, name }: { userId: string; name: string }) {
  const [state, action] = useActionState(restrictAction, idle);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <input type="hidden" name="userId" value={userId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Hours" name="hours" inputMode="numeric" defaultValue={state.values?.hours ?? "24"} error={state.fields?.hours} />
        <Field label={`Reason (shown to ${name})`} name="reason" defaultValue={state.values?.reason} className="sm:col-span-2" error={state.fields?.reason} />
      </div>
      <Submit variant="outline">Pause messaging</Submit>
    </form>
  );
}

export function LiftButton({ id }: { id: string }) {
  const [state, action] = useActionState(restrictAction, idle);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action}>
      <input type="hidden" name="intent" value="lift" />
      <input type="hidden" name="id" value={id} />
      <Submit variant="ghost" className="h-9 px-3 text-[13px]">Lift</Submit>
      <FormMessage state={state} />
    </form>
  );
}

/** Exceptional access: collapsed by default, justification required, audited server-side before any content is returned. */
export function ExceptionalAccess({ reportId, senderId, senderName }: { reportId: string; senderId: string; senderName: string }) {
  const [state, action] = useActionState(exceptionalAccessAction, idle);
  const [open, setOpen] = useState(false);
  const rows = state.data?.rows ? (JSON.parse(state.data.rows) as { id: string; sender: string; body: string; status: string; at: string }[]) : null;
  if (rows) {
    return (
      <section aria-labelledby="exc-h" className="rounded-[var(--radius-lg)] border border-danger/40 p-5">
        <h2 id="exc-h" className="font-display text-[22px] text-ivory">Full conversation (exceptional access)</h2>
        <FormMessage state={state} className="mt-3" />
        <ol className="mt-4 space-y-2">
          {rows.map((m) => (
            <li key={m.id} className="rounded-[var(--radius-md)] border border-line p-3">
              <p className="text-[12px] text-ash">{m.sender === senderId ? senderName : "Other participant"} · {new Date(m.at).toLocaleString("en-GB")}{m.status !== "sent" ? ` · ${m.status}` : ""}</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-[14px] text-ivory">{m.body}</p>
            </li>
          ))}
        </ol>
      </section>
    );
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[13px] text-danger underline decoration-danger/40 underline-offset-4">
        Exceptional access to the full conversation…
      </button>
    );
  }
  return (
    <form action={action} className="space-y-3 rounded-[var(--radius-lg)] border border-danger/40 p-5">
      <FormMessage state={state} />
      <input type="hidden" name="reportId" value={reportId} />
      <p className="text-[13px] leading-relaxed text-stone">
        Only for a serious safety or legal incident. Your justification is written permanently to the audit log before anything is shown, and the access itself is logged.
      </p>
      <TextArea label="Justification (at least 40 characters)" name="justification" rows={3} maxLength={1000} defaultValue={state.values?.justification} error={state.fields?.justification} />
      <Submit variant="outline">Record justification and open</Submit>
    </form>
  );
}
