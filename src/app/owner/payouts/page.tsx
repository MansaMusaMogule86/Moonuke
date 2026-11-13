import { formatMinorCurrency } from "@/components/owner/OwnerShell";
import { requireViewer } from "@/server/auth/request";
import { getOwnerDashboardData } from "@/server/services/ownerFinance";
import { UpdatePayoutDestinationForm } from "../OwnerForms";

export default async function OwnerPayoutsPage() {
  const viewer = await requireViewer("owner.payout_accounts.manage");
  const { owner, myDestination, myPayouts } = await getOwnerDashboardData(viewer);

  return (
    <div className="space-y-8">
      <section
        data-testid="payout-destination-panel"
        className="rounded-2xl border border-gold/35 bg-[#100e14]/90 p-6 md:p-8"
        aria-labelledby="payout-destination-heading"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] uppercase tracking-[0.22em] text-gold-soft">
            Section 7 · Separate Payout Destinations (RLS Isolated)
          </p>
          <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-0.5 text-[11px] uppercase tracking-[0.15em] text-gold-soft">
            {myDestination.accountCode} · {myDestination.verificationStatus}
          </span>
        </div>
        <h2 id="payout-destination-heading" className="mt-2 font-display text-[26px] text-ivory">
          {owner.displayName}&apos;s Private Payout Destination ({myDestination.accountCode})
        </h2>
        <p className="mt-2 max-w-[68ch] text-[13px] text-stone">
          This destination belongs exclusively to {owner.displayName} ({owner.id}). PostgreSQL Row-Level Security ensures
          the other owner&apos;s payout account and statements are never visible here.
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-4 rounded-xl border border-line bg-[#0b090e]/90 p-5 text-[13px] sm:grid-cols-4">
          <div>
            <dt className="text-[11px] text-stone">Account Code</dt>
            <dd data-testid="payout-account-code" className="mt-1 font-display text-[20px] text-ivory">
              {myDestination.accountCode}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-stone">Masked Label</dt>
            <dd data-testid="payout-masked-label" className="mt-1 font-medium text-ivory">
              {myDestination.maskedAccountLabel}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-stone">Provider Reference</dt>
            <dd data-testid="payout-provider-ref" className="mt-1 font-mono text-gold-soft">
              {myDestination.providerAccountReference}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-stone">Provider & Currency</dt>
            <dd className="mt-1 text-ivory">
              {myDestination.provider} · {myDestination.currency.toUpperCase()}
            </dd>
          </div>
        </dl>
      </section>

      <UpdatePayoutDestinationForm destination={myDestination} />

      <section className="rounded-xl border border-line bg-[#100e14]/85 p-6" aria-labelledby="statements-heading">
        <h3 id="statements-heading" className="font-display text-[20px] text-ivory">
          My Simulated Payout Statements ({myDestination.accountCode})
        </h3>
        {myPayouts.length === 0 ? (
          <p className="mt-3 text-[13px] text-stone">
            No simulated payouts have been executed for {myDestination.accountCode} yet.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line text-[13px]">
            {myPayouts.map((p) => (
              <li key={p.id} className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium text-ivory">
                      {p.accountCode} · {p.maskedAccountLabel}
                    </span>
                    <span className="ml-3 font-mono text-[12px] text-stone">
                      Ref: {p.providerReference ?? p.idempotencyKey}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full border border-line-strong px-2.5 py-0.5 text-[11px] uppercase tracking-[0.14em] text-gold-soft">
                      {p.status}
                    </span>
                    <span className="font-display text-[20px] text-[#ff85c0]">
                      {formatMinorCurrency(p.amountMinor, p.currency)}
                    </span>
                  </div>
                </div>
                {p.failureReason && (
                  <p className="mt-1 text-[12px] text-rose-300">{p.failureReason}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

