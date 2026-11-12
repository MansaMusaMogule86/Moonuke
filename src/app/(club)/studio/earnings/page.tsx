import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudioHeader } from "@/components/studio/StudioHeader";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { formatMoney } from "@/server/payments";
import { myEarnings, type PaymentRow, type PayoutRow } from "@/server/services/earnings";

export const metadata: Metadata = { title: "Earnings · Studio" };

const KIND: Record<PaymentRow["kind"], string> = { subscription: "Membership", ppv: "Post unlock", tip: "Tip", paid_message: "Paid message" };
const STATUS_TONE: Record<string, "vip" | "member" | "locked" | "neutral" | "live"> = {
  succeeded: "vip",
  paid: "vip",
  refunded: "live",
  charged_back: "live",
  failed: "live",
  disputed: "live",
  canceled: "locked",
  pending: "member",
  created: "member",
  requested: "member",
  approved: "member",
};
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
const money = (cents: number, currency: string) => formatMoney({ amountCents: cents, currency });

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 rounded-[var(--radius-lg)] border border-line bg-ink-2 p-6 text-[14px] text-ash">{children}</p>;
}

export default async function EarningsPage() {
  const viewer = await requireViewer("club.discover");
  if (viewer.role !== "creator") notFound();
  const e = await myEarnings(viewer);
  const balances = e.balances.length ? e.balances : [{ currency: "USD", available: 0, onHold: 0 }];

  return (
    <div className="mx-auto max-w-[1000px] px-5 pb-28 pt-6 md:px-10 md:pt-8">
      <StudioHeader
        eyebrow="Studio"
        title="Earnings"
        lede="Your gross, fees, refunds and net from confirmed payment records only. Money is never calculated from UI events, and no payout is sent until payments and a payout destination are approved."
      />

      {!e.paymentsEnabled && (
        <p role="status" className="mt-6 rounded-[var(--radius-lg)] border border-gold/35 bg-gold/[0.06] px-4 py-3 text-[14px] text-gold-soft">
          Payments aren&apos;t active yet. Nothing has been charged, so every figure below is zero and there is nothing to pay out. This page becomes live when payments are switched on.
        </p>
      )}

      <section aria-labelledby="bal-h" className="mt-8">
        <h2 id="bal-h" className="text-[18px] font-medium text-ivory">Balances</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {balances.map((b) => (
            <div key={b.currency} className="rounded-[var(--radius-lg)] border border-line bg-ink-2 p-5">
              <p className="eyebrow text-stone">{b.currency}</p>
              <p className="mt-2 text-[26px] font-medium leading-none tabular-nums text-ivory">{money(b.available, b.currency)}</p>
              <p className="mt-2 text-[12px] text-ash">
                {b.onHold > 0 ? `${money(b.onHold, b.currency)} on hold (open dispute)` : "available · nothing on hold"}
              </p>
            </div>
          ))}
          <div className="rounded-[var(--radius-lg)] border border-line bg-ink-2 p-5">
            <p className="eyebrow text-stone">Payout</p>
            <p className="mt-2 text-[26px] font-medium leading-none text-ivory">Not available</p>
            <p className="mt-2 text-[12px] text-ash">A payout destination and an approved processor are required first.</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="tx-h" className="mt-8">
        <h2 id="tx-h" className="text-[18px] font-medium text-ivory">Transactions</h2>
        {e.payments.length === 0 ? (
          <Empty>No transactions yet. Memberships, post unlocks, tips and paid messages will appear here as they are confirmed.</Empty>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-[var(--radius-lg)] border border-line bg-ink-2">
            <table className="w-full min-w-[560px] text-left text-[14px]">
              <caption className="sr-only">Your payment transactions</caption>
              <thead>
                <tr className="border-b border-line text-[12px] uppercase tracking-[0.12em] text-ash">
                  <th scope="col" className="px-4 py-3 font-normal">Type</th>
                  <th scope="col" className="px-4 py-3 font-normal">Amount</th>
                  <th scope="col" className="px-4 py-3 font-normal">Status</th>
                  <th scope="col" className="px-4 py-3 font-normal">Date</th>
                </tr>
              </thead>
              <tbody>
                {e.payments.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 text-ivory">{KIND[p.kind]}</td>
                    <td className="px-4 py-3 tabular-nums text-ivory">{money(p.amountCents, p.currency)}</td>
                    <td className="px-4 py-3"><Badge tone={STATUS_TONE[p.status] ?? "neutral"}>{p.status}</Badge></td>
                    <td className="px-4 py-3 text-stone">{when(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="po-h" className="mt-8">
        <h2 id="po-h" className="text-[18px] font-medium text-ivory">Payouts</h2>
        {e.payouts.length === 0 ? (
          <Empty>No payouts yet. A payout needs an approved processor, a destination and a payout policy (minimum and hold).</Empty>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-[var(--radius-lg)] border border-line bg-ink-2">
            <table className="w-full min-w-[560px] text-left text-[14px]">
              <caption className="sr-only">Your payouts</caption>
              <thead>
                <tr className="border-b border-line text-[12px] uppercase tracking-[0.12em] text-ash">
                  <th scope="col" className="px-4 py-3 font-normal">Amount</th>
                  <th scope="col" className="px-4 py-3 font-normal">Status</th>
                  <th scope="col" className="px-4 py-3 font-normal">Requested</th>
                  <th scope="col" className="px-4 py-3 font-normal">Updated</th>
                </tr>
              </thead>
              <tbody>
                {e.payouts.map((o: PayoutRow) => (
                  <tr key={o.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 tabular-nums text-ivory">{money(o.amountCents, o.currency)}</td>
                    <td className="px-4 py-3"><Badge tone={STATUS_TONE[o.status] ?? "neutral"}>{o.status}</Badge></td>
                    <td className="px-4 py-3 text-stone">{when(o.createdAt)}</td>
                    <td className="px-4 py-3 text-stone">{when(o.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
