"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { FormMessage, Select, Submit, TextArea } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { idle } from "@/lib/forms";
import { cancelBlastAction, createBlastAction, templateAction } from "@/server/actions/blasts";
import type { Segment, Template } from "@/server/services/blasts";

const SEG_LABEL: Record<Segment, string> = {
  members: "All current members",
  vip: "VIP members",
  followers: "Followers",
  expired: "Past members",
  new: "New members (last 30 days)",
  list: "A custom list",
};

export function BlastComposer({ counts, lists, templates }: { counts: Record<Exclude<Segment, "list">, number>; lists: { id: string; name: string; size: number }[]; templates: Template[] }) {
  const [state, action] = useActionState(createBlastAction, idle);
  const [tplState, tplAction] = useActionState(templateAction, idle);
  const router = useRouter();
  const v = state.values;
  const [segment, setSegment] = useState<Segment>((v?.segment as Segment) ?? "members");
  const [body, setBody] = useState(v?.body ?? "");
  const [when, setWhen] = useState(v?.when ?? "now");
  const [local, setLocal] = useState(v?.scheduleLocal ?? "");
  const iso = local && !Number.isNaN(new Date(local).getTime()) ? new Date(local).toISOString() : "";
  const size = segment === "list" ? null : counts[segment];

  if (state.status === "success") {
    return (
      <div className="space-y-4" data-testid="blast-saved">
        <FormMessage state={state} />
        <Button size="sm" variant="outline" onClick={() => router.refresh()}>Done</Button>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <form action={action} className="space-y-6" noValidate>
        <FormMessage state={state} />
        <div className="grid gap-6 sm:grid-cols-2">
          <Select label="Send to" name="segment" value={segment} onChange={(e) => setSegment(e.target.value as Segment)} error={state.fields?.segment}>
            {(Object.keys(SEG_LABEL) as Segment[]).map((k) => (
              <option key={k} value={k} disabled={k === "list" && lists.length === 0}>
                {SEG_LABEL[k]}{k !== "list" ? ` (${counts[k]})` : lists.length === 0 ? " (create a list first)" : ""}
              </option>
            ))}
          </Select>
          {segment === "list" ? (
            <Select label="List" name="listId" defaultValue={v?.listId ?? lists[0]?.id} error={state.fields?.listId}>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.size})</option>)}
            </Select>
          ) : (
            <p className="self-end pb-3 text-[13px] text-ash">{size} {size === 1 ? "person" : "people"} — each gets a private message.</p>
          )}
        </div>
        {templates.length > 0 && (
          <Select label="Start from a template (optional)" name="template" defaultValue="" onChange={(e) => { const t = templates.find((x) => x.id === e.target.value); if (t) setBody(t.body); }}>
            <option value="">—</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        )}
        <TextArea label="Message" name="body" rows={6} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} hint="Write {name} to greet each person by name. No links or contact details. Text only for now." error={state.fields?.body} />
        <fieldset>
          <legend className="eyebrow mb-3 text-stone">When</legend>
          <div className="flex flex-wrap gap-6">
            {([["now", "Send now"], ["later", "Schedule"]] as const).map(([val, label]) => (
              <label key={val} className="flex items-center gap-2 text-[15px] text-ivory">
                <input type="radio" name="when" value={val} checked={when === val} onChange={() => setWhen(val)} className="h-4 w-4 accent-gold" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        {when === "later" && (
          <>
            <Field label="Send at (your local time)" name="scheduleLocal" type="datetime-local" value={local} onChange={(e) => setLocal(e.target.value)} error={state.fields?.scheduleAt} />
            <input type="hidden" name="scheduleAt" value={iso} />
          </>
        )}
        <p className="text-[12px] text-ash">Recipients never see each other. People who blocked you or turned off your broadcasts are skipped. Up to 3 Blasts a day. Paid Blasts unlock once payments are active.</p>
        <Submit>{when === "later" ? "Schedule Blast" : "Send Blast"}</Submit>
      </form>
      <form action={tplAction} className="flex flex-wrap items-end gap-3 border-t border-line pt-6">
        <input type="hidden" name="body" value={body} />
        <Field label="Save this message as a template" name="templateName" placeholder="Template name" className="min-w-[220px] flex-1" defaultValue={tplState.values?.templateName} error={tplState.fields?.templateName} />
        <Submit variant="ghost" className="h-11 px-4 text-[13px]">Save template</Submit>
        <FormMessage state={tplState} className="w-full" />
      </form>
    </div>
  );
}

export function CancelBlast({ id }: { id: string }) {
  const [state, action] = useActionState(cancelBlastAction, idle);
  if (state.status === "success") return <span className="text-[13px] text-stone">Cancelled</span>;
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Submit variant="quiet" className="h-9 px-3 text-[13px]">Cancel</Submit>
      <FormMessage state={state} />
    </form>
  );
}

export function DeleteTemplate({ id, name }: { id: string; name: string }) {
  const [state, action] = useActionState(templateAction, idle);
  if (state.status === "success") return <span className="text-[13px] text-stone">Deleted</span>;
  return (
    <form action={action}>
      <input type="hidden" name="intent" value="delete" />
      <input type="hidden" name="id" value={id} />
      <Submit variant="quiet" className="h-9 px-3 text-[13px]">Delete<span className="sr-only"> template {name}</span></Submit>
    </form>
  );
}
