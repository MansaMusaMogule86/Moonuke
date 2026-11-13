"use client";

import { useActionState } from "react";
import { FormMessage, Select, Submit, TextArea } from "@/components/forms";
import { Field } from "@/components/ui/Field";
import { idle } from "@/lib/forms";
import {
  createDistributionPeriodAction,
  recordExpenseAction,
  recordReserveAction,
  simulateOwnerPayoutsAction,
  submitDistributionDecisionAction,
  updateMyPayoutDestinationAction,
} from "@/server/actions/owner";
import type { PayoutDestinationRecord } from "@/server/services/ownerFinance";

export function CalculateDistributionForm() {
  const [state, action] = useActionState(createDistributionPeriodAction, idle);
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);

  return (
    <form
      action={action}
      className="space-y-4 rounded-xl border border-line bg-[#100e14]/85 p-5"
      aria-label="Calculate distribution period"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-[19px] text-ivory">Calculate & Reconcile Distribution Period</h3>
        <span className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-[11px] uppercase tracking-[0.14em] text-gold-soft">
          50 / 50 Waterfall
        </span>
      </div>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          name="periodStart"
          type="date"
          label="Period start"
          defaultValue={thirtyDaysAgo}
          required
        />
        <Field
          name="periodEnd"
          type="date"
          label="Period end"
          defaultValue={today}
          required
        />
        <Select name="currency" label="Currency" defaultValue="usd">
          <option value="usd">USD (Minor units: cents)</option>
          <option value="eur">EUR (Minor units: cents)</option>
          <option value="gbp">GBP (Minor units: pence)</option>
        </Select>
      </div>
      <Field
        name="notes"
        label="Period memo (optional)"
        placeholder="Monthly settlement waterfall and 50/50 owner allocation"
      />
      <Submit className="h-10 px-5 text-[13px]">
        Calculate & Reconcile Period
      </Submit>
    </form>
  );
}

export function DistributionDecisionForm({
  periodId,
  calculationVersion,
  ownerDisplayName,
}: {
  periodId: string;
  calculationVersion: number;
  ownerDisplayName: string;
}) {
  const [state, action] = useActionState(submitDistributionDecisionAction, idle);
  return (
    <form
      action={action}
      className="mt-4 space-y-3 rounded-xl border border-gold/25 bg-[#0b090e]/90 p-4"
      aria-label={`Dual-owner approval for period ${periodId}`}
    >
      <input type="hidden" name="periodId" value={periodId} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] uppercase tracking-[0.16em] text-gold-soft">
          Sign as {ownerDisplayName} · Calculation v{calculationVersion}
        </span>
        <span className="text-[11px] text-stone">MFA step-up required</span>
      </div>
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Select name="decision" label="Decision" defaultValue="APPROVED">
          <option value="APPROVED">Approve 50/50 Distribution</option>
          <option value="REJECTED">Reject & Return to Review</option>
        </Select>
        <Field
          name="mfaCode"
          label="6-digit MFA code"
          placeholder="000000"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
        />
        <Field
          name="note"
          label="Governance note (optional)"
          placeholder="Verified waterfall & creator liabilities"
        />
      </div>
      <Submit className="h-9 px-4 text-[12px]">
        Submit Signed Decision
      </Submit>
    </form>
  );
}

