"use client";

import { useActionState, useState } from "react";
import { Check, FormMessage, Select, Submit, TextArea } from "@/components/forms";
import { AssistPanel, type AssistInfo } from "@/components/onboarding/AssistPanel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { idle } from "@/lib/forms";
import { openCaseAction, proposeAction, reviewSocialAction, updateCaseAction } from "@/server/actions/onboarding";
import type { ProfileInput } from "@/server/services/creatorOnboarding";
import type { SocialRow } from "@/server/services/onboarding";

export function OpenCaseForm({ emailEnabled }: { emailEnabled: boolean }) {
  const [state, action] = useActionState(openCaseAction, idle);
  const [copied, setCopied] = useState(false);
  return (
    <form action={action} className="space-y-6" noValidate>
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Creator's name" name="name" defaultValue={state.values?.name} error={state.fields?.name} />
        <Field label="Their email" name="email" type="email" defaultValue={state.values?.email} error={state.fields?.email} />
      </div>
      <TextArea label="Concierge note (private)" name="note" rows={2} maxLength={4000} defaultValue={state.values?.note} />
      {emailEnabled && <Check name="sendEmail">Also email the invitation to them</Check>}
      <FormMessage state={state} />
      {state.status === "success" && state.data?.link && (
        <div className="rounded-[var(--radius-md)] border border-gold/40 bg-gold/[0.06] p-4">
          <p className="eyebrow mb-2 text-gold">Invitation link — shown once</p>
          <code data-testid="invite-link" className="block break-all rounded-md bg-ink px-3 py-2 text-[12px] text-ivory">{state.data.link}</code>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={async () => { await navigator.clipboard.writeText(state.data!.link); setCopied(true); }}>{copied ? "Copied" : "Copy link"}</Button>
            <Button size="sm" variant="ghost" href={`/admin/onboarding/case/${state.data.caseId}`}>Open case</Button>
          </div>
        </div>
      )}
      <Submit>Open case & issue invitation</Submit>
    </form>
  );
}

export function CaseNotesForm({ c }: { c: { id: string; notes: string | null; welcome_call_at: Date | null; welcome_call_done_at: Date | null } }) {
  const [state, action] = useActionState(updateCaseAction, idle);
  const local = (d: Date | null) => (d ? new Date(new Date(d).getTime() - new Date(d).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
  const done = state.message === "Welcome call marked done." || !!c.welcome_call_done_at;
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="caseId" value={c.id} />
      <TextArea label="Notes" name="notes" rows={4} maxLength={4000} defaultValue={c.notes ?? ""} />
      <Field label="Welcome call" name="welcomeCallAt" type="datetime-local" defaultValue={local(c.welcome_call_at)} />
      <p className="text-[13px] text-stone">{done ? "✓ Welcome call done" : "Welcome call not yet held"}</p>
      <div className="flex flex-wrap gap-2">
        <Submit variant="outline" className="h-10 px-5 text-[13px]">Save</Submit>
        {!done ? (
          <Submit name="intent" value="callDone" variant="ghost" className="h-10 px-4 text-[13px]">Mark call done</Submit>
        ) : (
          <Submit name="intent" value="callUndo" variant="quiet" className="h-10 px-4 text-[13px]">Undo call</Submit>
        )}
        <Submit name="intent" value="withdraw" variant="quiet" className="h-10 px-4 text-[13px]">Withdraw case</Submit>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function ProposalComposer({ userId, current, categories, assist }: { userId: string; current: (ProfileInput & { published: boolean }) | null; categories: { slug: string; label: string }[]; assist: AssistInfo }) {
  const [state, action] = useActionState(proposeAction, idle);
  const [tagline, setTagline] = useState(current?.tagline ?? "");
  const [bio, setBio] = useState(current?.bio ?? "");
  const [ai, setAi] = useState(false);
  if (state.status === "success") {
    return (
      <div className="space-y-3">
        <FormMessage state={state} />
        <Button size="sm" variant="outline" onClick={() => location.reload()}>Done</Button>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <AssistPanel
        info={assist}
        targetUserId={userId}
        defaults={{ displayName: current?.displayName, discipline: current?.discipline, city: current?.city }}
        onUse={(x) => {
          if (x.tagline !== undefined) setTagline(x.tagline);
          if (x.bio !== undefined) setBio(x.bio);
          setAi(true);
        }}
      />
      <form action={action} className="space-y-6" noValidate>
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="aiAssisted" value={String(ai)} />
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Handle" name="handle" defaultValue={current?.handle} maxLength={24} />
          <Field label="Display name" name="displayName" defaultValue={current?.displayName} maxLength={60} />
          <Field label="Discipline" name="discipline" defaultValue={current?.discipline} maxLength={60} />
          <Select label="Category" name="category" defaultValue={current?.category ?? categories[0]?.slug}>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>{c.label}</option>
            ))}
          </Select>
          <Field label="City" name="city" defaultValue={current?.city} maxLength={60} />
        </div>
        <Field label="Tagline" name="tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={160} />
        <TextArea label="About" name="bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={5} maxLength={2000} />
        <Field label="Message to the creator (optional)" name="message" maxLength={1000} placeholder="A first pass from our call — change anything." />
        <FormMessage state={state} />
        <Submit>Send draft for their approval</Submit>
      </form>
    </div>
  );
}

export function SocialReviewForm({ s }: { s: SocialRow }) {
  const [state, action] = useActionState(reviewSocialAction, idle);
  const status = (state.data?.status as SocialRow["status"]) ?? s.status;
  return (
    <form action={action} className="space-y-3" aria-label={`Review ${s.platform} @${s.handle}`}>
      <input type="hidden" name="id" value={s.id} />
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[14px] text-ivory">{s.platform} · @{s.handle}</p>
        <Badge tone={status === "verified" ? "vip" : status === "failed" ? "live" : "neutral"}>{status}</Badge>
      </div>
      <p className="break-all text-[12px]">
        <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="text-gold underline decoration-gold/40 underline-offset-4">{s.url}</a>
      </p>
      <p className="text-[12px] text-stone">Proof code: <code className="text-gold-soft">{s.proof_code}</code></p>
      <div className="flex flex-wrap gap-2">
        {status !== "verified" && <Submit name="verdict" value="verified" className="h-9 px-4 text-[13px]">Code found — verify</Submit>}
        {status === "unverified" && <Submit name="verdict" value="failed" variant="outline" className="h-9 px-4 text-[13px]">Not found</Submit>}
        {status === "verified" && <Submit name="verdict" value="revoked" variant="quiet" className="h-9 px-4 text-[13px]">Revoke</Submit>}
      </div>
      <FormMessage state={state} />
    </form>
  );
}
