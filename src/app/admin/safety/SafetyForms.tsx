"use client";

import { useActionState } from "react";
import { Check, FormMessage, Submit, TextArea } from "@/components/forms";
import { Field } from "@/components/ui/Field";
import { idle } from "@/lib/forms";
import {
  attestTrainingAction, decideCaseAction, decideReviewAction, decideTakedownAction, draftAction, releaseHoldAction,
  revealContactAction, revealIdentityAction, reviewModeAction, reviewParticipantAction,
} from "@/server/actions/compliance";

const small = "h-10 px-4 text-[13px]";

export function TakedownDecision({ id, status }: { id: string; status: string }) {
  const [state, action] = useActionState(decideTakedownAction, idle);
  if (state.status === "success" && state.data?.status !== "in_review") return <FormMessage state={state} />;
  const current = state.data?.status ?? status;
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <TextArea label="Decision note" name="note" rows={3} maxLength={1000} defaultValue={state.values?.note} error={state.fields?.note} hint="Required to reject. Recorded in the audit log." />
      <div className="flex flex-wrap gap-2">
        <Submit name="decision" value="remove" className={small}>Remove content and copies</Submit>
        <Submit name="decision" value="reject" variant="outline" className={small}>Reject notice</Submit>
        {current === "received" && <Submit name="decision" value="in_review" variant="ghost" className={small}>Mark in review</Submit>}
      </div>
    </form>
  );
}

export function RevealContact({ id }: { id: string }) {
  const [state, action] = useActionState(revealContactAction, idle);
  if (state.status === "success") {
    return (
      <dl className="grid gap-1 text-[14px]" data-testid="contact">
        <dt className="text-ash">Name</dt><dd className="text-ivory">{state.data?.name}</dd>
        <dt className="text-ash">Email</dt><dd className="text-ivory">{state.data?.email}</dd>
        <dt className="text-ash">Signature</dt><dd className="text-ivory">{state.data?.signature}</dd>
        <dd className="mt-2 text-[13px] text-stone">{state.message}</dd>
      </dl>
    );
  }
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Submit variant="outline" className={small}>Show requester contact (audited)</Submit>
      <FormMessage state={state} className="mt-3" />
    </form>
  );
}

export function ReviewMode({ mode }: { mode: "flagged" | "all" }) {
  const [state, action] = useActionState(reviewModeAction, idle);
  const current = state.data?.mode ?? mode;
  return (
    <form action={action} className="space-y-3">
      <p className="text-[14px] text-stone">
        Mode: <strong className="text-ivory">{current === "all" ? "every new or edited post" : "flagged posts only"}</strong>
      </p>
      <Submit name="mode" value={current === "all" ? "flagged" : "all"} variant="outline" className={small}>
        {current === "all" ? "Review flagged posts only" : "Review every new post"}
      </Submit>
      <FormMessage state={state} />
    </form>
  );
}

export function ReviewDecision({ id }: { id: string }) {
  const [state, action] = useActionState(decideReviewAction, idle);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <Field label="Note for the creator (required to reject)" name="note" maxLength={500} defaultValue={state.values?.note} error={state.fields?.note} />
      <div className="flex flex-wrap gap-2">
        <Submit name="decision" value="approve" className={small}>Approve</Submit>
        <Submit name="decision" value="reject" variant="outline" className={small}>Reject</Submit>
      </div>
    </form>
  );
}

