import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { markNoticesRead, myNotices } from "@/server/services/notices";
import { AppealForm } from "./AppealForm";

export const metadata: Metadata = { title: "Notices · Studio" };

const when = (d: Date) => new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
const OUTCOME = { open: "Appeal under review", upheld: "Appeal: decision upheld", overturned: "Appeal: decision reversed" } as const;

export default async function NoticesPage() {
  const viewer = await requireViewer("club.discover");
  if (viewer.role !== "creator") notFound();
  const notices = await myNotices(viewer);
  await markNoticesRead(viewer);
  return (
    <div className="mx-auto max-w-[800px] px-5 pb-28 pt-14 md:px-10 md:pt-20">
      <Link href="/studio" className="text-[13px] text-stone underline decoration-line-strong underline-offset-4 hover:text-ivory">← Studio</Link>
      <h1 className="mt-6 font-display text-[44px] leading-none tracking-[-0.03em] text-ivory md:text-[64px]">Notices</h1>
      <p className="mt-4 text-[14px] leading-relaxed text-stone">
        When the house restricts your content, it tells you what was decided, why, and how to appeal. People who report content are never identified.
      </p>
      {notices.length === 0 ? <p className="mt-10 text-[14px] text-ash">No decisions about your content.</p> : (
        <ul className="mt-10 space-y-4">
          {notices.map((n) => (
            <li key={n.id} className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6">
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-stone">
                {!n.read_at && <Badge tone="live">New</Badge>}
                <span>{when(n.created_at)}</span>
                {n.appeal_status && <Badge tone={n.appeal_status === "overturned" ? "vip" : "neutral"}>{OUTCOME[n.appeal_status]}</Badge>}
              </div>
              <h2 className="mt-3 text-[16px] text-ivory">{n.statement.decision}</h2>
              <dl className="mt-4 grid gap-3 text-[14px]">
                <div><dt className="eyebrow text-stone">What happened</dt><dd className="mt-1 text-ivory/90">{n.statement.facts}</dd></div>
                <div><dt className="eyebrow text-stone">Why</dt><dd className="mt-1 text-ivory/90">{n.statement.ground}</dd></div>
                <div><dt className="eyebrow text-stone">Automated?</dt><dd className="mt-1 text-ivory/90">{n.statement.automated}</dd></div>
                <div>
                  <dt className="eyebrow text-stone">Your options</dt>
                  <dd className="mt-1"><ul className="list-disc space-y-1 pl-5 text-ivory/90">{n.statement.redress.map((r) => <li key={r}>{r}</li>)}</ul></dd>
                </div>
              </dl>
              {n.appeal_note && <p className="mt-4 text-[14px] text-stone">House response: <span className="text-ivory">{n.appeal_note}</span></p>}
              {n.can_appeal && (
                <div className="mt-6 border-t border-line pt-5">
                  <p className="mb-3 text-[13px] text-stone">Appeal by {when(n.appeal_until)}.</p>
                  <AppealForm noticeId={n.id} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
