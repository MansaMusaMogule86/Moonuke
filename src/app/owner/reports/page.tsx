import { formatMinorCurrency } from "@/components/owner/OwnerShell";
import { requireViewer } from "@/server/auth/request";
import { getOwnerDashboardData } from "@/server/services/ownerFinance";

export default async function OwnerReportsPage() {
  const viewer = await requireViewer("owner.reports.view");
  const { owner, overview, periods, myPayouts } = await getOwnerDashboardData(viewer);

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-line bg-[#100e14]/90 p-6 md:p-8" aria-labelledby="reports-heading">
        <p className="text-[11px] uppercase tracking-[0.22em] text-gold-soft">
          Section 6 & 7 · Reconciliation & Statements
        </p>
        <h2 id="reports-heading" className="mt-1 font-display text-[26px] text-ivory">
          Financial & Reconciliation Reports
        </h2>
        <p className="mt-2 max-w-[68ch] text-[13px] text-stone">
          Double-entry ledger reconciliation status, period-by-period waterfall statements, and your private payout
          statements for {owner.displayName} ({owner.id}).
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-line bg-[#0b090e]/90 p-5">
            <span className="text-[11px] uppercase tracking-[0.16em] text-stone">Ledger Reconciliation</span>
            <p className="mt-2 font-display text-[24px] text-gold-soft">
              {overview.reconciliationExceptionsCount === 0
                ? "0 Exceptions (Balanced)"
                : `${overview.reconciliationExceptionsCount} Exception(s)`}
            </p>
          </div>
          <div className="rounded-xl border border-line bg-[#0b090e]/90 p-5">
            <span className="text-[11px] uppercase tracking-[0.16em] text-stone">Finalized / Simulated Periods</span>
            <p className="mt-2 font-display text-[24px] text-ivory">
              {periods.filter((p) => p.status === "SIMULATED").length}
            </p>
          </div>
          <div className="rounded-xl border border-line bg-[#0b090e]/90 p-5">
            <span className="text-[11px] uppercase tracking-[0.16em] text-stone">My Simulated Payouts</span>
            <p className="mt-2 font-display text-[24px] text-[#ff85c0]">
              {formatMinorCurrency(overview.simulatedDistributionsMinor)}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-[#100e14]/85 p-6" aria-labelledby="period-ledger-heading">
        <h3 id="period-ledger-heading" className="font-display text-[20px] text-ivory">
          Period Waterfall & Reconciliation Statements
        </h3>
        {periods.length === 0 ? (
          <p className="mt-3 text-[13px] text-stone">No distribution periods recorded yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-[0.15em] text-stone">
                  <th className="py-3 pr-4">Period</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Gross</th>
                  <th className="py-3 px-3 text-right">Creator (85%)</th>
                  <th className="py-3 px-3 text-right">Platform (15%)</th>
                  <th className="py-3 px-3 text-right">Deductions</th>
                  <th className="py-3 px-3 text-right">Distributable</th>
                  <th className="py-3 pl-3 text-right">My 50%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {periods.map((p) => (
                  <tr key={p.id}>
                    <td className="py-3 pr-4 font-mono text-[12px] text-ivory">
                      {p.periodStart.toISOString().slice(0, 10)} → {p.periodEnd.toISOString().slice(0, 10)} (v{p.calculationVersion})
                    </td>
                    <td className="py-3 px-3 text-gold-soft">{p.status}</td>
                    <td className="py-3 px-3 text-right font-mono text-ivory">
                      {formatMinorCurrency(p.grossFanCollectionsMinor, p.currency)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-ivory">
                      {formatMinorCurrency(p.creatorLiabilitiesMinor, p.currency)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-gold-soft">
                      {formatMinorCurrency(p.platformRevenueMinor, p.currency)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-ivory">
                      {formatMinorCurrency(p.deductionsMinor, p.currency)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-gold-soft">
                      {formatMinorCurrency(p.distributableAmountMinor, p.currency)}
                    </td>
                    <td className="py-3 pl-3 text-right font-mono text-[#ff85c0]">
                      {formatMinorCurrency(p.myAllocationMinor, p.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {myPayouts.length > 0 && (
        <section className="rounded-xl border border-line bg-[#100e14]/85 p-6" aria-labelledby="json-statements-heading">
          <h3 id="json-statements-heading" className="font-display text-[20px] text-ivory">
            My Generated Payout Statements ({owner.displayName})
          </h3>
          <div className="mt-4 space-y-3">
            {myPayouts.map((p) => (
              <pre
                key={p.id}
                className="overflow-x-auto rounded-lg border border-line bg-[#0b090e] p-4 font-mono text-[12px] text-stone"
              >
                {JSON.stringify(p.statementJson, null, 2)}
              </pre>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

