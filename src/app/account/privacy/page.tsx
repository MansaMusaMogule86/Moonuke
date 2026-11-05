import type { Metadata } from "next";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { myBlocks, myReports, REPORT_REASONS } from "@/server/services/safety";
import { UnblockForm } from "./UnblockForm";

export const metadata: Metadata = { title: "Privacy & safety" };

const statusLabel = { open: "Received", in_review: "In review", actioned: "Action taken", dismissed: "Closed", escalated: "Escalated" } as const;

export default async function PrivacyPage() {
  const viewer = await requireViewer("club.report");
  const [blocks, reports] = await Promise.all([myBlocks(viewer), myReports(viewer)]);
  const reason = (r: string) => REPORT_REASONS.find((x) => x.value === r)?.label ?? r;

  return (
    <div className="mx-auto max-w-[1200px] px-5 pb-28 pt-12 md:px-10">
      <h1 className="font-display text-[52px] leading-[0.98] tracking-[-0.03em] text-ivory md:text-[72px]">
        Your <em className="text-metal">boundaries.</em>
      </h1>
      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="blocks-h" className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-9">
          <h2 id="blocks-h" className="font-display text-[30px] text-ivory">Blocked</h2>
          <p className="mt-3 text-[14px] text-stone">Blocking works both ways: neither of you sees the other&apos;s profile, posts or media.</p>
          {blocks.length === 0 ? (
            <p className="mt-6 text-[14px] text-ash">You haven&apos;t blocked anyone.</p>
          ) : (
            <ul className="mt-6 divide-y divide-line border-y border-line">
              {blocks.map((b) => (
                <li key={b.user_id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <p className="text-[15px] text-ivory">{b.name}</p>
                    <p className="text-[12px] text-ash">Blocked {new Date(b.created_at).toLocaleDateString("en-GB")}</p>
                  </div>
                  <UnblockForm id={b.user_id} name={b.name} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="reports-h" className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-9">
          <h2 id="reports-h" className="font-display text-[30px] text-ivory">Your reports</h2>
          <p className="mt-3 text-[14px] text-stone">Reports are confidential. You&apos;ll see their status here.</p>
          {reports.length === 0 ? (
            <p className="mt-6 text-[14px] text-ash">No reports filed.</p>
          ) : (
            <ul className="mt-6 divide-y divide-line border-y border-line">
              {reports.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <p className="text-[15px] text-ivory">{reason(r.reason)}</p>
                    <p className="text-[12px] text-ash">{r.target_type} · {new Date(r.created_at).toLocaleDateString("en-GB")}</p>
                  </div>
                  <Badge tone={r.status === "actioned" ? "vip" : "neutral"}>{statusLabel[r.status as keyof typeof statusLabel] ?? r.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
