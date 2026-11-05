"use client";

import { useActionState, useId, useState, useTransition } from "react";
import { FormMessage, Submit, TextArea } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { idle } from "@/lib/forms";
import { blockAction, reportAction } from "@/server/actions/safety";

const REASONS = [
  ["harassment", "Harassment or threats"],
  ["impersonation", "Impersonation or fake identity"],
  ["spam", "Spam or scam"],
  ["copyright", "Stolen or copyrighted content"],
  ["underage_concern", "Someone may be under 18"],
  ["non_consensual", "Shared without consent"],
  ["illegal_content", "Other illegal content"],
  ["other", "Something else"],
] as const;

/** Report a creator or a post. Opens a bottom sheet; the server validates everything. */
export function ReportButton({ targetType, targetId, label, compact = false }: { targetType: "creator" | "post"; targetId: string; label: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(reportAction, idle);
  const group = useId();
  return (
    <>
      {compact ? (
        <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="rounded-full px-2 py-1 text-[12px] text-ash underline decoration-line-strong underline-offset-4 hover:text-ivory">
          Report<span className="sr-only"> {label}</span>
        </button>
      ) : (
        <Button variant="quiet" size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog">
          Report
        </Button>
      )}
      <Sheet open={open} onOpenChange={setOpen} title={`Report ${targetType === "post" ? "this post" : label}`} description="Reports are confidential. The person you report is not told who filed it.">
        {state.status === "success" ? (
          <div className="space-y-5 pb-4">
            <FormMessage state={state} />
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          </div>
        ) : (
          <form action={action} className="space-y-6 pb-4" noValidate>
            <input type="hidden" name="targetType" value={targetType} />
            <input type="hidden" name="targetId" value={targetId} />
            <fieldset aria-describedby={state.fields?.reason ? `${group}-e` : undefined}>
              <legend className="eyebrow mb-3 text-stone">What&apos;s wrong?</legend>
              <div className="grid gap-2">
                {REASONS.map(([v, l]) => (
                  <label key={v} className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-line px-4 py-3 text-[14px] text-ivory transition-colors has-[:checked]:border-gold/60 has-[:checked]:bg-gold/[0.06] has-[:focus-visible]:outline has-[:focus-visible]:outline-1 has-[:focus-visible]:outline-gold-soft">
                    <input type="radio" name="reason" value={v} className="h-4 w-4 accent-[#d6b56d]" />
                    {l}
                  </label>
                ))}
              </div>
              {state.fields?.reason && <p id={`${group}-e`} role="alert" className="mt-2 text-[13px] text-danger">{state.fields.reason}</p>}
            </fieldset>
            <TextArea label="Details (optional)" name="details" rows={3} maxLength={2000} hint="Anything that helps the house act quickly. Don't include other people's personal data." />
            <FormMessage state={state} />
            <Submit className="w-full">Send report</Submit>
            <p className="text-[12px] leading-relaxed text-ash">If someone is in immediate danger, contact local emergency services.</p>
          </form>
        )}
      </Sheet>
    </>
  );
}

export function BlockButton({ targetUserId, name }: { targetUserId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button variant="quiet" size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog">
        Block
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title={`Block ${name}?`} description="You won't see each other's profile, posts or media. You can unblock any time from Account → Privacy.">
        <div className="flex flex-wrap gap-3 pb-4">
          <Button
            loading={pending}
            onClick={() =>
              start(async () => {
                const r = await blockAction(targetUserId);
                if (r && !r.ok) setError(r.message);
              })
            }
          >
            Block {name}
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          {error && <p role="alert" className="w-full text-[13px] text-danger">{error}</p>}
        </div>
      </Sheet>
    </>
  );
}
