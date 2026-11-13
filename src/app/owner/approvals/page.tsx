import { formatMinorCurrency } from "@/components/owner/OwnerShell";
import { requireViewer } from "@/server/auth/request";
import { getOwnerDashboardData } from "@/server/services/ownerFinance";
import { DistributionDecisionForm, SimulatePayoutForm } from "../OwnerForms";

export default async function OwnerApprovalsPage() {
  const viewer = await requireViewer("owner.distributions.approve");
  const { owner, periods } = await getOwnerDashboardData(viewer);

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-gold/35 bg-[#100e14]/90 p-6 md:p-8" aria-labelledby="approvals-heading">
        <p className="text-[11px] uppercase tracking-[0.22em] text-gold-soft">
          Section 8 · Dual-Owner Approval Governance
        </p>
        <h2 id="approvals-heading" className="mt-1 font-display text-[26px] text-ivory">
          Dual-Owner Distribution Approvals
        </h2>
        <p className="mt-2 max-w-[68ch] text-[13px] text-stone">
          Both Jade (OWNER_001) and Kael Veyre (OWNER_002) must independently approve a reconciled distribution using
          their own AAL2 session and a current 6-digit MFA code before simulated payouts can run.
        </p>
      </section>

      {periods.length === 0 ? (
        <div className="rounded-xl border border-line bg-[#100e14]/80 p-7 text-[13px] text-stone">
          No distribution periods are currently awaiting approval.
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display text-[20px] text-ivory">
                      {p.periodStart.toISOString().slice(0, 10)} → {p.periodEnd.toISOString().slice(0, 10)} (v{p.calculationVersion})
                    </h3>
                    <p className="text-[12px] text-stone">
                      Net Distributable: {formatMinorCurrency(p.distributableAmountMinor, p.currency)} · My 50%:{" "}
                      <strong className="text-[#ff85c0]">{formatMinorCurrency(p.myAllocationMinor, p.currency)}</strong>
                    </p>
                  </div>
                  <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[11px] uppercase tracking-[0.15em] text-gold-soft">
                    {p.status}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-line bg-[#0b090e]/90 p-3.5 text-[13px]">
                    <span className="block text-[11px] uppercase tracking-[0.14em] text-stone">OWNER_001 · Jade</span>
                    <span className={jadeApproved ? "mt-1 block font-medium text-gold-soft" : "mt-1 block text-stone"}>
                      {jadeApproved ? `Approved (v${p.calculationVersion})` : "Awaiting Jade's MFA Approval"}
                    </span>
                  </div>
                  <div className="rounded-lg border border-line bg-[#0b090e]/90 p-3.5 text-[13px]">
                    <span className="block text-[11px] uppercase tracking-[0.14em] text-stone">OWNER_002 · Kael Veyre</span>
                    <span className={kaelApproved ? "mt-1 block font-medium text-gold-soft" : "mt-1 block text-stone"}>
                      {kaelApproved ? `Approved (v${p.calculationVersion})` : "Awaiting Kael Veyre's MFA Approval"}
                    </span>
                  </div>
                </div>

                {["AWAITING_APPROVAL", "PARTIALLY_APPROVED"].includes(p.status) && !myApproved && (
                  <DistributionDecisionForm
                    periodId={p.id}
                    calculationVersion={p.calculationVersion}
                    ownerDisplayName={owner.displayName}
                  />
                )}

                {p.status === "READY_FOR_PAYOUT" && <SimulatePayoutForm periodId={p.id} />}

                {p.approvals.length > 0 && (
                  <div className="mt-4 border-t border-line pt-3">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-stone">Immutable Approval History</p>
                    <ul className="mt-2 space-y-1 text-[12px] text-stone">
                      {p.approvals.map((ap) => (
                        <li key={ap.id}>
                          <strong className="text-ivory">{ap.displayName}</strong> ({ap.ownerId}) — {ap.decision} on calculation v
                          {ap.calculationVersion} at {ap.approvedAt.toISOString()}
                          {ap.note ? ` · "${ap.note}"` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

