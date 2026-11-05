"use client";

import { useActionState } from "react";
import { FormMessage, Submit, TextArea } from "@/components/forms";
import { idle } from "@/lib/forms";
import { appealAction } from "@/server/actions/blasts";

export function PauseBanner({ pause }: { pause: { id: string; until: string; reason: string; appealStatus: string | null; decisionNote: string | null } }) {
  const [state, action] = useActionState(appealAction, idle);
  const until = new Date(pause.until).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  return (
    <section aria-labelledby="pause-h" className="mt-8 rounded-[var(--radius-xl)] border border-danger/40 bg-danger/[0.05] p-6">
      <h2 id="pause-h" className="font-display text-[22px] text-ivory">Messaging is paused until {until}</h2>
      <p className="mt-2 text-[14px] text-stone">Reason: {pause.reason}. You can still read your conversations.</p>
      {pause.appealStatus === "upheld" ? (
        <p className="mt-4 text-[14px] text-stone">Your appeal was reviewed and the pause stands.{pause.decisionNote ? ` Note from the house: ${pause.decisionNote}` : ""}</p>
      ) : pause.appealStatus === "open" || state.status === "success" ? (
        <p className="mt-4 text-[14px] text-gold-soft">Your appeal is with the house.</p>
      ) : (
        <form action={action} className="mt-4 space-y-3">
          <FormMessage state={state} />
          <input type="hidden" name="restrictionId" value={pause.id} />
          <TextArea label="Appeal (optional)" name="appeal" rows={3} maxLength={1000} defaultValue={state.values?.appeal} hint="Explain what happened. One appeal per pause." error={state.fields?.appeal} />
          <Submit variant="outline">Send appeal</Submit>
        </form>
      )}
    </section>
  );
}
