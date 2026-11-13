import { formatMinorCurrency } from "@/components/owner/OwnerShell";
import { requireViewer } from "@/server/auth/request";
import { getOwnerDashboardData, verifyOwnershipRegistry } from "@/server/services/ownerFinance";

export default async function OwnerSharePage() {
  const viewer = await requireViewer("owner.share.view");
  const [data, registry] = await Promise.all([
    getOwnerDashboardData(viewer),
    verifyOwnershipRegistry(viewer),
  ]);
  const { owner, overview, myDestination, periods } = data;

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-gold/35 bg-[#100e14]/90 p-6 md:p-8" aria-labelledby="share-heading">
        <p className="text-[11px] uppercase tracking-[0.22em] text-gold-soft">
          Section 1 & 6 · Economic Ownership Allocation
        </p>
        <h2 id="share-heading" className="mt-1 font-display text-[26px] text-ivory">
          {owner.displayName}&apos;s 50% Ownership Share ({owner.id})
        </h2>
        <p className="mt-2 max-w-[68ch] text-[13px] text-stone">
          Your 50% (5000 basis points) economic allocation is resolved server-side from the canonical ownership registry
          and routed exclusively to your private destination ({myDestination.accountCode}).
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-[#ff2e93]/40 bg-[#130d16]/90 p-5">
            <span className="text-[11px] uppercase tracking-[0.16em] text-stone">My Live 50% Share</span>
            <p className="mt-2 font-display text-[28px] text-[#ff85c0]">
              {formatMinorCurrency(overview.my50PercentAllocationMinor)}
            </p>
            <span className="mt-1 block text-[12px] text-stone">5000 / 10000 basis points</span>
          </div>
          <div className="rounded-xl border border-line bg-[#0b090e]/90 p-5">
            <span className="text-[11px] uppercase tracking-[0.16em] text-stone">Pending Approval Share</span>
            <p className="mt-2 font-display text-[28px] text-ivory">
              {formatMinorCurrency(overview.pendingDistributionsMinor)}
            </p>
            <span className="mt-1 block text-[12px] text-stone">Awaiting dual-owner sign-off</span>
          </div>
          <div className="rounded-xl border border-gold/35 bg-[#0b090e]/90 p-5">
            <span className="text-[11px] uppercase tracking-[0.16em] text-stone">Approved / Simulated Share</span>
            <p className="mt-2 font-display text-[28px] text-gold-soft">
              {formatMinorCurrency(overview.approvedDistributionsMinor)}
            </p>
            <span className="mt-1 block text-[12px] text-stone">Routed to {myDestination.accountCode}</span>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-[#100e14]/85 p-6" aria-labelledby="registry-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="registry-heading" className="font-display text-[20px] text-ivory">
            Active Ownership Registry ({registry.totalBasisPoints} / 10000 bps)
          </h3>
          <span className="rounded-full border border-gold/35 bg-gold/10 px-3 py-0.5 text-[11px] uppercase tracking-[0.15em] text-gold-soft">
            {registry.activeOwnerCount} Active Owners Verified
          </span>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {registry.owners.map((o) => (
            <div
              key={o.ownerId}
              className="rounded-xl border border-line bg-[#0b090e]/90 p-4"
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-[19px] text-ivory">{o.displayName}</span>
                <span className="rounded-full border border-line-strong px-2.5 py-0.5 text-[11px] uppercase tracking-[0.14em] text-gold-soft">
                  {o.ownerId}
                </span>
              </div>
              <p className="mt-2 text-[13px] text-stone">
                Allocation: <strong className="text-ivory">{o.percentageDisplay}</strong> ({o.percentageBasisPoints} bps)
              </p>
              <p className="mt-1 text-[11px] text-stone">
                Reference: {o.approvalReference}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-line bg-[#100e14]/85 p-6" aria-labelledby="period-allocations-heading">
        <h3 id="period-allocations-heading" className="font-display text-[20px] text-ivory">
          My Period-by-Period 50% Allocations
        </h3>
        {periods.length === 0 ? (
          <p className="mt-3 text-[13px] text-stone">No distribution periods calculated yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line text-[13px]">
            {periods.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-4 py-3.5">
                <div>
                  <p className="font-medium text-ivory">
                    {p.periodStart.toISOString().slice(0, 10)} → {p.periodEnd.toISOString().slice(0, 10)} (v{p.calculationVersion})
                  </p>
                  <p className="text-[12px] text-stone">
                    Net Distributable: {formatMinorCurrency(p.distributableAmountMinor, p.currency)} · Status: {p.status}
                  </p>
                </div>
                <div className="text-right">
                  <span className="block font-display text-[20px] text-[#ff85c0]">
                    {formatMinorCurrency(p.myAllocationMinor, p.currency)}
                  </span>
                  <span className="text-[11px] uppercase tracking-[0.14em] text-stone">
                    {owner.displayName} (5000 bps)
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

