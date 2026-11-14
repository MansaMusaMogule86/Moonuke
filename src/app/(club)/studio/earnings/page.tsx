import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudioHeader } from "@/components/studio/StudioHeader";
import { EarningsInteractivePanel } from "@/components/studio/EarningsInteractivePanel";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { formatMoney } from "@/server/payments";
import {
  myDetailedStudioEarnings,
  type DetailedBalanceRow,
  type PaymentRow,
} from "@/server/services/earnings";

export const metadata: Metadata = { title: "Earnings & Referrals · Studio" };

const KIND: Record<PaymentRow["kind"], string> = {
  subscription: "Membership",
  ppv: "Post unlock",
  tip: "Tip",
  paid_message: "Paid message",
};
const STATUS_TONE: Record<string, "vip" | "member" | "locked" | "neutral" | "live"> = {
  succeeded: "vip",
  credited: "vip",
  confirmed: "vip",
  paid: "vip",
  processing: "member",
  captured: "member",
  partially_reversed: "live",
  reversed: "live",
  refunded: "live",
  charged_back: "live",
  failed: "live",
  disputed: "live",
  held: "live",
  canceled: "locked",
  pending: "member",
  created: "member",
  requested: "member",
  approved: "member",
};
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
const money = (cents: number, currency: string) => formatMoney({ amountCents: cents, currency });

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 rounded-[var(--radius-lg)] border border-line bg-ink-2 p-6 text-[14px] text-ash">
      {children}
    </p>
  );
}

const DEFAULT_DETAILED_BAL: DetailedBalanceRow = {
  currency: "USD",
  contentAvailableCents: 0,
  contentPendingCents: 0,
  contentOnHoldCents: 0,
  referralAvailableCents: 0,
  referralPendingCents: 0,
  referralOnHoldCents: 0,
  totalAvailableCents: 0,
  totalPendingCents: 0,
  totalOnHoldCents: 0,
  withdrawnInProgressCents: 0,
  withdrawnCompletedCents: 0,
};

