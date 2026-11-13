import { formatMinorCurrency } from "@/components/owner/OwnerShell";
import { requireViewer } from "@/server/auth/request";
import { getOwnerDashboardData } from "@/server/services/ownerFinance";
import { CalculateDistributionForm, DistributionDecisionForm, SimulatePayoutForm } from "../OwnerForms";

export default async function OwnerDistributionsPage() {
  const viewer = await requireViewer("owner.distributions.view");
  const { owner, periods } = await getOwnerDashboardData(viewer);

  return (
    <div className="space-y-8">
      <section aria-labelledby="distributions-heading">
        <p className="text-[11px] uppercase tracking-[0.22em] text-gold-soft">
          Section 5 & 8 · Distribution Lifecycle
        </p>
        <h2 id="distributions-heading" className="mt-1 font-display text-[26px] text-ivory">
          Financial Distribution Periods
        </h2>
        <p className="mt-2 max-w-[68ch] text-[13px] text-stone">
          Supported states: DRAFT, CALCULATED, RECONCILED, AWAITING_APPROVAL, PARTIALLY_APPROVED, APPROVED,
          READY_FOR_PAYOUT, SIMULATED, ON_HOLD, REJECTED, FAILED, and PAID (reserved for future verified live settlement).
        </p>
      </section>

      <CalculateDistributionForm />

      {periods.length === 0 ? (
        <div className="rounded-xl border border-line bg-[#100e14]/80 p-7 text-[13px] text-stone">
          No financial distribution periods exist yet. Calculate a period above to snapshot the 50/50 waterfall.
        </div>
      ) : (
        <div className="space-y-4">
          {periods.map((p) => {
            const jadeApproved = p.approvals.some(
              (a) => a.ownerId === "OWNER_001" && a.calculationVersion === p.calculationVersion && a.decision === "APPROVED",
            );
            const kaelApproved = p.approvals.some(
              (a) => a.ownerId === "OWNER_002" && a.calculationVersion === p.calculationVersion && a.decision === "APPROVED",
            );
            const myApproved = owner.id === "OWNER_001" ? jadeApproved : kaelApproved;

            return (
              <article key={p.id} className="rounded-xl border border-line bg-[#100e14]/90 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-[20px] text-ivory">
                      {p.periodStart.toISOString().slice(0, 10)} → {p.periodEnd.toISOString().slice(0, 10)}
                    </h3>
                    <p className="text-[12px] text-stone">
                      Period ID: <span className="font-mono">{p.id}</span> · Calculation v{p.calculationVersion}
                    </p>
                  </div>
                  <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-gold-soft">
                    {p.status}
                  </span>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4 text-[13px] sm:grid-cols-3 lg:grid-cols-6">
                  <div>
                    <dt className="text-[11px] text-stone">Gross Collections</dt>
                    <dd className="mt-0.5 font-medium text-ivory">{formatMinorCurrency(p.grossFanCollectionsMinor, p.currency)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-stone">Creator Liabilities</dt>
                    <dd className="mt-0.5 font-medium text-ivory">{formatMinorCurrency(p.creatorLiabilitiesMinor, p.currency)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-stone">Platform Revenue</dt>
                    <dd className="mt-0.5 font-medium text-gold-soft">{formatMinorCurrency(p.platformRevenueMinor, p.currency)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-stone">Deductions & Reserves</dt>
                    <dd className="mt-0.5 font-medium text-ivory">{formatMinorCurrency(p.deductionsMinor, p.currency)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-stone">Net Distributable</dt>
                    <dd className="mt-0.5 font-medium text-gold-soft">{formatMinorCurrency(p.distributableAmountMinor, p.currency)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-stone">My 50% Share ({owner.displayName})</dt>
                    <dd className="mt-0.5 font-medium text-[#ff85c0]">{formatMinorCurrency(p.myAllocationMinor, p.currency)}</dd>
                  </div>
                </dl>

                {["AWAITING_APPROVAL", "PARTIALLY_APPROVED"].includes(p.status) && !myApproved && (
                  <DistributionDecisionForm
                    periodId={p.id}
                    calculationVersion={p.calculationVersion}
                    ownerDisplayName={owner.displayName}
                  />
                )}

                {p.status === "READY_FOR_PAYOUT" && <SimulatePayoutForm periodId={p.id} />}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

