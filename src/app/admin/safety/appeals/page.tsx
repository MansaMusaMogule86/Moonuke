import type { Metadata } from "next";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { appealQueue } from "@/server/services/notices";
import { DecideDecisionAppeal } from "../SafetyForms";
import { SafetyNav, label, when } from "../SafetyNav";

export const metadata: Metadata = { title: "Appeals · House" };

export default async function AppealsPage() {
  const owner = await requireViewer("moderation.review");
  const items = await appealQueue(owner);
  return (
    <div>
      <h1 className="font-display text-[40px] leading-none text-ivory md:text-[56px]">Appeals</h1>
      <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-stone">
        Creators can appeal each decision once. Overturning reverses the restriction where it&apos;s safe: never for safeguarding cases, and never
        without consent from the person shown. Every outcome is final and audited.
      </p>
      <SafetyNav current="appeals" counts={{ appeals: items.length }} />
      {items.length === 0 ? <p className="mt-8 text-[14px] text-ash">No open appeals.</p> : (
        <ul className="mt-8 space-y-3">
          {items.map((a) => (
            <li key={a.id} className="rounded-[var(--radius-lg)] border border-line bg-ink-2 p-5">
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-stone">
                <span className="text-ivory">{a.alias}</span> · {when(a.created_at)} <Badge>{label(a.kind)}</Badge>
              </div>
              <p className="mt-3 text-[14px] text-stone">Decision: <span className="text-ivory">{a.statement.decision}</span></p>
              <p className="mt-2 text-[14px] text-stone">Facts given: {a.statement.facts}</p>
              <p className="mt-3 whitespace-pre-wrap text-[15px] text-ivory">“{a.body}”</p>
              <div className="mt-4"><DecideDecisionAppeal id={a.id} canOverturn={a.kind !== "consent_withdrawn"} /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
