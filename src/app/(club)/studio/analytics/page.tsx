import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/server/auth/request";
import { myAnalytics } from "@/server/services/studio";

export const metadata: Metadata = { title: "Analytics · Studio" };

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6">
      <p className="eyebrow text-stone">{label}</p>
      <p className="mt-3 font-display text-[44px] leading-none text-ivory">{value.toLocaleString("en")}</p>
      {sub && <p className="mt-2 text-[13px] text-ash">{sub}</p>}
    </div>
  );
}

const weekLabel = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export default async function AnalyticsPage() {
  const viewer = await requireViewer("club.discover");
  if (viewer.role !== "creator") notFound();
  const a = await myAnalytics(viewer);
  const peak = Math.max(1, ...a.weeks.flatMap((w) => [w.members, w.followers]));

  return (
    <div className="mx-auto max-w-[1100px] px-5 pb-28 pt-14 md:px-10 md:pt-20">
      <Link href="/studio" className="text-[13px] text-stone underline decoration-line-strong underline-offset-4 hover:text-ivory">← Studio</Link>
      <h1 className="mt-6 font-display text-[48px] leading-none tracking-[-0.03em] text-ivory md:text-[72px]">Analytics</h1>
      <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-stone">
        Counts only — the house never shows you who your members are here, and no viewing activity is tracked. Earnings appear once payments are active.
      </p>

      <section aria-labelledby="audience-h" className="mt-10">
        <h2 id="audience-h" className="sr-only">Audience</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Active members" value={a.members.active} sub={`${a.members.vip} VIP`} />
          <Stat label="New members" value={a.members.new30} sub="Last 30 days" />
          <Stat label="Followers" value={a.followers.total} />
          <Stat label="New followers" value={a.followers.new30} sub="Last 30 days" />
        </div>
      </section>

      <section aria-labelledby="weeks-h" className="mt-6 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-8">
        <h2 id="weeks-h" className="font-display text-[26px] text-ivory">Last {a.weeks.length} weeks</h2>
        <div className="mt-2 flex flex-wrap gap-5 text-[12px] text-stone" aria-hidden>
          <span className="flex items-center gap-2"><span className="h-2 w-4 rounded-full bg-gold" /> New members</span>
          <span className="flex items-center gap-2"><span className="h-2 w-4 rounded-full bg-stone/60" /> New followers</span>
        </div>
        <table className="mt-5 w-full text-left text-[13px]">
          <caption className="sr-only">New members and new followers per week, starting Monday</caption>
          <thead>
            <tr className="text-ash">
              <th scope="col" className="w-20 pb-2 font-normal">Week of</th>
              <th scope="col" className="pb-2 font-normal">New members</th>
              <th scope="col" className="pb-2 font-normal">New followers</th>
            </tr>
          </thead>
          <tbody>
            {a.weeks.map((w) => (
              <tr key={w.weekStart} className="border-t border-line">
                <th scope="row" className="py-2.5 pr-3 font-normal text-stone">{weekLabel(w.weekStart)}</th>
                {[w.members, w.followers].map((n, i) => (
                  <td key={i} className="py-2.5 pr-4">
                    <div className="flex items-center gap-3">
                      <span aria-hidden className={`block h-2 min-w-[2px] rounded-full ${i === 0 ? "bg-gold" : "bg-stone/60"}`} style={{ width: `${(n / peak) * 70}%` }} />
                      <span className="tabular-nums text-ivory">{n}</span>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="tiers-h" className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-8">
          <h2 id="tiers-h" className="font-display text-[26px] text-ivory">Tiers</h2>
          {a.tiers.length === 0 ? (
            <p className="mt-4 text-[14px] text-ash">No tiers yet. <Link className="text-gold underline decoration-gold/40 underline-offset-4" href="/studio/tiers">Add one</Link>.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {a.tiers.map((t) => (
                <li key={t.id} className="flex items-baseline justify-between gap-3 py-3 text-[14px]">
                  <span className="text-ivory">{t.name}{!t.active && <span className="text-ash"> · off</span>}</span>
                  <span className="tabular-nums text-stone">{t.members}{t.seatLimit != null ? ` / ${t.seatLimit} seats` : " members"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="posts-h" className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-8">
          <h2 id="posts-h" className="font-display text-[26px] text-ivory">Posts</h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-[14px]">
            {([
              ["Published", a.posts.published],
              ["Scheduled", a.posts.scheduled],
              ["Drafts", a.posts.draft],
              ["Hidden by the house", a.posts.hidden],
              ["Open to all", a.posts.byAccess.preview],
              ["Members", a.posts.byAccess.members],
              ["VIP", a.posts.byAccess.vip],
              ["Pay per view", a.posts.byAccess.ppv],
            ] as const).map(([k, n]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-line pb-2">
                <dt className="text-stone">{k}</dt>
                <dd className="tabular-nums text-ivory">{n}</dd>
              </div>
            ))}
          </dl>
          <h3 className="eyebrow mt-8 text-stone">Pay-per-view unlocks</h3>
          {a.unlocks.length === 0 ? (
            <p className="mt-3 text-[14px] text-ash">No pay-per-view posts yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line" aria-label="Unlocks per pay-per-view post">
              {a.unlocks.map((u) => (
                <li key={u.postId} className="flex items-baseline justify-between gap-3 py-2.5 text-[14px]">
                  <span className="min-w-0 truncate text-ivory">{u.teaser}</span>
                  <span className="shrink-0 tabular-nums text-stone">{u.unlocks} unlock{u.unlocks === 1 ? "" : "s"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