export function RevealIdentity({ id }: { id: string }) {
  const [state, action] = useActionState(revealIdentityAction, idle);
  if (state.status === "success") {
    return (
      <dl className="grid gap-1 text-[14px]" data-testid="identity">
        <dt className="text-ash">Legal name</dt><dd className="text-ivory">{state.data?.legalName}</dd>
        <dt className="text-ash">Date of birth</dt><dd className="text-ivory">{state.data?.dateOfBirth}</dd>
        <dt className="text-ash">ID document</dt><dd className="text-ivory">{state.data?.documentType?.replace(/_/g, " ")} · {state.data?.documentCountry}</dd>
        <dd className="mt-2 text-[13px] text-stone">{state.message}</dd>
      </dl>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <Field label="Why you need to see identity details" name="purpose" maxLength={200} defaultValue={state.values?.purpose} error={state.fields?.purpose} />
      <Submit variant="outline" className={small}>Show identity (audited)</Submit>
    </form>
  );
}

export function ParticipantDecision({ id, status }: { id: string; status: string }) {
  const [state, action] = useActionState(reviewParticipantAction, idle);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <Field label="Note (required to reject or revoke)" name="note" maxLength={500} defaultValue={state.values?.note} error={state.fields?.note} />
      <div className="flex flex-wrap gap-2">
        {status === "pending" && <Submit name="decision" value="verified" className={small}>Verify</Submit>}
        {status === "pending" && <Submit name="decision" value="rejected" variant="outline" className={small}>Reject</Submit>}
        {status === "verified" && <Submit name="decision" value="revoked" variant="outline" className={small}>Revoke verification</Submit>}
      </div>
    </form>
  );
}

export function AttestTraining() {
  const [state, action] = useActionState(attestTrainingAction, idle);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-6">
      <FormMessage state={state} />
      <Field label="Training completed on" name="trainedOn" type="date" defaultValue={state.values?.trainedOn} error={state.fields?.trainedOn} />
      <Field label="Training (course or provider)" name="training" maxLength={200} defaultValue={state.values?.training} error={state.fields?.training} />
      <Submit variant="outline">Record my training</Submit>
    </form>
  );
}

export function CaseActions({ id, status }: { id: string; status: string }) {
  const [state, action] = useActionState(decideCaseAction, idle);
  const current = state.data?.status ?? status;
  const open = current === "open" || current === "assessing";
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <TextArea label="Reason or note" name="reason" rows={3} maxLength={2000} defaultValue={state.values?.reason} error={state.fields?.reason} hint="“No report required” needs at least 40 characters." />
      {current === "report_required" && (
        <>
          <Field label="CyberTipline report number" name="externalRef" maxLength={120} defaultValue={state.values?.externalRef} error={state.fields?.externalRef} />
          <Check name="attestManual" error={state.fields?.attestManual}>I submitted this report myself through the official CyberTipline. Nothing was sent from this system.</Check>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {current === "open" && <Submit name="action" value="assess" variant="outline" className={small}>Start assessment</Submit>}
        {open && <Submit name="action" value="report_required" className={small}>Report required</Submit>}
        {open && <Submit name="action" value="no_report_required" variant="outline" className={small}>No report required</Submit>}
        {current === "report_required" && <Submit name="action" value="reported" className={small}>Record manual report</Submit>}
        {(current === "reported" || current === "no_report_required") && <Submit name="action" value="close" variant="outline" className={small}>Close case</Submit>}
        <Submit name="action" value="note" variant="ghost" className={small}>Add note</Submit>
      </div>
    </form>
  );
}

export function DraftExport({ id }: { id: string }) {
  const [state, action] = useActionState(draftAction, idle);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <Submit variant="outline" className={small}>Prepare CyberTipline draft</Submit>
      <FormMessage state={state} />
      {state.data?.json && (
        <pre tabIndex={0} aria-label="Draft for manual entry" className="max-h-96 overflow-auto rounded-[var(--radius-md)] border border-line bg-ink p-4 text-[12px] leading-relaxed text-stone">
          {state.data.json}
        </pre>
      )}
    </form>
  );
}

export function ReleaseHold({ id }: { id: string }) {
  const [state, action] = useActionState(releaseHoldAction, idle);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <Field label="Reason for release" name="reason" maxLength={1000} defaultValue={state.values?.reason} error={state.fields?.reason} />
      <Submit variant="ghost" className={small}>Release hold</Submit>
    </form>
  );
}
