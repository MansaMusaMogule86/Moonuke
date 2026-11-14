"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { CountryPayoutCapability } from "@/server/payments/countryEligibility";
import type {
  CreatorPayoutAccountView,
  CreatorRecruitmentLink,
} from "@/server/services/creatorReferralsAndWithdrawals";
import {
  onboardPayoutAccountAction,
  requestWithdrawalAction,
  updateBankDestinationAction,
} from "@/app/(club)/studio/earnings/actions";

export function EarningsInteractivePanel({
  recruitmentLink,
  payoutAccount,
  waitlistEntry,
  countryCapabilities,
  availableBalanceCents,
  minWithdrawalCents,
  defaultCurrency,
}: {
  recruitmentLink: CreatorRecruitmentLink;
  payoutAccount: CreatorPayoutAccountView | null;
  waitlistEntry: {
    residenceCountry: string;
    entityType: string;
    preferredCurrency: string;
    status: string;
    reason: string;
  } | null;
  countryCapabilities: CountryPayoutCapability[];
  availableBalanceCents: number;
  minWithdrawalCents: number;
  defaultCurrency: string;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  // Bank onboarding / update state
  const [residenceCountry, setResidenceCountry] = useState(
    payoutAccount?.residenceCountry ?? waitlistEntry?.residenceCountry ?? "FR",
  );
  const [entityType, setEntityType] = useState<"individual" | "company">(
    payoutAccount?.entityType ?? "individual",
  );
  const selectedCap = countryCapabilities.find((c) => c.countryCode === residenceCountry) ?? null;
  const [currency, setCurrency] = useState(
    payoutAccount?.currency ?? selectedCap?.supportedCurrencies[0] ?? defaultCurrency,
  );
  const [bankName, setBankName] = useState(payoutAccount?.bankName ?? "");
  const [accountLast4, setAccountLast4] = useState(
    payoutAccount?.maskedAccount ? payoutAccount.maskedAccount.replace("•••• ", "") : "",
  );
  const [autoPayoutEnabled, setAutoPayoutEnabled] = useState(payoutAccount?.autoPayoutEnabled ?? false);
  const [password, setPassword] = useState("");
  const [editingBank, setEditingBank] = useState(!payoutAccount);
  const [bankMsg, setBankMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [bankPending, startBank] = useTransition();

  // Withdrawal state
  const [withdrawDollars, setWithdrawDollars] = useState(
    availableBalanceCents >= minWithdrawalCents ? (availableBalanceCents / 100).toFixed(2) : (minWithdrawalCents / 100).toFixed(2),
  );
  const [withdrawMsg, setWithdrawMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [withdrawPending, startWithdraw] = useTransition();

  const handleCopyRecruitment = () => {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}${recruitmentLink.recruitmentPath}`
        : recruitmentLink.recruitmentPath;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSaveBank = (e: React.FormEvent) => {
    e.preventDefault();
    setBankMsg(null);
    startBank(async () => {
      if (!payoutAccount) {
        const res = await onboardPayoutAccountAction({
          residenceCountry,
          entityType,
          currency,
          bankName,
          accountLast4,
          autoPayoutEnabled,
        });
        if (!res.ok) {
          setBankMsg({ ok: false, text: res.message });
          router.refresh();
          return;
        }
        setBankMsg({
          ok: true,
          text: `Payout destination connected (${res.account.bankName} ${res.account.maskedAccount}).`,
        });
        setEditingBank(false);
        router.refresh();
      } else {
        const res = await updateBankDestinationAction({
          password,
          bankName,
          accountLast4,
          currency,
          autoPayoutEnabled,
        });
        if (!res.ok) {
          setBankMsg({ ok: false, text: res.message });
          return;
        }
        setPassword("");
        setBankMsg({
          ok: true,
          text: `Bank destination updated to ${res.account.bankName} (${res.account.maskedAccount}). A security notification has been sent to your account.`,
        });
        setEditingBank(false);
        router.refresh();
      }
    });
  };

  const handleWithdraw = (e: React.FormEvent) => {
    e.preventDefault();
    setWithdrawMsg(null);
    const amountCents = Math.round(Number(withdrawDollars) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      setWithdrawMsg({ ok: false, text: "Enter a valid withdrawal amount." });
      return;
    }
    const idem = `wd_${Date.now().toString(36)}_${amountCents}`;
    startWithdraw(async () => {
      const res = await requestWithdrawalAction({
        amountCents,
        currency: defaultCurrency,
        idempotencyKey: idem,
      });
      if (!res.ok) {
        setWithdrawMsg({ ok: false, text: res.message });
        return;
      }
      setWithdrawMsg({
        ok: true,
        text: `Withdrawal of $${(res.payout.amountCents / 100).toFixed(2)} submitted (status: ${res.payout.status}, transfer ref: ${res.payout.transferRef}). Final settlement will be confirmed once your bank processes the payout.`,
      });
      router.refresh();
    });
  };

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      {/* 1. Direct Creator Recruitment Card */}
      <section className="rounded-[var(--radius-lg)] border border-line bg-ink-2 p-6">
        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow text-gold-soft">Creator Recruitment Program</p>
          <Badge tone="vip">10% of Platform Fee (1.5%)</Badge>
        </div>
        <h3 className="mt-2 font-display text-[22px] text-ivory">Direct Creator Referral Link</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-stone">
          Recruit fellow creators directly. You earn <strong className="text-ivory">10% of the 15% platform fee</strong>{" "}
          (equals <strong className="text-ivory">1.5%</strong> of eligible purchases) from creators you directly refer.
          Your reward is funded strictly from the platform&apos;s 15% fee and <strong className="text-ivory">never reduces</strong>{" "}
          the referred creator&apos;s 85% allocation. Single-level only (no multi-level commissions).
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            readOnly
            value={recruitmentLink.recruitmentPath}
            aria-label="Your unique creator recruitment link"
            className="h-11 flex-1 rounded-[var(--radius-md)] border border-line bg-ink px-3.5 font-mono text-[13px] text-ivory"
          />
          <Button variant="gold" size="md" onClick={handleCopyRecruitment}>
            {copied ? "Copied Link" : "Copy Recruitment Link"}
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-ash">
          Keep this link separate from your fan profile link. Referral commissions depend on actual eligible sales by active referred creators; no income is guaranteed.
        </p>
      </section>

      {/* 2. Country Eligibility & Bank Payout Onboarding */}
      <section className="rounded-[var(--radius-lg)] border border-line bg-ink-2 p-6">
        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow text-stone">Bank Payout Destination</p>
          {payoutAccount?.payoutsEnabled ? (
            <Badge tone="vip">Payouts Enabled</Badge>
          ) : waitlistEntry ? (
            <Badge tone="member">Regional Corridor Waitlist</Badge>
          ) : (
            <Badge tone="locked">Setup Required</Badge>
          )}
        </div>
        <h3 className="mt-2 font-display text-[22px] text-ivory">
          {payoutAccount ? `${payoutAccount.bankName} (${payoutAccount.maskedAccount})` : "Connect Bank Account"}
        </h3>

        {waitlistEntry && !payoutAccount && (
          <div className="mt-3 rounded-[var(--radius-md)] border border-gold/35 bg-gold/[0.06] p-3.5 text-[12px] text-gold-soft">
            <p className="font-medium">Waitlisted Corridor ({waitlistEntry.residenceCountry})</p>
            <p className="mt-1">{waitlistEntry.reason}</p>
          </div>
        )}

        {payoutAccount && !editingBank ? (
          <div className="mt-4 space-y-3 text-[13px]">
            <dl className="grid grid-cols-2 gap-2 rounded-[var(--radius-md)] border border-line bg-ink p-3.5">
              <div>
                <dt className="text-ash">Residence Country</dt>
                <dd className="font-medium text-ivory">{payoutAccount.residenceCountry}</dd>
              </div>
              <div>
                <dt className="text-ash">Payout Currency</dt>
                <dd className="font-medium text-ivory">{payoutAccount.currency}</dd>
              </div>
              <div>
                <dt className="text-ash">Masked Destination</dt>
                <dd className="font-mono text-ivory">{payoutAccount.maskedAccount}</dd>
              </div>
              <div>
                <dt className="text-ash">Schedule</dt>
                <dd className="font-medium text-ivory">
                  {payoutAccount.autoPayoutEnabled ? "Weekly Automatic" : "Manual Request"}
                </dd>
              </div>
            </dl>
            <Button variant="outline" size="sm" onClick={() => setEditingBank(true)}>
              Update Bank Destination (Requires Reauthentication)
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSaveBank} className="mt-4 space-y-3 text-[13px]">
            {!payoutAccount && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[11px] uppercase tracking-[0.14em] text-ash">Residence Country</span>
                  <select
                    value={residenceCountry}
                    onChange={(e) => {
                      const code = e.target.value;
                      setResidenceCountry(code);
                      const cap = countryCapabilities.find((c) => c.countryCode === code);
                      if (cap?.supportedCurrencies[0]) setCurrency(cap.supportedCurrencies[0]);
                    }}
                    className="mt-1 h-10 w-full rounded-[var(--radius-md)] border border-line bg-ink-2 px-3 text-ivory"
                  >
                    {countryCapabilities.map((c) => (
                      <option key={c.countryCode} value={c.countryCode}>
                        {c.countryName} ({c.countryCode}) —{" "}
                        {c.payoutStatus === "supported_connect_sandbox" ? "Supported" : "Waitlist / Adapter Required"}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-[11px] uppercase tracking-[0.14em] text-ash">Account Type</span>
                  <select
                    value={entityType}
                    onChange={(e) => setEntityType(e.target.value as "individual" | "company")}
                    className="mt-1 h-10 w-full rounded-[var(--radius-md)] border border-line bg-ink-2 px-3 text-ivory"
                  >
                    <option value="individual">Individual Creator</option>
                    <option value="company">Registered Company</option>
                  </select>
                </label>
              </div>
            )}

            {selectedCap && (
              <p className="rounded-[var(--radius-md)] border border-line bg-ink p-2.5 text-[11px] text-stone">
                <strong className="text-ivory">{selectedCap.countryName}:</strong> {selectedCap.providerNotes}
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block sm:col-span-1">
                <span className="text-[11px] uppercase tracking-[0.14em] text-ash">Bank Name</span>
                <input
                  type="text"
                  required
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="e.g. BNP Paribas"
                  className="mt-1 h-10 w-full rounded-[var(--radius-md)] border border-line bg-ink px-3 text-ivory"
                />
              </label>
              <label className="block sm:col-span-1">
                <span className="text-[11px] uppercase tracking-[0.14em] text-ash">Last 4 Digits Only</span>
                <input
                  type="text"
                  required
                  maxLength={4}
                  value={accountLast4}
                  onChange={(e) => setAccountLast4(e.target.value)}
                  placeholder="6789"
                  className="mt-1 h-10 w-full rounded-[var(--radius-md)] border border-line bg-ink px-3 font-mono text-ivory"
                />
              </label>
              <label className="block sm:col-span-1">
                <span className="text-[11px] uppercase tracking-[0.14em] text-ash">Payout Currency</span>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="mt-1 h-10 w-full rounded-[var(--radius-md)] border border-line bg-ink-2 px-3 text-ivory"
                >
                  {(selectedCap?.supportedCurrencies ?? ["USD", "EUR", "GBP"]).map((curr) => (
                    <option key={curr} value={curr}>
                      {curr}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="flex items-center gap-2 text-[12px] text-stone">
              <input
                type="checkbox"
                checked={autoPayoutEnabled}
                onChange={(e) => setAutoPayoutEnabled(e.target.checked)}
              />
              Enable optional weekly automatic payouts when settled balance exceeds ${(minWithdrawalCents / 100).toFixed(2)}
            </label>

            {payoutAccount && (
              <label className="block">
                <span className="text-[11px] uppercase tracking-[0.14em] text-gold-soft">
                  Confirm Account Password (Required to Change Bank Destination)
                </span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password to authorize bank change"
                  className="mt-1 h-10 w-full rounded-[var(--radius-md)] border border-line bg-ink px-3 text-ivory"
                />
              </label>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="submit" variant="gold" size="sm" disabled={bankPending}>
                {bankPending ? "Saving…" : payoutAccount ? "Confirm Bank Update" : "Complete Sandbox Bank Onboarding"}
              </Button>
              {payoutAccount && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditingBank(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        )}

        {bankMsg && (
          <p
            role="alert"
            className={`mt-3 rounded-[var(--radius-md)] border p-3 text-[12px] ${
              bankMsg.ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-danger/40 bg-danger/10 text-danger"
            }`}
          >
            {bankMsg.text}
          </p>
        )}
      </section>

      {/* 3. Request Withdrawal Panel */}
      <section className="rounded-[var(--radius-lg)] border border-line bg-ink-2 p-6 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="eyebrow text-gold-soft">Withdraw Settled Earnings</p>
            <h3 className="mt-1 font-display text-[22px] text-ivory">Request Bank Payout</h3>
          </div>
          <Badge tone="neutral">Minimum ${(minWithdrawalCents / 100).toFixed(2)} USD</Badge>
        </div>

        <form onSubmit={handleWithdraw} className="mt-4 grid gap-4 md:grid-cols-4 md:items-end">
          <label className="block md:col-span-1">
            <span className="text-[11px] uppercase tracking-[0.14em] text-ash">Amount ({defaultCurrency})</span>
            <input
              type="number"
              step="0.01"
              min={(minWithdrawalCents / 100).toFixed(2)}
              value={withdrawDollars}
              onChange={(e) => setWithdrawDollars(e.target.value)}
              className="mt-1 h-11 w-full rounded-[var(--radius-md)] border border-line bg-ink px-3.5 tabular-nums text-ivory"
            />
          </label>
          <div className="rounded-[var(--radius-md)] border border-line bg-ink p-3 text-[12px] md:col-span-2">
            <p className="text-stone">
              Destination:{" "}
              <strong className="text-ivory">
                {payoutAccount ? `${payoutAccount.bankName} (${payoutAccount.maskedAccount})` : "Not connected"}
              </strong>{" "}
              · Disclosed platform payout fee: <strong className="text-ivory">$0.00</strong> · Estimated arrival:{" "}
              <strong className="text-ivory">2 business days</strong>
            </p>
          </div>
          <Button
            type="submit"
            variant="gold"
            size="md"
            disabled={withdrawPending || !payoutAccount?.payoutsEnabled || availableBalanceCents < minWithdrawalCents}
          >
            {withdrawPending ? "Requesting…" : "Request Withdrawal"}
          </Button>
        </form>

        {withdrawMsg && (
          <p
            role="alert"
            className={`mt-3 rounded-[var(--radius-md)] border p-3 text-[12px] ${
              withdrawMsg.ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-danger/40 bg-danger/10 text-danger"
            }`}
          >
            {withdrawMsg.text}
          </p>
        )}
      </section>
    </div>
  );
}

