import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { caseList, safeguardingAccess } from "@/server/services/safeguarding";
import { AttestTraining } from "../SafetyForms";
import { SafetyNav, label, when } from "../SafetyNav";

export const metadata: Metadata = { title: "Safeguarding · House" };

export default async function SafeguardingPage() {
  const owner = await requireViewer("moderation.review");
  const access = await safeguardingAccess(owner);
  const cases = access.trained ? await caseList(owner) : [];
  return (
    <div>
      <h1 className="font-display text-[40px] leading-none text-ivory md:text-[56px]">Safeguarding</h1>
      <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-stone">
        Child-safety cases, kept apart from ordinary moderation. Content is withheld and preserved for at least one year as soon as a case
        opens, and can&apos;t be deleted while a hold is active. Nothing is ever sent to NCMEC from here: a trained person decides and submits
        reports manually through the official CyberTipline.
      </p>
      <SafetyNav current="safeguarding" counts={{ safeguarding: access.open }} />
      {!access.trained ? (
        <section aria-labelledby="train-h" className="mt-8 max-w-xl rounded-[var(--radius-lg)] border border-line bg-ink-2 p-6">
          <h2 id="train-h" className="font-display text-[22px] text-ivory">Training required</h2>
          <p className="mt-2 text-[14px] text-stone">
            {access.open > 0 ? <strong className="text-danger">{access.open} open {access.open === 1 ? "case is" : "cases are"} waiting. </strong> : null}
            Case details are shown only to someone who has completed safeguarding training. Record yours to continue. It&apos;s written to the audit log.
          </p>
          <div className="mt-6"><AttestTraining /></div>
        </section>
      ) : cases.length === 0 ? <p className="mt-8 text-[14px] text-ash">No cases.</p> : (
        <ul className="mt-8 space-y-3">
          {cases.map((c) => (
            <li key={c.id} className="rounded-[var(--radius-lg)] border border-line bg-ink-2 p-5">
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-stone">
                <Link href={`/admin/safety/safeguarding/${c.id}`} className="font-mono text-ivory underline decoration-line-strong underline-offset-4 hover:text-gold-soft">{c.reference}</Link>
                <Badge tone={["open", "assessing", "report_required"].includes(c.status) ? "live" : "neutral"}>{label(c.status)}</Badge>
                <span>from {c.source_type} · opened {when(c.created_at)} ({c.hours_open} h) · {c.holds} active {c.holds === 1 ? "hold" : "holds"}</span>
              </div>
              <p className="mt-3 text-[14px] text-ivory">{c.summary}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