export function SimulatePayoutForm({ periodId }: { periodId: string }) {
  const [state, action] = useActionState(simulateOwnerPayoutsAction, idle);
  return (
    <form
      action={action}
      className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-[#ff2e93]/35 bg-[#ff2e93]/5 p-4"
      aria-label={`Simulate payouts for period ${periodId}`}
    >
      <input type="hidden" name="periodId" value={periodId} />
      <input type="hidden" name="idempotencyKey" value={`sim-${periodId}`} />
      <div className="flex-1">
        <p className="text-[12px] font-medium text-ivory">
          Dual-owner approval verified (READY_FOR_PAYOUT)
        </p>
        <p className="text-[11px] text-stone">
          Generates separate simulated payout records for Account A and Account B. Live transfers remain disabled.
        </p>
        <FormMessage state={state} />
      </div>
      <Submit className="h-9 px-4 text-[12px]">
        Run Simulated Payouts
      </Submit>
    </form>
  );
}

export function UpdatePayoutDestinationForm({
  destination,
}: {
  destination: PayoutDestinationRecord;
}) {
  const [state, action] = useActionState(updateMyPayoutDestinationAction, idle);
  return (
    <form
      action={action}
      className="space-y-4 rounded-xl border border-line bg-[#100e14]/85 p-6"
      aria-label={`Update ${destination.accountCode} payout destination`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-[20px] text-ivory">
          Update {destination.accountCode} Destination (MFA Required)
        </h3>
        <span className="rounded-full border border-line-strong px-2.5 py-0.5 text-[11px] uppercase tracking-[0.14em] text-stone">
          Live Transfers Disabled
        </span>
      </div>
      <p className="text-[13px] text-stone">
        Never enter raw banking credentials, full IBAN/card numbers, or wallet private keys. Store only the verified
        provider reference and masked account label. Updating your destination invalidates any unexecuted distribution
        approvals and logs an immutable audit event.
      </p>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="provider"
          label="Settlement provider"
          defaultValue={destination.provider}
          required
        />
        <Select
          name="destinationType"
          label="Destination type"
          defaultValue={destination.destinationType}
        >
          <option value="custodial_account">Custodial Settlement Account</option>
          <option value="bank_account">Bank Account (Provider Token)</option>
          <option value="settlement_wallet">Verified Institutional Wallet Ref</option>
          <option value="wire_beneficiary">Wire Beneficiary Ref</option>
        </Select>
        <Field
          name="providerAccountReference"
          label="Provider account reference"
          defaultValue={destination.providerAccountReference}
          required
        />
        <Field
          name="maskedAccountLabel"
          label="Masked account label"
          defaultValue={destination.maskedAccountLabel}
          required
        />
        <Select name="currency" label="Settlement currency" defaultValue={destination.currency}>
          <option value="usd">USD</option>
          <option value="eur">EUR</option>
          <option value="gbp">GBP</option>
        </Select>
        <Field
          name="mfaCode"
          label="Current 6-digit MFA code"
          placeholder="000000"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
        />
      </div>
      <Submit className="h-10 px-5 text-[13px]">
        Update {destination.accountCode}
      </Submit>
    </form>
  );
}

export function RecordDeductionsForms() {
  const [expState, expAction] = useActionState(recordExpenseAction, idle);
  const [resState, resAction] = useActionState(recordReserveAction, idle);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form
        action={expAction}
        className="space-y-4 rounded-xl border border-line bg-[#100e14]/85 p-5"
        aria-label="Record approved operating expense"
      >
        <h3 className="font-display text-[18px] text-ivory">Record Approved Operating Expense</h3>
        <FormMessage state={expState} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field name="category" label="Category" placeholder="Infrastructure / Compliance" required />
          <Field
            name="amountMinor"
            type="number"
            min={1}
            step={1}
            label="Amount (minor units / cents)"
            placeholder="2500"
            required
          />
        </div>
        <TextArea
          name="description"
          rows={2}
          label="Expense description"
          placeholder="Approved platform operating cost deducted before 50/50 split"
          required
        />
        <Submit variant="ghost" className="h-9 px-4 text-[12px]">
          Record Expense
        </Submit>
      </form>

      <form
        action={resAction}
        className="space-y-4 rounded-xl border border-line bg-[#100e14]/85 p-5"
        aria-label="Record platform reserve allocation"
      >
        <h3 className="font-display text-[18px] text-ivory">Record Reserve Allocation</h3>
        <FormMessage state={resState} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            name="amountMinor"
            type="number"
            min={1}
            step={1}
            label="Reserve amount (minor units / cents)"
            placeholder="5000"
            required
          />
          <Select name="currency" label="Currency" defaultValue="usd">
            <option value="usd">USD</option>
            <option value="eur">EUR</option>
            <option value="gbp">GBP</option>
          </Select>
        </div>
        <TextArea
          name="reason"
          rows={2}
          label="Reserve reason"
          placeholder="Rolling chargeback and tax settlement reserve"
          required
        />
        <Submit variant="ghost" className="h-9 px-4 text-[12px]">
          Record Reserve
        </Submit>
      </form>
    </div>
  );
}
