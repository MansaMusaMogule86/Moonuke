import type { Metadata } from "next";
import { Badge } from "@/components/ui/Badge";
import { Reveal } from "@/components/ui/Reveal";
import { requireViewer } from "@/server/auth/request";
import { myReferrals } from "@/server/services/referrals";
import { ReferralForm } from "./ReferralForm";

export const metadata: Metadata = { title: "Request an invitation" };

const tone = { pending: "neutral", approved: "vip", declined: "locked" } as const;
const label = { pending: "With the house", approved: "Invitation issued", declined: "Declined" } as const;

export default async function ReferPage() {
  const viewer = await requireViewer("referrals.request");
  const mine = await myReferrals(viewer);

  return (
    <div className="mx-auto grid max-w-[1600px] gap-16 px-5 pb-28 pt-14 md:grid-cols-12 md:gap-6 md:px-10 md:pt-20">
      <Reveal className="md:col-span-5">
        <p className="eyebrow mb-5">Referrals</p>
        <h1 className="font-display text-[52px] leading-[0.98] tracking-[-0.03em] text-ivory md:text-[84px]">
          Vouch for <em className="text-metal">someone.</em>
        </h1>
        <div className="mt-6 max-w-md space-y-4 text-[16px] leading-relaxed text-stone">
          <p>You can ask the house to invite someone you know. You can&apos;t invite them yourself — every invitation is issued, and every account approved, by the house.</p>
          <p>If approved, the house delivers a personal, single-use invitation to them directly. You&apos;ll see the outcome here.</p>
        </div>
      </Reveal>

      <div className="md:col-span-6 md:col-start-7">
        <div className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-10">
          <ReferralForm />
        </div>

        <section aria-labelledby="mine-h" className="mt-14">
          <h2 id="mine-h" className="font-display text-[28px] text-ivory">Your requests</h2>
          {mine.length === 0 ? (
            <p className="mt-4 text-[14px] text-stone">None yet.</p>
          ) : (
            <ul className="mt-6 divide-y divide-line border-y border-line">
              {mine.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] text-ivory">{r.invitee_name}</p>
                    <p className="truncate text-[13px] text-stone">{r.invitee_email} · as {r.intended_role}</p>
                  </div>
                  <Badge tone={tone[r.status]}>{label[r.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
