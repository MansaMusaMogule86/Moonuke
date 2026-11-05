"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { duration, ease } from "@/lib/tokens";

export function MotionSpecimens() {
  const [run, setRun] = useState(0);
  const rows = [
    { name: "Arrival", token: "--mk-ease-out · 900ms", t: { duration: duration.reveal, ease: ease.out } },
    { name: "State change", token: "--mk-ease-in-out · 520ms", t: { duration: duration.sheet, ease: ease.inOut } },
    { name: "Drag / throw", token: "spring 260 / 32", t: { type: "spring" as const, stiffness: 260, damping: 32 } },
  ];
  return (
    <div>
      <ul className="space-y-6">
        {rows.map((r) => (
          <li key={r.name} className="grid items-center gap-4 md:grid-cols-12">
            <div className="md:col-span-3">
              <p className="text-[14px] text-ivory">{r.name}</p>
              <p className="font-mono text-[11px] text-ash">{r.token}</p>
            </div>
            <div className="relative h-12 rounded-full border border-line md:col-span-9">
              <motion.span
                key={run}
                className="absolute left-1 top-1 h-10 w-10 rounded-full bg-gold"
                initial={{ x: 0 }}
                animate={{ x: "calc(min(60vw, 800px) - 3rem)" }}
                transition={r.t}
              />
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => setRun((v) => v + 1)}>
          Replay
        </Button>
        <p className="text-[13px] text-stone">
          Durations: press 140 · hover 260 · sheet 520 · reveal 900 · hero 1400ms. Reduced motion removes
          movement; opacity fades remain.
        </p>
      </div>
    </div>
  );
}

export function InteractiveSpecimens() {
  const [seg, setSeg] = useState<"month" | "quarter" | "year">("month");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const invalid = email.length > 0 && !/^\S+@\S+\.\S+$/.test(email);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Panel title="Button" note="One gold button per view. Outline for secondary; quiet for tertiary.">
        <div className="flex flex-wrap items-center gap-3">
          <Button arrow>Request entry</Button>
          <Button variant="outline">Browse</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="quiet">Quiet</Button>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button disabled>Disabled</Button>
          <Button
            loading={loading}
            variant="outline"
            onClick={() => {
              setLoading(true);
              setTimeout(() => setLoading(false), 1600);
            }}
          >
            {loading ? "Saving" : "Click to load"}
          </Button>
        </div>
      </Panel>

      <Panel title="Field" note="Underline inputs. Label lights gold on focus; errors announce via role=alert.">
        <div className="space-y-8">
          <Field label="Alias" placeholder="Nocturne" hint="Shown to creators. Change it anytime." />
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@private.mail"
            error={invalid ? "That doesn't look like an email address." : undefined}
          />
        </div>
      </Panel>

      <Panel title="Segmented" note="A radiogroup with a gliding indicator. Arrow keys move selection.">
        <Segmented
          label="Billing period"
          value={seg}
          onChange={setSeg}
          options={[
            { value: "month", label: "Monthly" },
            { value: "quarter", label: "3 months" },
            { value: "year", label: "Yearly" },
          ]}
        />
      </Panel>

      <Panel title="Bottom sheet" note="Drag to dismiss, Escape to close, focus is trapped and restored.">
        <Button variant="outline" onClick={() => setOpen(true)}>
          Open sheet
        </Button>
        <Sheet open={open} onOpenChange={setOpen} title="Subscribe to VIP" description="Isadora Lune · Couture & Muse">
          <div className="space-y-6 pb-4">
            <Segmented
              label="Billing period"
              value={seg}
              onChange={setSeg}
              options={[
                { value: "month", label: "Monthly" },
                { value: "quarter", label: "3 months" },
                { value: "year", label: "Yearly" },
              ]}
            />
            <p className="text-[14px] text-stone">Specimen only — no payment is taken.</p>
            <Button className="w-full" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </Sheet>
      </Panel>

      <Panel title="Loading" note="Champagne shimmer at 7s — calm, never a grey flash. Static under reduced motion.">
        <div className="flex gap-4">
          <Skeleton className="arch h-36 w-28" />
          <div className="flex-1 space-y-3 pt-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-5/6" />
          </div>
        </div>
      </Panel>
    </div>
  );
}

function Panel({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-7 md:p-9">
      <p className="font-display text-[24px] text-ivory">{title}</p>
      <p className="mb-8 mt-2 text-[13px] text-stone">{note}</p>
      {children}
    </div>
  );
}
