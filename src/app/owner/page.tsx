import Link from "next/link";
import { formatMinorCurrency } from "@/components/owner/OwnerShell";
import { requireViewer } from "@/server/auth/request";
import { getOwnerDashboardData } from "@/server/services/ownerFinance";
import { CalculateDistributionForm, DistributionDecisionForm, SimulatePayoutForm } from "./OwnerForms";

export default async function OwnerOverviewPage() {
  const viewer = await requireViewer("owner.dashboard.view");
  const data = await getOwnerDashboardData(viewer);
  const { owner, overview, myDestination, periods, myPayouts } = data;

  const overviewMetrics = [
    {
      key: "gross-collections",
      label: "Gross fan collections",
      value: formatMinorCurrency(overview.grossFanCollectionsMinor),
      sub: "Settled fan subscriptions, PPV unlocks & tips",
      tone: "default",
    },
    {
      key: "creator-liabilities",
      label: "Creator liabilities",
      value: formatMinorCurrency(overview.creatorLiabilitiesMinor),
      sub: `Protected ${overview.creatorContractualShareBps / 100}% contractual share (never distributed to owners)`,
      tone: "ivory",
    },
    {
      key: "platform-revenue",
      label: "Platform revenue",
      value: formatMinorCurrency(overview.platformRevenueMinor),
      sub: `Provisional ${overview.provisionalPlatformFeeBps / 100}% fee before platform-borne costs`,
      tone: "gold",
    },
    {
      key: "approved-expenses",
      label: "Approved expenses",
      value: formatMinorCurrency(overview.approvedExpensesMinor),
      sub: "Verified platform operating expenses",
      tone: "default",
    },
    {
      key: "refunds-chargebacks",
      label: "Refunds and chargebacks",
      value: formatMinorCurrency(overview.refundsAndChargebacksMinor),
      sub: "Settled reversals and lost disputes",
      tone: "default",
    },
    {
      key: "reserves",
      label: "Reserves",
      value: formatMinorCurrency(overview.reservesMinor),
      sub: "Rolling risk reserves & deterministic rounding carry",
      tone: "default",
    },
    {
      key: "net-distributable",
      label: "Net distributable earnings",
      value: formatMinorCurrency(overview.netDistributableEarningsMinor),
      sub: "Reconciled platform earnings eligible for 50/50 split",
      tone: "gold",
    },
    {
      key: "my-50-allocation",
      label: "My 50% allocation",
      value: formatMinorCurrency(overview.my50PercentAllocationMinor),
      sub: `${owner.displayName} (${owner.id} · 5000 bps)`,
      tone: "pink",
    },
    {
      key: "pending-distributions",
      label: "Pending distributions",
      value: formatMinorCurrency(overview.pendingDistributionsMinor),
      sub: "Awaiting reconciliation or dual-owner MFA approval",
      tone: "default",
    },
    {
      key: "approved-distributions",
      label: "Approved distributions",
      value: formatMinorCurrency(overview.approvedDistributionsMinor),
      sub: "Dual-approved and simulated / ready for payout",
      tone: "gold",
    },
    {
      key: "paid-distributions",
      label: "Paid distributions",
      value: formatMinorCurrency(overview.paidDistributionsMinor),
      sub: `Simulated: ${formatMinorCurrency(overview.simulatedDistributionsMinor)} (live transfers disabled)`,
      tone: "default",
    },
    {
      key: "reconciliation-exceptions",
      label: "Reconciliation exceptions",
      value: String(overview.reconciliationExceptionsCount),
      sub:
        overview.reconciliationExceptionsCount === 0
          ? "Zero-sum double-entry ledger verified"
          : "Requires review before approval",
      tone: overview.reconciliationExceptionsCount === 0 ? "default" : "pink",
    },
  ] as const;

  const hasFinancialActivity =
    overview.grossFanCollectionsMinor > 0 || periods.length > 0 || myPayouts.length > 0;

  return (
    <div className="space-y-10">
      <section aria-labelledby="overview-metrics-heading">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-gold-soft">
              Real-Time Ledger & Distribution Waterfall
            </p>
            <h2 id="overview-metrics-heading" className="mt-1 font-display text-[26px] text-ivory">
              Financial & Ownership Overview
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-stone">
            <span className="rounded-full border border-line px-3 py-1">
              Arithmetic: Integer minor units (cents)
            </span>
            <span className="rounded-full border border-line px-3 py-1">
              Settlement Mode: Simulated (Live PAID disabled)
            </span>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="overview-metrics-grid">
          {overviewMetrics.map((m) => (
            <article
              key={m.key}
              data-testid={`metric-${m.key}`}
              className={
                m.tone === "pink"
                  ? "rounded-xl border border-[#ff2e93]/45 bg-[#130d16]/90 p-5 shadow-[0_0_28px_-12px_rgba(255,46,147,0.35)]"
                  : m.tone === "gold"
                    ? "rounded-xl border border-gold/40 bg-[#121015]/90 p-5"
                    : "rounded-xl border border-line bg-[#100e14]/85 p-5"
              }
            >
              <p className="text-[11px] uppercase tracking-[0.16em] text-stone">{m.label}</p>
              <p
                className={
                  m.tone === "pink"
                    ? "mt-2 font-display text-[28px] leading-none text-[#ff85c0]"
                    : m.tone === "gold"
                      ? "mt-2 font-display text-[28px] leading-none text-gold-soft"
                      : "mt-2 font-display text-[28px] leading-none text-ivory"
                }
              >
                {m.value}
              </p>
              <p className="mt-2.5 text-[12px] leading-snug text-stone">{m.sub}</p>
            </article>
          ))}
        </div>
      </section>

      {!hasFinancialActivity && (
        <section
          aria-label="Empty financial activity state"
          data-testid="overview-empty-state"
          className="rounded-2xl border border-line bg-[#100e14]/75 p-7"
        >
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <span className="inline-block rounded-full border border-gold/30 bg-gold/10 px-3 py-0.5 text-[11px] uppercase tracking-[0.18em] text-gold-soft">
                Ledger Ready · Zero Fabricated Activity
              </span>
              <h3 className="mt-2 font-display text-[22px] text-ivory">
                No settled fan payments or finalized distributions recorded yet
              </h3>
              <p className="mt-1 max-w-[65ch] text-[13px] text-stone">
                All metrics above reflect real PostgreSQL ledger records. As settled fan payments, creator entitlements,
                and operating expenses are booked, you can calculate and dual-approve 50/50 distribution periods below.
              </p>
            </div>
            <Link
              href="/owner/distributions"
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-gold/50 bg-gold/15 px-5 text-[13px] font-medium text-ivory transition-colors hover:bg-gold/25"
            >
              Manage Distributions
            </Link>
          </div>
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-12">
        <section className="space-y-6 lg:col-span-7" aria-labelledby="recent-distributions-heading">
          <div className="flex items-center justify-between gap-3">
            <h2 id="recent-distributions-heading" className="font-display text-[22px] text-ivory">
              Distribution Periods & Dual-Owner Approvals
            </h2>
            <Link href="/owner/approvals" className="text-[13px] text-gold-soft hover:underline">
              View approval queue →
            </Link>
          </div>

          <CalculateDistributionForm />

          {periods.length === 0 ? (
            <div className="rounded-xl border border-line bg-[#100e14]/70 p-6 text-[13px] text-stone">
              No distribution periods have been created yet. Use the calculator above to snapshot a period.
            </div>
          ) : (
            <ul className="space-y-4">
              {periods.slice(0, 5).map((p) => {
                const jadeApproved = p.approvals.some(
                  (a) => a.ownerId === "OWNER_001" && a.calculationVersion === p.calculationVersion && a.decision === "APPROVED",
                );
                const kaelApproved = p.approvals.some(
                  (a) => a.ownerId === "OWNER_002" && a.calculationVersion === p.calculationVersion && a.decision === "APPROVED",
                );
                const myApproved = owner.id === "OWNER_001" ? jadeApproved : kaelApproved;

                return (
                  <li
                    key={p.id}
                    data-testid={`period-card-${p.id}`}
                    className="rounded-xl border border-line bg-[#100e14]/90 p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-display text-[18px] text-ivory">
                          {p.periodStart.toISOString().slice(0, 10)} → {p.periodEnd.toISOString().slice(0, 10)}
                        </span>
                        <span className="ml-3 text-[12px] text-stone">
                          v{p.calculationVersion} · {p.currency.toUpperCase()}
                        </span>
                      </div>
                      <span
                        data-testid={`period-status-${p.id}`}
                        className="rounded-full border border-gold/40 bg-gold/10 px-3 py-0.5 text-[11px] uppercase tracking-[0.15em] text-gold-soft"
                      >
                        {p.status}
                      </span>
                    </div>

                    <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 text-[13px] sm:grid-cols-4">
                      <div>
                        <dt className="text-[11px] text-stone">Platform Revenue</dt>
                        <dd className="font-medium text-ivory">{formatMinorCurrency(p.platformRevenueMinor, p.currency)}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-stone">Deductions & Reserves</dt>
                        <dd className="font-medium text-ivory">{formatMinorCurrency(p.deductionsMinor, p.currency)}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-stone">Net Distributable</dt>
                        <dd className="font-medium text-gold-soft">{formatMinorCurrency(p.distributableAmountMinor, p.currency)}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-stone">My 50% Allocation</dt>
                        <dd className="font-medium text-[#ff85c0]">{formatMinorCurrency(p.myAllocationMinor, p.currency)}</dd>
                      </div>
                    </dl>

                    <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px]">
                      <span className={jadeApproved ? "text-gold-soft" : "text-stone"}>
                        Jade (OWNER_001): {jadeApproved ? "Approved" : "Pending"}
                      </span>
                      <span aria-hidden className="text-line-strong">·</span>
                      <span className={kaelApproved ? "text-gold-soft" : "text-stone"}>
                        Kael Veyre (OWNER_002): {kaelApproved ? "Approved" : "Pending"}
                      </span>
                    </div>

                    {["AWAITING_APPROVAL", "PARTIALLY_APPROVED"].includes(p.status) && !myApproved && (
                      <DistributionDecisionForm
                        periodId={p.id}
                        calculationVersion={p.calculationVersion}
                        ownerDisplayName={owner.displayName}
                      />
                    )}

                    {p.status === "READY_FOR_PAYOUT" && <SimulatePayoutForm periodId={p.id} />}
                    {p.status === "SIMULATED" && (
                      <p
                        role="status"
                        className="mt-3 rounded-xl border border-gold/30 bg-gold/[0.08] px-4 py-2.5 text-[12px] text-gold-soft"
                      >
                        Simulated payout run completed (SIMULATED). Separate payout records generated for Account A and
                        Account B; live settlement transfers remain disabled.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="space-y-6 lg:col-span-5" aria-labelledby="private-payout-heading">
          <div className="flex items-center justify-between gap-3">
            <h2 id="private-payout-heading" className="font-display text-[22px] text-ivory">
              My Private Payout Account
            </h2>
            <Link href="/owner/payouts" className="text-[13px] text-gold-soft hover:underline">
              Manage destination →
            </Link>
          </div>

          <div
            data-testid="my-private-destination-card"
            className="rounded-xl border border-gold/35 bg-[#100e14]/90 p-6"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] uppercase tracking-[0.2em] text-gold-soft">
                Scoped to {owner.displayName} ({owner.id})
              </span>
              <span className="rounded-full border border-line-strong px-2.5 py-0.5 text-[11px] uppercase tracking-[0.14em] text-ivory">
                {myDestination.verificationStatus}
              </span>
            </div>
            <p className="mt-3 font-display text-[24px] text-ivory">{myDestination.accountCode}</p>
            <p className="mt-1 text-[14px] text-stone">{myDestination.maskedAccountLabel}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-[12px]">
              <div>
                <dt className="text-stone">Provider</dt>
                <dd className="mt-0.5 font-medium text-ivory">{myDestination.provider}</dd>
              </div>
              <div>
                <dt className="text-stone">Provider Reference</dt>
                <dd className="mt-0.5 font-mono text-ivory">{myDestination.providerAccountReference}</dd>
              </div>
              <div>
                <dt className="text-stone">Destination Type</dt>
                <dd className="mt-0.5 text-ivory">{myDestination.destinationType}</dd>
              </div>
              <div>
                <dt className="text-stone">Currency</dt>
                <dd className="mt-0.5 uppercase text-ivory">{myDestination.currency}</dd>
              </div>
            </dl>
            <p className="mt-4 text-[12px] text-stone">
              Isolated by PostgreSQL Row-Level Security. The other owner&apos;s private payout account details are never
              accessible from your session.
            </p>
          </div>

          <div className="rounded-xl border border-line bg-[#100e14]/85 p-6">
            <h3 className="font-display text-[19px] text-ivory">
              Platform Activity Snapshot
            </h3>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-[13px]">
              <div>
                <dt className="text-stone">Published Creators</dt>
                <dd className="mt-0.5 font-display text-[22px] text-ivory">{data.platformStats.active_creators}</dd>
              </div>
              <div>
                <dt className="text-stone">Active Fans</dt>
                <dd className="mt-0.5 font-display text-[22px] text-ivory">{data.platformStats.active_fans}</dd>
              </div>
              <div>
                <dt className="text-stone">Active Subscriptions</dt>
                <dd className="mt-0.5 font-display text-[22px] text-ivory">{data.platformStats.active_subscriptions}</dd>
              </div>
              <div>
                <dt className="text-stone">PPV Unlocks</dt>
                <dd className="mt-0.5 font-display text-[22px] text-ivory">{data.platformStats.total_purchases}</dd>
              </div>
            </dl>
          </div>
        </section>
      </div>
    </div>
  );
}

