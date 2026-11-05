"use client";

import { useActionState, useState } from "react";
import { Check, FormMessage, Select, Submit } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { idle } from "@/lib/forms";
import { assistAction } from "@/server/actions/onboarding";

export type AssistInfo = { enabled: boolean; id: string | null; external: boolean; model: string | null };

/**
 * Drafts tagline + bio SUGGESTIONS. Nothing is saved from here: "Use" copies
 * text into the surrounding form, where a person reviews and saves it.
 * Rendered as its own <form> so it can sit beside (not inside) the profile form.
 */
export function AssistPanel({
  info,
  targetUserId,
  defaults,
  onUse,
}: {
  info: AssistInfo;
  targetUserId: string;
  defaults: { displayName?: string; discipline?: string; city?: string };
  onUse: (v: { tagline?: string; bio?: string }) => void;
}) {
  const [state, action] = useActionState(assistAction, idle);
  const [open, setOpen] = useState(false);
  if (!info.enabled) return null;
  const result = state.status === "success" && state.data?.result ? (JSON.parse(state.data.result) as { taglines: string[]; bio: string }) : null;

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} aria-expanded={false}>
        ✦ Draft with the assistant
      </Button>
    );
  }
  return (
    <section aria-label="Profile assistant" className="rounded-[var(--radius-lg)] border border-gold/30 bg-gold/[0.04] p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow text-gold">Profile assistant</p>
        <button type="button" onClick={() => setOpen(false)} className="text-[13px] text-stone hover:text-ivory">Close</button>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-stone">
        {info.external
          ? `Drafts are written by ${info.id === "anthropic" ? "Claude (Anthropic)" : info.id}. Only the notes below are sent — never your email, identity or socials.`
          : "Drafts are generated on our server from the notes below. Nothing is sent to an outside service."}{" "}
        You choose what to use; nothing is saved automatically.
      </p>
      <form action={action} className="mt-5 space-y-5" noValidate>
        <input type="hidden" name="targetUserId" value={targetUserId} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Display name" name="displayName" defaultValue={defaults.displayName} error={state.fields?.displayName} />
          <Field label="Discipline" name="discipline" defaultValue={defaults.discipline} error={state.fields?.discipline} />
          <Field label="City (optional)" name="city" defaultValue={defaults.city} />
          <Select label="Tone" name="tone" defaultValue="refined">
            <option value="refined">Refined</option>
            <option value="warm">Warm</option>
            <option value="playful">Playful</option>
            <option value="minimal">Minimal</option>
          </Select>
        </div>
        <Field label="Themes (comma-separated)" name="keywords" placeholder="glaze tests, kiln days" />
        <Field label="What members get (optional)" name="offering" placeholder="studio diaries, first looks at every firing" />
        {info.external && (
          <Check name="consent" error={state.fields?.consent}>I&apos;m happy for these notes to be sent to the assistant to draft suggestions.</Check>
        )}
        <FormMessage state={state.status === "error" ? state : idle} />
        <Submit variant="outline">Draft suggestions</Submit>
      </form>

      {result && (
        <div className="mt-6 space-y-4 border-t border-line pt-5" aria-live="polite">
          <p className="eyebrow text-stone">Taglines</p>
          <ul className="space-y-2">
            {result.taglines.map((t, i) => (
              <li key={i} className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-line bg-ink/40 px-4 py-3">
                <p className="font-display text-[17px] italic text-ivory">{t}</p>
                <Button size="sm" variant="ghost" onClick={() => onUse({ tagline: t })}>
                  Use<span className="sr-only"> tagline {i + 1}</span>
                </Button>
              </li>
            ))}
          </ul>
          <p className="eyebrow pt-2 text-stone">Bio</p>
          <div className="rounded-[var(--radius-md)] border border-line bg-ink/40 px-4 py-3">
            <p data-testid="assist-bio" className="text-[14px] leading-relaxed text-ivory/90">{result.bio}</p>
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => onUse({ bio: result.bio })}>Use bio</Button>
          </div>
        </div>
      )}
    </section>
  );
}
