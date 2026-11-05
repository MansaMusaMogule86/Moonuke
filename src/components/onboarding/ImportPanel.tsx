"use client";

import { useRouter } from "next/navigation";
import { useActionState, useId } from "react";
import { FormMessage, Submit, TextArea } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { idle } from "@/lib/forms";
import { importProfileAction } from "@/server/actions/onboarding";

/**
 * Import profile details from pasted text or a small .txt/.json export.
 * Parsed on the server, locally; the result is filed as a proposal that the
 * creator reviews. Shared by the creator's studio and the owner's case page.
 */
export function ImportPanel({ targetUserId, audience }: { targetUserId: string; audience: "creator" | "owner" }) {
  const [state, action] = useActionState(importProfileAction, idle);
  const router = useRouter();
  const fileId = useId();
  const done = state.status === "success";
  const warnings = state.data?.warnings ? state.data.warnings.split("\n").filter(Boolean) : [];

  if (done) {
    return (
      <div className="space-y-4" data-testid="import-result">
        <FormMessage state={state} />
        <p className="text-[13px] text-stone">
          Found: {state.data?.fields ? state.data.fields.split(",").map((f) => ({ displayName: "display name", tagline: "tagline", bio: "about" })[f] ?? f).join(", ") : "no profile text"}
          {Number(state.data?.links) > 0 ? ` · ${state.data?.links} link${state.data?.links === "1" ? "" : "s"} (unverified until confirmed)` : ""}
        </p>
        {warnings.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-ash">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        <Button size="sm" variant="outline" onClick={() => router.refresh()}>
          {audience === "creator" ? "Review the proposal" : "Done"}
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="targetUserId" value={targetUserId} />
      <TextArea
        label="Paste profile details"
        name="text"
        rows={6}
        maxLength={20000}
        defaultValue={state.values?.text}
        placeholder={"Name: …\nTagline: …\nBio: …\nhttps://www.instagram.com/…"}
        hint="Display name, tagline, bio and https:// links. Contact details are removed. Photos aren't imported."
        error={state.fields?.text}
      />
      <div>
        <label htmlFor={fileId} className="eyebrow mb-2 block text-stone">Or choose an export file (.txt or .json, 64 KB max)</label>
        <input
          id={fileId}
          type="file"
          name="file"
          accept=".txt,.json,.md,.csv,text/plain,application/json"
          aria-describedby={state.fields?.file ? `${fileId}-e` : undefined}
          className="block w-full text-[14px] text-stone file:mr-4 file:rounded-full file:border file:border-line-strong file:bg-ink-3 file:px-4 file:py-2 file:text-[13px] file:text-ivory"
        />
        {state.fields?.file && <p id={`${fileId}-e`} role="alert" className="mt-2 text-[13px] text-danger">{state.fields.file}</p>}
      </div>
      <p className="text-[12px] leading-relaxed text-ash">
        {audience === "creator"
          ? "Nothing changes until you accept the proposal. Imported links are added as unverified claims and still need the proof code."
          : "This is sent to the creator as a proposal. Only they can accept it."}{" "}
        The pasted text itself isn&apos;t stored.
      </p>
      <Submit variant="outline">Import as a proposal</Submit>
    </form>
  );
}
