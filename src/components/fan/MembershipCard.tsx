"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { FormMessage, Submit } from "@/components/forms";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { idle } from "@/lib/forms";
import { membershipAction } from "@/server/actions/fan";
import type { FanSubscription } from "@/server/services/fan";
import { CreatorChip } from "./CreatorChip";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** One membership. Cancelling is two-step and keeps access to the end of the period. */
export function MembershipCard({ m }: { m: FanSubscription }) {
  const [state, action] = useActionState(membershipAction, idle);
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();
  const current = (state.data?.state as FanSubscription["state"] | undefined) ?? m.state;
  const name = m.creator?.displayName ?? "this creator";

  return (
    <article aria-label={`Membership: ${name}`} className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {m.creator ? <CreatorChip c={m.creator} /> : <p className="text-[15px] text-stone">Creator unavailable</p>}
        <div className="flex flex-wrap gap-2">
          <Badge tone={m.tierKind === "vip" ? "vip" : "member"}>{m.tierName}</Badge>
          <Badge tone={current === "active" ? "member" : current === "ending" ? "locked" : "neutral"}>{current === "active" ? "Active" : current === "ending" ? "Ending" : "Ended"}</Badge>
        </div>
      </div>
      <p className="mt-4 text-[14px] text-stone">
        {current === "ended"
          ? `Ended ${day(m.periodEnd)}.`
          : current === "ending"
            ? `Ends ${day(m.periodEnd)}. You keep access until then.`
            : `Current period ends ${day(m.periodEnd)}. Automatic renewal isn't active yet — payments are off.`}
      </p>
      {current !== "ended" && (
        <div className="mt-5">
          {state.status === "success" ? (
            <div className="space-y-3">
              <FormMessage state={state} />
              <Button size="sm" variant="ghost" onClick={() => router.refresh()}>Done</Button>
            </div>
          ) : (
            <form action={action} className="space-y-3">
              <FormMessage state={state} />
              <input type="hidden" name="id" value={m.id} />
              {current === "ending" ? (
                <Submit name="intent" value="resume" variant="outline">Keep my membership</Submit>
              ) : !confirming ? (
                <Button type="button" size="sm" variant="quiet" onClick={() => setConfirming(true)}>Cancel membership…<span className="sr-only"> with {name}</span></Button>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-[14px] text-ivory">End at the close of this period? Nothing is charged or refunded.</p>
                  <Submit name="intent" value="cancel" variant="outline">Yes, cancel</Submit>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>Keep it</Button>
                </div>
              )}
            </form>
          )}
        </div>
      )}
    </article>
  );
}
