import type { Metadata } from "next";
import Link from "next/link";
import { Stepper } from "@/components/onboarding/Stepper";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { emailEnabled } from "@/server/email/outbox";
import { pipeline, STAGES, type PipelineRow } from "@/server/services/onboarding";
import { OpenCaseForm } from "./OnboardingForms";

export const metadata: Metadata = { title: "Onboarding" };

/** Board columns: what the creator (or the house) needs to do next. */
const COLUMNS: { key: string; label: string; match: (r: PipelineRow) => boolean; owner: string }[] = [
  { key: "invited", label: "Invited", owner: "Waiting on creator", match: (r) => r.stage === "applied" },
  { key: "approve", label: "To approve", owner: "Your move", match: (r) => r.stage === "approved" },
  { key: "profile", label: "Preparing profile", owner: "Together", match: (r) => r.stage === "profile" },
  { key: "verify", label: "Verification", owner: "Creator submits", match: (r) => r.stage === "verification" },
  { key: "review", label: "Ready to verify", owner: "Your move", match: (r) => r.stage === "live" && !r.done.live },
  { key: "live", label: "Live", owner: "Done", match: (r) => r.done.live },
];

const href = (r: PipelineRow) => (r.case_id ? `/admin/onboarding/case/${r.case_id}` : `/admin/onboarding/creator/${r.user_id}`);

export default async function OnboardingPage() {
  const owner = await requireViewer("creators.verify");
  const rows = await pipeline(owner);
  const active = rows.filter((r) => r.case_status !== "completed");

  return (
    <div>
      <div className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <h1 className="font-display text-[40px] leading-none text-ivory md:text-[56px]">
            White-glove <em className="text-metal">onboarding</em>
          </h1>
          <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-stone">
            Every creator&apos;s path from invitation to a live room. For white-glove creators the house prepares the profile
            with them — every draft needs the creator&apos;s acceptance, and nothing goes live without verification.
          </p>
        </div>
        <section aria-labelledby="open-h" className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 lg:col-span-5">
          <h2 id="open-h" className="font-display text-[24px] text-ivory">Open a white-glove case</h2>
          <p className="mt-2 text-[13px] text-stone">Issues a single-use creator invitation locked to their email, valid 14 days.</p>
          <div className="mt-6"><OpenCaseForm emailEnabled={emailEnabled()} /></div>
        </section>
      </div>

      <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {COLUMNS.map((col) => {
          const items = active.filter(col.match);
          return (
            <section key={col.key} aria-labelledby={`col-${col.key}`} className="min-w-0 rounded-[var(--radius-lg)] border border-line bg-ink-2/60 p-4">
              <div className="mb-4 flex items-baseline justify-between gap-2">
                <h2 id={`col-${col.key}`} className="text-[14px] text-ivory">{col.label}</h2>
                <span className="font-display text-[18px] tabular-nums text-gold-soft">{items.length}</span>
              </div>
              <p className="mb-3 text-[11px] uppercase tracking-[0.16em] text-ash">{col.owner}</p>
              <ul className="space-y-3">
                {items.map((r) => (
                  <li key={r.case_id ?? r.user_id}>
                    <Link href={href(r)} className="block rounded-[var(--radius-md)] border border-line bg-ink p-3 transition-colors hover:border-gold/50">
                      <p className="truncate text-[14px] text-ivory">{r.name}</p>
                      <p className="truncate text-[12px] text-ash">{r.handle ? `/c/${r.handle}` : r.email}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {r.white_glove && <Badge tone="vip">White-glove</Badge>}
                        {r.needs_info && <Badge tone="live">Needs info</Badge>}
                        {r.open_proposal && <Badge tone="neutral">Draft sent</Badge>}
                        {r.pending_socials > 0 && <Badge tone="neutral">{r.pending_socials} social to check</Badge>}
                      </div>
                      <div className="mt-3"><Stepper stages={STAGES} done={r.done} current={r.stage} compact /></div>
                    </Link>
                  </li>
                ))}
                {items.length === 0 && <li className="text-[12px] text-ash">—</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
