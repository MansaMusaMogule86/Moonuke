import { formatMinorCurrency } from "@/components/owner/OwnerShell";
import { requireViewer } from "@/server/auth/request";
import { getOwnerDashboardData } from "@/server/services/ownerFinance";
import { RecordDeductionsForms } from "../OwnerForms";

export default async function OwnerRevenuePage() {
  const viewer = await requireViewer("owner.revenue.view");
  const data = await getOwnerDashboardData(viewer);
  const { overview, expenses, reserves, conversions } = data;

  const waterfallRows = [
    {
      step: "1. Gross settled fan collections",
      amount: formatMinorCurrency(overview.grossFanCollectionsMinor),
      note: "Settled subscriptions, PPV unlocks, and converted multi-currency settlements",
    },
    {
      step: "2. Less applicable taxes & transaction reversals",
      amount: `-${formatMinorCurrency(overview.refundsAndChargebacksMinor)}`,
      note: "Taxes, settled refunds, and lost chargebacks/disputes",
    },
    {
      step: "3. Less creator contractual earnings (85%)",
      amount: `-${formatMinorCurrency(overview.creatorLiabilitiesMinor)}`,
      note: "Protected creator liabilities — strictly segregated and never distributable to owners",
    },
    {
      step: "4. Equals platform revenue before platform-borne costs (15% provisional)",
      amount: formatMinorCurrency(overview.platformRevenueMinor),
      note: "Gross platform fee share before operating deductions",
      highlight: "gold",
    },
    {
      step: "5. Less approved operating expenses & reserve allocations",
      amount: `-${formatMinorCurrency(overview.approvedExpensesMinor + overview.reservesMinor)}`,
      note: "Approved operating expenses, risk reserves, and deterministic rounding carry",
    },
    {
      step: "6. Equals net distributable platform earnings",
      amount: formatMinorCurrency(overview.netDistributableEarningsMinor),
      note: "Allocated 50% (5000 bps) to Jade and 50% (5000 bps) to Kael Veyre",
      highlight: "pink",
    },
  ];

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-line bg-[#100e14]/90 p-6 md:p-8" aria-labelledby="waterfall-heading">
        <p className="text-[11px] uppercase tracking-[0.22em] text-gold-soft">Section 6 · Financial Waterfall</p>
        <h2 id="waterfall-heading" className="mt-1 font-display text-[26px] text-ivory">
          Platform Revenue & Waterfall Ledger
        </h2>
        <p className="mt-2 max-w-[68ch] text-[13px] text-stone">
          Platform owners receive 50% each of approved net distributable platform earnings — never 50% of gross fan
          payments. Creator contractual liabilities ({overview.creatorContractualShareBps / 100}%) are deducted first.
        </p>

        <div className="mt-6 divide-y divide-line rounded-xl border border-line bg-[#0b090e]/90">
          {waterfallRows.map((row) => (
            <div key={row.step} className="flex flex-col justify-between gap-2 px-5 py-4 sm:flex-row sm:items-center">
              <div>
                <p
                  className={
                    row.highlight === "pink"
                      ? "font-medium text-[#ff85c0]"
                      : row.highlight === "gold"
                        ? "font-medium text-gold-soft"
                        : "font-medium text-ivory"
                  }
                >
                  {row.step}
                </p>
                <p className="text-[12px] text-stone">{row.note}</p>
              </div>
              <span
                className={
                  row.highlight === "pink"
                    ? "font-display text-[22px] text-[#ff85c0]"
                    : row.highlight === "gold"
                      ? "font-display text-[22px] text-gold-soft"
                      : "font-display text-[20px] text-ivory"
                }
              >
                {row.amount}
              </span>
            </div>
          ))}
        </div>
      </section>

      <RecordDeductionsForms />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-[#100e14]/85 p-6" aria-labelledby="expenses-list-heading">
          <h3 id="expenses-list-heading" className="font-display text-[20px] text-ivory">
            Approved Operating Expenses
          </h3>
          {expenses.length === 0 ? (
            <p className="mt-3 text-[13px] text-stone">No operating expenses recorded yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line text-[13px]">
              {expenses.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <p className="font-medium text-ivory">{e.category}</p>
                    <p className="text-[12px] text-stone">{e.description}</p>
                  </div>
                  <span className="font-mono text-ivory">{formatMinorCurrency(e.amountMinor, e.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-line bg-[#100e14]/85 p-6" aria-labelledby="reserves-list-heading">
          <h3 id="reserves-list-heading" className="font-display text-[20px] text-ivory">
            Active Reserves & FX Conversions
          </h3>
          {reserves.length === 0 && conversions.length === 0 ? (
            <p className="mt-3 text-[13px] text-stone">No explicit reserves or FX conversions recorded yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line text-[13px]">
              {reserves.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <p className="font-medium text-ivory">Reserve · {r.status}</p>
                    <p className="text-[12px] text-stone">{r.reason}</p>
                  </div>
                  <span className="font-mono text-gold-soft">{formatMinorCurrency(r.amountMinor, r.currency)}</span>
                </li>
              ))}
              {conversions.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <p className="font-medium text-ivory">
                      FX {c.sourceCurrency.toUpperCase()} → {c.targetCurrency.toUpperCase()} ({c.reference})
                    </p>
                    <p className="text-[12px] text-stone">
                      Rate: {c.rateNumerator}/{c.rateDenominator}
                    </p>
                  </div>
                  <span className="font-mono text-ivory">
                    {formatMinorCurrency(c.convertedAmountMinor, c.targetCurrency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

