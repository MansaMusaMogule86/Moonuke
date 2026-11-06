import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { canStaff, isStaff } from "@/server/auth/staff";
import { moderationQueue } from "@/server/services/safety";
import { reviewQueue } from "@/server/services/review";
import { takedownQueue } from "@/server/services/takedown";
import { appealQueue } from "@/server/services/notices";
import { ModerationCard } from "@/app/admin/moderation/ModerationCard";
import { DecideDecisionAppeal, ReviewDecision, TakedownDecision } from "@/app/admin/safety/SafetyForms";

export const metadata: Metadata = { title: "Moderation" };
export const dynamic = "force-dynamic";
const label = (s: string) => s.replace(/_/g, " ");

/** The moderator console: only the queues this moderator's grant allows. 404 for everyone else. */
export default async function StaffConsole() {
  const v = await requireViewer();
  if (!isStaff(v)) notFound();
  const [reports, review, takedowns, appeals] = [
    canStaff(v, "reports.view") ? await moderationQueue(v) : null,
    canStaff(v, "review.decide") ? await reviewQueue(v) : null,
    canStaff(v, "takedowns.decide") ? await takedownQueue(v) : null,
    canStaff(v, "appeals.decide") ? await appealQueue(v) : null,
  ];
  return (
    <div className="mx-auto max-w-[1100px] px-5 pb-28 pt-14 md:px-10 md:pt-20">
      <h1 className="font-display text-[44px] leading-none tracking-[-0.03em] text-ivory md:text-[64px]">Moderation</h1>
      <p className="mt-4 text-[14px] leading-relaxed text-stone">You can see the queues your role allows. Everything you view and decide is recorded. You never see reports you filed or reports about you.</p>
      {reports && (
        <section aria-labelledby="r-h" className="mt-10">
          <h2 id="r-h" className="font-display text-[28px] text-ivory">Reports</h2>
          {reports.length === 0 ? <p className="mt-4 text-[14px] text-ash">Nothing open.</p> : <div className="mt-4 space-y-3">{reports.map((r) => <ModerationCard key={r.id} row={r} canSuspend={false} />)}</div>}
        </section>
      )}
      {review && (
        <section aria-labelledby="rv-h" className="mt-10">
          <h2 id="rv-h" className="font-display text-[28px] text-ivory">Review queue</h2>
          {review.length === 0 ? <p className="mt-4 text-[14px] text-ash">Nothing waiting.</p> : (
            <ul className="mt-4 space-y-3">{review.map((p) => (
              <li key={p.id} className="rounded-[var(--radius-lg)] border border-line bg-ink-2 p-5">
                <p className="text-[13px] text-stone">{p.creator_name} · {label(p.access)} {p.reasons.map((r) => <Badge key={r} tone="locked">{label(r)}</Badge>)}</p>
                <p className="mt-2 text-[15px] text-ivory">{p.teaser}</p>
                {p.body && <p className="mt-2 whitespace-pre-wrap text-[14px] text-stone">{p.body}</p>}
                <div className="mt-4"><ReviewDecision id={p.id} /></div>
              </li>))}</ul>
          )}
        </section>
      )}
      {takedowns && (
        <section aria-labelledby="t-h" className="mt-10">
          <h2 id="t-h" className="font-display text-[28px] text-ivory">Takedown notices</h2>
          {takedowns.length === 0 ? <p className="mt-4 text-[14px] text-ash">Nothing open.</p> : (
            <ul className="mt-4 space-y-3">{takedowns.filter((n) => n.status !== "escalated").map((n) => (
              <li key={n.id} className="rounded-[var(--radius-lg)] border border-line bg-ink-2 p-5">
                <p className="text-[13px] text-stone"><span className="font-mono text-ivory">{n.reference}</span> · {label(n.category)} · {n.hours_left} h left</p>
                <p className="mt-2 text-[14px] text-ivory">{n.target_label ?? n.location}</p>
                <div className="mt-4"><TakedownDecision id={n.id} status={n.status} /></div>
              </li>))}</ul>
          )}
        </section>
      )}
      {appeals && (
        <section aria-labelledby="a-h" className="mt-10">
          <h2 id="a-h" className="font-display text-[28px] text-ivory">Appeals</h2>
          {appeals.length === 0 ? <p className="mt-4 text-[14px] text-ash">No open appeals.</p> : (
            <ul className="mt-4 space-y-3">{appeals.map((a) => (
              <li key={a.id} className="rounded-[var(--radius-lg)] border border-line bg-ink-2 p-5">
                <p className="text-[14px] text-stone">{a.statement.decision}</p>
                <p className="mt-2 whitespace-pre-wrap text-[15px] text-ivory">“{a.body}”</p>
                <div className="mt-4"><DecideDecisionAppeal id={a.id} canOverturn /></div>
              </li>))}</ul>
          )}
        </section>
      )}
    </div>
  );
}
