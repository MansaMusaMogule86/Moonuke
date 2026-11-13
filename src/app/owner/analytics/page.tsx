import { formatMinorCurrency } from "@/components/owner/OwnerShell";
import { requireViewer } from "@/server/auth/request";
import { getOwnerDashboardData } from "@/server/services/ownerFinance";

export default async function OwnerAnalyticsPage() {
  const viewer = await requireViewer("owner.analytics.view");
  const { platformStats, overview } = await getOwnerDashboardData(viewer);

  const stats = [
    { label: "Published Creators", value: String(platformStats.active_creators) },
    { label: "Verified Creators", value: String(platformStats.verified_creators) },
    { label: "Active Fans", value: String(platformStats.active_fans) },
    { label: "Active Subscriptions", value: String(platformStats.active_subscriptions) },
    { label: "PPV Content Unlocks", value: String(platformStats.total_purchases) },
    { label: "Published Works", value: String(platformStats.published_posts) },
    { label: "Gross Fan Collections", value: formatMinorCurrency(overview.grossFanCollectionsMinor) },
    { label: "Net Distributable Earnings", value: formatMinorCurrency(overview.netDistributableEarningsMinor) },
  ];

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-line bg-[#100e14]/90 p-6 md:p-8" aria-labelledby="analytics-heading">
        <p className="text-[11px] uppercase tracking-[0.22em] text-gold-soft">Real Database Telemetry</p>
        <h2 id="analytics-heading" className="mt-1 font-display text-[26px] text-ivory">
          Platform Analytics
        </h2>
        <p className="mt-2 max-w-[68ch] text-[13px] text-stone">
          All counts and financial figures below are queried directly from PostgreSQL tables with zero fabricated metrics.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-line bg-[#0b090e]/90 p-5">
              <span className="text-[11px] uppercase tracking-[0.16em] text-stone">{s.label}</span>
              <p className="mt-2 font-display text-[28px] text-ivory">{s.value}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