export default async function EarningsPage() {
  const viewer = await requireViewer("club.discover");
  if (viewer.role !== "creator") notFound();
  const e = await myDetailedStudioEarnings(viewer);
  const bal = e.detailedBalances[0] ?? DEFAULT_DETAILED_BAL;
  const ccy = bal.currency;

  return (
    <div className="mx-auto max-w-[1080px] px-5 pb-28 pt-6 md:px-10 md:pt-8">
      <StudioHeader
        eyebrow="Creator Studio"
        title="Earnings, Referrals & Withdrawals"
        lede="85% creator allocation on every eligible purchase, plus 10% of the 15% platform fee (1.5% of eligible purchase) on direct single-level creator referrals. Referral rewards are funded strictly from the platform fee and never reduce a referred creator's 85% earnings."
      />

      {!e.paymentsEnabled && (
        <p
          role="status"
          className="mt-6 rounded-[var(--radius-lg)] border border-gold/35 bg-gold/[0.06] px-4 py-3 text-[13px] text-gold-soft"
        >
          Provider sandbox mode is active. Live card processing and live bank wires remain gated until the US LLC (Wyoming or Delaware) and Stripe production account verification are finalized.
        </p>
      )}

      {/* 1. Six Distinct Earnings & Withdrawal Balance Cards */}
      <section aria-labelledby="bal-h" className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="bal-h" className="text-[18px] font-medium text-ivory">
            Balance Breakdown ({ccy})
          </h2>
          <span className="text-[12px] text-ash">
            {e.platformConfig.creatorShareBps / 100}% Creator · {e.platformConfig.platformFeeBps / 100}% Platform ·{" "}
            {e.platformConfig.settlementHoldDays}-day settlement hold
          </span>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-[var(--radius-lg)] border border-gold/40 bg-ink-2 p-5">
            <p className="eyebrow text-gold-soft">Available Balance</p>
            <p className="mt-2 text-[28px] font-medium leading-none tabular-nums text-ivory">
              {money(bal.totalAvailableCents, ccy)}
            </p>
            <p className="mt-2 text-[12px] text-stone">
              Content: {money(bal.contentAvailableCents, ccy)} · Referrals: {money(bal.referralAvailableCents, ccy)}
            </p>
          </div>

          <div className="rounded-[var(--radius-lg)] border border-line bg-ink-2 p-5">
            <p className="eyebrow text-stone">Pending Content Earnings</p>
            <p className="mt-2 text-[26px] font-medium leading-none tabular-nums text-ivory">
              {money(bal.contentPendingCents, ccy)}
            </p>
            <p className="mt-2 text-[12px] text-ash">
              85% creator share clearing {e.platformConfig.settlementHoldDays}-day settlement window
            </p>
          </div>

          <div className="rounded-[var(--radius-lg)] border border-line bg-ink-2 p-5">
            <p className="eyebrow text-stone">Pending Referral Earnings</p>
            <p className="mt-2 text-[26px] font-medium leading-none tabular-nums text-ivory">
              {money(bal.referralPendingCents, ccy)}
            </p>
            <p className="mt-2 text-[12px] text-ash">
              1.5% direct referral share (10% of 15% platform fee) in settlement hold
            </p>
          </div>

          <div className="rounded-[var(--radius-lg)] border border-line bg-ink-2 p-5">
            <p className="eyebrow text-stone">Reserved / Held Balance</p>
            <p className="mt-2 text-[26px] font-medium leading-none tabular-nums text-ivory">
              {money(bal.totalOnHoldCents, ccy)}
            </p>
            <p className="mt-2 text-[12px] text-ash">
              Content hold: {money(bal.contentOnHoldCents, ccy)} · Referral hold: {money(bal.referralOnHoldCents, ccy)}
            </p>
          </div>

          <div className="rounded-[var(--radius-lg)] border border-line bg-ink-2 p-5">
            <p className="eyebrow text-stone">Withdrawals in Progress</p>
            <p className="mt-2 text-[26px] font-medium leading-none tabular-nums text-ivory">
              {money(bal.withdrawnInProgressCents, ccy)}
            </p>
            <p className="mt-2 text-[12px] text-ash">
              Transferred to connected account; awaiting bank settlement confirmation
            </p>
          </div>

          <div className="rounded-[var(--radius-lg)] border border-line bg-ink-2 p-5">
            <p className="eyebrow text-stone">Completed Withdrawals</p>
            <p className="mt-2 text-[26px] font-medium leading-none tabular-nums text-ivory">
              {money(bal.withdrawnCompletedCents, ccy)}
            </p>
            <p className="mt-2 text-[12px] text-ash">Confirmed settled bank payouts</p>
          </div>
        </div>
      </section>

      {/* 2. Interactive Recruitment Link, Bank Onboarding & Withdrawal Panel */}
      <EarningsInteractivePanel
        recruitmentLink={e.recruitmentLink}
        payoutAccount={e.payoutAccount}
        waitlistEntry={e.waitlistEntry}
        countryCapabilities={e.countryCapabilities}
        availableBalanceCents={bal.totalAvailableCents}
        minWithdrawalCents={e.platformConfig.defaultMinWithdrawalCents}
        defaultCurrency={ccy}
      />

      {/* 3. Direct Creator Referrals & Commissions */}
      <section aria-labelledby="ref-h" className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="ref-h" className="text-[18px] font-medium text-ivory">
            Directly Referred Creators ({e.referredCreators.length})
          </h2>
          <span className="text-[12px] text-ash">Single-level attribution only · No indirect or multi-level commissions</span>
        </div>

        {e.referredCreators.length === 0 ? (
          <Empty>
            You haven&apos;t recruited any creators yet. Share your unique creator recruitment link ({e.recruitmentLink.recruitmentPath}) to earn 10% of the platform fee (1.5% of eligible purchases) from creators you directly refer.
          </Empty>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-[var(--radius-lg)] border border-line bg-ink-2">
            <table className="w-full min-w-[560px] text-left text-[14px]">
              <thead>
                <tr className="border-b border-line text-[12px] uppercase tracking-[0.12em] text-ash">
                  <th scope="col" className="px-4 py-3 font-normal">Creator</th>
                  <th scope="col" className="px-4 py-3 font-normal">Handle</th>
                  <th scope="col" className="px-4 py-3 font-normal">Attribution Status</th>
                  <th scope="col" className="px-4 py-3 font-normal">Captured</th>
                </tr>
              </thead>
              <tbody>
                {e.referredCreators.map((r) => (
                  <tr key={r.referredCreatorId} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-medium text-ivory">{r.displayName}</td>
                    <td className="px-4 py-3 text-stone">{r.handle ? `@${r.handle}` : "Onboarding"}</td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-stone">{when(r.capturedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {e.referralCommissions.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-[var(--radius-lg)] border border-line bg-ink-2">
            <table className="w-full min-w-[640px] text-left text-[14px]">
              <caption className="px-4 pt-3 text-left text-[12px] uppercase tracking-[0.14em] text-gold-soft">
                Direct Referral Commission Ledger
              </caption>
              <thead>
                <tr className="border-b border-line text-[12px] uppercase tracking-[0.12em] text-ash">
                  <th scope="col" className="px-4 py-3 font-normal">Eligible Sale</th>
                  <th scope="col" className="px-4 py-3 font-normal">Platform Fee (15%)</th>
                  <th scope="col" className="px-4 py-3 font-normal">Your Commission (1.5%)</th>
                  <th scope="col" className="px-4 py-3 font-normal">Refunded</th>
                  <th scope="col" className="px-4 py-3 font-normal">Status</th>
                  <th scope="col" className="px-4 py-3 font-normal">Date</th>
                </tr>
              </thead>
              <tbody>
                {e.referralCommissions.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 tabular-nums text-ivory">{money(c.eligiblePurchaseCents, c.currency)}</td>
                    <td className="px-4 py-3 tabular-nums text-stone">{money(c.platformFeeCents, c.currency)}</td>
                    <td className="px-4 py-3 font-medium tabular-nums text-gold-soft">
                      {money(c.commissionCents - c.refundedCommissionCents, c.currency)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-ash">
                      {c.refundedCommissionCents > 0 ? money(c.refundedCommissionCents, c.currency) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[c.status] ?? "neutral"}>{c.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-stone">{when(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 4. Content Sales Transactions */}
      <section aria-labelledby="tx-h" className="mt-10">
        <h2 id="tx-h" className="text-[18px] font-medium text-ivory">
          Content Transactions
        </h2>
        {e.payments.length === 0 ? (
          <Empty>
            No transactions yet. Memberships, post unlocks, tips and paid messages will appear here as they are confirmed.
          </Empty>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-[var(--radius-lg)] border border-line bg-ink-2">
            <table className="w-full min-w-[560px] text-left text-[14px]">
              <caption className="sr-only">Your payment transactions</caption>
              <thead>
                <tr className="border-b border-line text-[12px] uppercase tracking-[0.12em] text-ash">
                  <th scope="col" className="px-4 py-3 font-normal">Type</th>
                  <th scope="col" className="px-4 py-3 font-normal">Gross Amount</th>
                  <th scope="col" className="px-4 py-3 font-normal">Your Allocation (85%)</th>
                  <th scope="col" className="px-4 py-3 font-normal">Status</th>
                  <th scope="col" className="px-4 py-3 font-normal">Date</th>
                </tr>
              </thead>
              <tbody>
                {e.payments.map((p) => {
                  const feeBps = p.feeBps ?? e.platformConfig.platformFeeBps;
                  const netCents = p.amountCents - Math.floor((p.amountCents * feeBps) / 10000);
                  return (
                    <tr key={p.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 text-ivory">{KIND[p.kind]}</td>
                      <td className="px-4 py-3 tabular-nums text-stone">{money(p.amountCents, p.currency)}</td>
                      <td className="px-4 py-3 font-medium tabular-nums text-ivory">{money(netCents, p.currency)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>{p.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-stone">{when(p.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 5. Withdrawals History (Distinguishing Connected Account Transfer from Bank Settlement) */}
      <section aria-labelledby="po-h" className="mt-10">
        <h2 id="po-h" className="text-[18px] font-medium text-ivory">
          Withdrawal & Payout History
        </h2>
        {e.detailedPayouts.length === 0 ? (
          <Empty>
            No withdrawals yet. Connect a verified bank destination and reach at least{" "}
            {money(e.platformConfig.defaultMinWithdrawalCents, "USD")} in settled earnings to request a withdrawal.
          </Empty>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-[var(--radius-lg)] border border-line bg-ink-2">
            <table className="w-full min-w-[720px] text-left text-[14px]">
              <caption className="sr-only">Your payouts</caption>
              <thead>
                <tr className="border-b border-line text-[12px] uppercase tracking-[0.12em] text-ash">
                  <th scope="col" className="px-4 py-3 font-normal">Net Amount</th>
                  <th scope="col" className="px-4 py-3 font-normal">Destination</th>
                  <th scope="col" className="px-4 py-3 font-normal">Transfer Ref</th>
                  <th scope="col" className="px-4 py-3 font-normal">Bank Payout Ref</th>
                  <th scope="col" className="px-4 py-3 font-normal">Status</th>
                  <th scope="col" className="px-4 py-3 font-normal">Requested</th>
                </tr>
              </thead>
              <tbody>
                {e.detailedPayouts.map((o) => (
                  <tr key={o.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-medium tabular-nums text-ivory">
                      {money(o.netAmountCents, o.currency)}
                    </td>
                    <td className="px-4 py-3 text-stone">{o.maskedDestination ?? "Connected Bank"}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-ash">{o.transferRef ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-ash">
                      {o.bankPayoutRef ?? (o.failureReason ? `Failed: ${o.failureReason}` : "Awaiting settlement")}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[o.status] ?? "neutral"}>{o.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-stone">{when(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 6. Refund, Chargeback & Hold Adjustments History */}
      <section aria-labelledby="adj-h" className="mt-10">
        <h2 id="adj-h" className="text-[18px] font-medium text-ivory">
          Refund, Dispute & Adjustment History
        </h2>
        {e.ledgerAdjustments.length === 0 ? (
          <Empty>No refunds, chargebacks, or dispute hold adjustments on your ledger.</Empty>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-[var(--radius-lg)] border border-line bg-ink-2">
            <table className="w-full min-w-[560px] text-left text-[14px]">
              <thead>
                <tr className="border-b border-line text-[12px] uppercase tracking-[0.12em] text-ash">
                  <th scope="col" className="px-4 py-3 font-normal">Balance Leg</th>
                  <th scope="col" className="px-4 py-3 font-normal">Adjustment</th>
                  <th scope="col" className="px-4 py-3 font-normal">Reason / Memo</th>
                  <th scope="col" className="px-4 py-3 font-normal">Date</th>
                </tr>
              </thead>
              <tbody>
                {e.ledgerAdjustments.map((a) => (
                  <tr key={a.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 uppercase text-[12px] text-stone">{a.accountKind}</td>
                    <td className="px-4 py-3 font-medium tabular-nums text-ivory">{money(a.amountCents, a.currency)}</td>
                    <td className="px-4 py-3 text-stone">{a.memo}</td>
                    <td className="px-4 py-3 text-stone">{when(a.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 7. Configurable Statement Descriptors & US LLC Entity Disclosure */}
      <section aria-labelledby="desc-h" className="mt-10 rounded-[var(--radius-lg)] border border-line bg-ink-2 p-6">
        <h2 id="desc-h" className="text-[16px] font-medium text-ivory">
          Payment Descriptors & US LLC Entity Configuration
        </h2>
        <div className="mt-3 grid gap-4 text-[12px] text-stone md:grid-cols-3">
          <div className="rounded-[var(--radius-md)] border border-line bg-ink p-3.5">
            <p className="text-[11px] uppercase tracking-[0.14em] text-gold-soft">Fan Card Statement Descriptor</p>
            <p className="mt-1 font-mono text-ivory">{e.descriptors.fanCardStatement.effectivePreview}</p>
            <p className="mt-1 text-ash">{e.descriptors.fanCardStatement.controlBreakdown.providerControlled}</p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-line bg-ink p-3.5">
            <p className="text-[11px] uppercase tracking-[0.14em] text-gold-soft">Creator Bank Payout Sender</p>
            <p className="mt-1 font-mono text-ivory">{e.descriptors.creatorBankPayout.effectivePreview}</p>
            <p className="mt-1 text-ash">{e.descriptors.creatorBankPayout.controlBreakdown.providerControlled}</p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-line bg-ink p-3.5">
            <p className="text-[11px] uppercase tracking-[0.14em] text-gold-soft">Receipt & Entity Identity</p>
            <p className="mt-1 font-medium text-ivory">{e.descriptors.receiptBusinessIdentity.displayName}</p>
            <p className="mt-1 text-ash">
              Formation state ({e.platformConfig.formationState}) and processor KYB status remain configurable until legal formation is finalized.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
