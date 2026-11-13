import Link from "next/link";
import { requireViewer } from "@/server/auth/request";
import { getOwnerDashboardData } from "@/server/services/ownerFinance";

export default async function OwnerSettingsPage() {
  const viewer = await requireViewer("owner.settings.view");
  const { owner, myDestination, overview } = await getOwnerDashboardData(viewer);

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-line bg-[#100e14]/90 p-6 md:p-8" aria-labelledby="settings-heading">
        <p className="text-[11px] uppercase tracking-[0.22em] text-gold-soft">
          Identity, Security & Governance Configuration
        </p>
        <h2 id="settings-heading" className="mt-1 font-display text-[26px] text-ivory">
          Owner Account & Governance Settings
        </h2>
        <p className="mt-2 max-w-[68ch] text-[13px] text-stone">
          Your display identity ({owner.displayName}) is decoupled from legal/compliance records and login email
          addresses. Two-step authentication (AAL2 MFA) is mandatory for every owner session and financial action.
        </p>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-line bg-[#0b090e]/90 p-5">
            <dt className="text-[11px] uppercase tracking-[0.16em] text-stone">Owner Registry ID</dt>
            <dd className="mt-1 font-display text-[22px] text-ivory">{owner.id}</dd>
          </div>
          <div className="rounded-xl border border-line bg-[#0b090e]/90 p-5">
            <dt className="text-[11px] uppercase tracking-[0.16em] text-stone">Platform Display Identity</dt>
            <dd className="mt-1 font-display text-[22px] text-ivory">{owner.displayName}</dd>
          </div>
          <div className="rounded-xl border border-line bg-[#0b090e]/90 p-5">
            <dt className="text-[11px] uppercase tracking-[0.16em] text-stone">Economic Ownership</dt>
            <dd className="mt-1 font-display text-[22px] text-gold-soft">
              {owner.percentageDisplay} ({owner.percentageBasisPoints} bps)
            </dd>
          </div>
          <div className="rounded-xl border border-line bg-[#0b090e]/90 p-5">
            <dt className="text-[11px] uppercase tracking-[0.16em] text-stone">Private Payout Account</dt>
            <dd className="mt-1 font-display text-[22px] text-ivory">{myDestination.accountCode}</dd>
          </div>
          <div className="rounded-xl border border-line bg-[#0b090e]/90 p-5">
            <dt className="text-[11px] uppercase tracking-[0.16em] text-stone">Provisional Platform Fee</dt>
            <dd className="mt-1 font-display text-[22px] text-ivory">
              {overview.provisionalPlatformFeeBps / 100}% ({overview.provisionalPlatformFeeBps} bps)
            </dd>
          </div>
          <div className="rounded-xl border border-line bg-[#0b090e]/90 p-5">
            <dt className="text-[11px] uppercase tracking-[0.16em] text-stone">Session Assurance Level</dt>
            <dd className="mt-1 font-display text-[22px] text-gold-soft">AAL{viewer.aal} · MFA Verified</dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/account/security"
            className="inline-flex h-10 items-center justify-center rounded-full border border-gold/50 bg-gold/15 px-5 text-[13px] font-medium text-ivory hover:bg-gold/25"
          >
            Manage Password, MFA & Sessions
          </Link>
          <Link
            href="/owner/payouts"
            className="inline-flex h-10 items-center justify-center rounded-full border border-line-strong px-5 text-[13px] text-stone hover:border-gold/40 hover:text-ivory"
          >
            Configure {myDestination.accountCode}
          </Link>
        </div>
      </section>
    </div>
  );
}

