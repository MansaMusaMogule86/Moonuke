import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { requireViewer } from "@/server/auth/request";
import { moderationCounts, moderationQueue } from "@/server/services/safety";
import { ModerationCard } from "./ModerationCard";

export const metadata: Metadata = { title: "Moderation" };

const VIEWS = [
  { v: "open", label: "Queue" },
  { v: "escalated", label: "Escalated" },
  { v: "closed", label: "Closed" },
] as const;

export default async function ModerationPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const viewer = await requireViewer("moderation.review");
  const { view: raw } = await searchParams;
  const view = (VIEWS.find((x) => x.v === raw)?.v ?? "open") as "open" | "escalated" | "closed";
  const [rows, counts] = await Promise.all([moderationQueue(viewer, view), moderationCounts(viewer)]);

  return (
    <div>
      <h1 className="font-display text-[40px] leading-none text-ivory md:text-[56px]">
        Keeping the <em className="text-metal">peace</em>
      </h1>
      <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-stone">
        Critical reports (possible minors, non-consensual sharing, illegal content) rise to the top. Reported posts in
        those categories are hidden automatically until you decide. Escalations record the external case reference —
        follow your legal reporting obligations for your jurisdiction.
      </p>
      <dl className="mt-8 flex flex-wrap gap-8">
        {[
          ["Open", counts.open],
          ["Critical", counts.critical],
          ["Escalated", counts.escalated],
        ].map(([k, v]) => (
          <div key={k as string}>
            <dt className="text-[12px] text-stone">{k}</dt>
            <dd className={cn("font-display text-[32px] tabular-nums", k === "Critical" && Number(v) > 0 ? "text-danger" : "text-ivory")}>{v}</dd>
          </div>
        ))}
      </dl>
      <nav aria-label="Moderation views" className="mt-8">
        <ul className="flex gap-1 rounded-full border border-line-strong p-1 sm:inline-flex">
          {VIEWS.map((x) => (
            <li key={x.v}>
              <Link
                href={x.v === "open" ? "/admin/moderation" : `/admin/moderation?view=${x.v}`}
                aria-current={view === x.v ? "page" : undefined}
                className={cn("block rounded-full px-4 py-2 text-[13px]", view === x.v ? "bg-gold text-ink" : "text-stone hover:text-ivory")}
              >
                {x.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {rows.length === 0 ? (
        <p className="mt-8 rounded-[var(--radius-lg)] border border-line p-8 text-center text-[15px] text-stone">Nothing here.</p>
      ) : (
        <ul className="mt-8 space-y-4">
          {rows.map((r) => (
            <li key={r.id}>
              <ModerationCard row={r} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
