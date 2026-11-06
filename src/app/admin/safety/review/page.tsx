import type { Metadata } from "next";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { reviewMode, reviewQueue } from "@/server/services/review";
import { ReviewDecision, ReviewMode } from "../SafetyForms";
import { SafetyNav, label, when } from "../SafetyNav";

export const metadata: Metadata = { title: "Review queue · House" };

export default async function ReviewPage() {
  const owner = await requireViewer("moderation.review");
  const [mode, items] = [await reviewMode(owner), await reviewQueue(owner)];
  return (
    <div>
      <h1 className="font-display text-[40px] leading-none text-ivory md:text-[56px]">Review queue</h1>
      <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-stone">
        Posts waiting here are invisible to members everywhere, including direct media links, until you approve them. Posts that name other
        people always wait here.
      </p>
      <SafetyNav current="review" counts={{ review: items.length }} />
      <div className="mt-8 rounded-[var(--radius-lg)] border border-line bg-ink-2 p-5"><ReviewMode mode={mode} /></div>
      {items.length === 0 ? <p className="mt-8 text-[14px] text-ash">Nothing waiting for review.</p> : (
        <ul className="mt-8 space-y-3">
          {items.map((p) => (
            <li key={p.id} className="rounded-[var(--radius-lg)] border border-line bg-ink-2 p-5">
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-stone">
                <span className="text-ivory">{p.creator_name}</span> · @{p.handle} · {label(p.access)} · {p.media_kind}{p.media_count > 1 ? ` × ${p.media_count}` : ""}
                {p.reasons.map((r) => <Badge key={r} tone="locked">{label(r)}</Badge>)}
                {p.participants > 0 && <Badge>{p.participants} {p.participants === 1 ? "participant" : "participants"}</Badge>}
              </div>
              <p className="mt-3 text-[15px] text-ivory">{p.teaser}</p>
              {p.body && <p className="mt-2 whitespace-pre-wrap text-[14px] text-stone">{p.body}</p>}
              <p className="mt-2 text-[13px] text-ash">{p.published_at ? `Publishes ${when(p.published_at)}` : "Draft"} · updated {when(p.updated_at)}</p>
              <div className="mt-4"><ReviewDecision id={p.id} /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
