"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { Check, FormMessage, Select, Submit, TextArea } from "@/components/forms";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { idle, type FormState } from "@/lib/forms";
import { createTierAction, updateTierAction } from "@/server/actions/studio";
import type { StudioTier } from "@/server/services/studio";

function TierFields({ state, tier }: { state: FormState; tier?: StudioTier }) {
  const v = state.values;
  const locked = !!tier?.hasSubscribers;
  return (
    <div className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Tier name" name="name" defaultValue={v?.name ?? tier?.name} maxLength={40} required error={state.fields?.name} />
        <Select label="Type" name="kind" defaultValue={v?.kind ?? tier?.kind ?? "member"} disabled={locked} error={state.fields?.kind}>
          <option value="member">Membership</option>
          <option value="vip">VIP (unlocks VIP posts)</option>
        </Select>
        {locked && <input type="hidden" name="kind" value={tier!.kind} />}
        <Field label="Monthly price (USD)" name="price" inputMode="decimal" defaultValue={v?.price ?? (tier ? (tier.priceCents / 100).toFixed(2) : "")} placeholder="15.00" error={state.fields?.price} />
        <Field label="Seats (optional)" name="seatLimit" inputMode="numeric" defaultValue={v?.seatLimit ?? (tier?.seatLimit != null ? String(tier.seatLimit) : "")} placeholder="Unlimited" hint={tier ? `${tier.seatsTaken} taken now.` : "Leave empty for unlimited."} error={state.fields?.seatLimit} />
      </div>
      <TextArea label="Perks, one per line (optional)" name="perks" rows={4} defaultValue={v?.perks ?? tier?.perks.join("\n")} hint="Up to 8 perks." error={state.fields?.perks} />
      <Check name="active" defaultChecked={v ? v.active === "on" : (tier?.active ?? true)} error={state.fields?.active}>Offer this tier to new members</Check>
      {locked && <p className="text-[12px] text-ash">This tier has had members, so its type is fixed and it can&apos;t be deleted. You can switch it off.</p>}
    </div>
  );
}

export function NewTierForm() {
  const [state, action] = useActionState(createTierAction, idle);
  const router = useRouter();
  if (state.status === "success") {
    return (
      <div className="space-y-4" data-testid="tier-saved">
        <FormMessage state={state} />
        <Button size="sm" variant="outline" onClick={() => router.refresh()}>Done</Button>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-6" noValidate>
      <FormMessage state={state} />
      <TierFields state={state} />
      <p className="text-[12px] text-ash">Payments aren&apos;t active yet, so nobody is charged. Prices are shown to members as quotes.</p>
      <Submit>Add tier</Submit>
    </form>
  );
}

export function TierEditor({ tier }: { tier: StudioTier }) {
  const [state, action] = useActionState(updateTierAction, idle);
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();
  if (state.status === "success" && state.data?.deleted) {
    return (
      <div className="space-y-3">
        <FormMessage state={state} />
        <Button size="sm" variant="outline" onClick={() => router.refresh()}>Done</Button>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-6" noValidate aria-label={`Tier ${tier.name}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-[24px] text-ivory">{tier.name}</h3>
        <Badge tone={tier.kind === "vip" ? "vip" : "member"}>{tier.kind === "vip" ? "VIP" : "Membership"}</Badge>
        {!tier.active && <Badge tone="locked">Off</Badge>}
      </div>
      <FormMessage state={state} />
      <input type="hidden" name="id" value={tier.id} />
      <TierFields state={state} tier={tier} />
      <div className="flex flex-wrap items-center gap-3">
        <Submit variant="outline">Save tier</Submit>
        {!tier.hasSubscribers &&
          (!confirming ? (
            <Button type="button" variant="quiet" size="sm" onClick={() => setConfirming(true)}>
              Delete…<span className="sr-only"> {tier.name}</span>
            </Button>
          ) : (
            <>
              <Submit name="intent" value="delete" variant="quiet">Yes, delete {tier.name}</Submit>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>Keep it</Button>
            </>
          ))}
      </div>
    </form>
  );
}
