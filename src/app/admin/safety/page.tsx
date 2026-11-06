import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { takedownCounts, takedownQueue } from "@/server/services/takedown";
import { safeguardingAccess } from "@/server/services/safeguarding";
import { SafetyNav, label, when } from "./SafetyNav";

export const metadata: Metadata = { title: "Safety · House" };

export default async function SafetyPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const owner = await requireViewer("moderation.review");
  const view = (await searchParams).view === "closed" ? "closed" : "open";
  const [counts, notices, sg] = [await takedownCounts(owner), await takedownQueue(owner, view), await safeguardingAccess(owner)];
  return (
    <div>
      <h1 className="font-display text-[40px] leading-none text-ivory md:text-[56px]">Safety</h1>
      <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-stone">
        Takedown notices from anyone (members or not), pre-publication review, participant records and safeguarding. Every view of sensitive
        details and every decision is recorded in the audit log.
      </p>
      <SafetyNav current="takedowns" counts={{ takedowns: counts.open, safeguarding: sg.open }} />

      {sg.open > 0 && (
        <p role="status" className="mt-8 rounded-[var(--radius-md)] border border-danger/40 bg-danger/[0.06] px-4 py-3 text-[14px] text-danger">
          {sg.open} safeguarding {sg.open === 1 ? "case needs" : "cases need"} a trained person now. <Link href="/admin/safety/safeguarding" className="underline underline-offset-4">Open safeguarding</Link>
        </p>
      )}

      <section aria-labelledby="td-h" className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="td-h" className="font-display text-[28px] text-ivory">Takedown notices</h2>
          <p className="text-[13px] text-stone">
            {counts.overdue > 0 && <span className="text-danger">{counts.overdue} overdue · </span>}
            {counts.due_soon} due within 12 hours ·{" "}
            <Link href={view === "open" ? "/admin/safety?view=closed" : "/admin/safety"} className="underline underline-offset-4 hover:text-ivory">
              {view === "open" ? "Show decided" : "Show open"}
            </Link>
          </p>
        </div>
        {notices.length === 0 ? <p className="mt-4 text-[14px] text-ash">{view === "open" ? "No open notices." : "Nothing decided yet."}</p> : (
          <ul className="mt-4 space-y-3">
            {notices.map((n) => (
              <li key={n.id} className="rounded-[var(--radius-lg)] border border-line bg-ink-2 p-5">
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-stone">
                  <Link href={`/admin/safety/takedown/${n.id}`} className="font-mono text-ivory underline decoration-line-strong underline-offset-4 hover:text-gold-soft">{n.reference}</Link>
                  <Badge tone={["ncii", "csam", "consent_withdrawn"].includes(n.category) ? "live" : "neutral"}>{label(n.category)}</Badge>
                  <Badge>{label(n.status)}</Badge>
                  {n.duplicates > 0 && <span>+{n.duplicates} duplicate {n.duplicates === 1 ? "notice" : "notices"}</span>}
                </div>
                <p className="mt-3 text-[14px] text-ivory">{n.target_label ?? "Not matched to content automatically"}</p>
                <p className="mt-1 text-[13px] text-stone">
                  Received {when(n.received_at)} ·{" "}
                  {n.status === "removed" || n.status === "rejected" ? `decided ${when(n.decided_at!)}` : n.overdue ? <strong className="text-danger">overdue (due {when(n.due_at)})</strong> : `due ${when(n.due_at)} (${n.hours_left} h left)`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
