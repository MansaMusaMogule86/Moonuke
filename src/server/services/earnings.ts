import "server-only";
import { asViewer } from "@/server/db";
import type { Viewer } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { featureEnabled } from "@/server/flags";
import { listCountryPayoutCapabilities, type CountryPayoutCapability } from "@/server/payments/countryEligibility";
import {
  describePaymentIdentities,
  getPlatformFinancialConfig,
  type DescriptorDocumentation,
  type PlatformFinancialConfig,
} from "@/server/payments/descriptors";
import {
  getCreatorPayoutAccount,
  getOrCreateCreatorRecruitmentLink,
  type CreatorPayoutAccountView,
  type CreatorRecruitmentLink,
} from "./creatorReferralsAndWithdrawals";

// =====================================================================
// Creator earnings & referral ledger read layer.
// Backed by the double-entry payment ledger and creator-scoped
// SECURITY DEFINER functions. All money is integer minor units (cents).
// =====================================================================

export type PaymentKind = "subscription" | "ppv" | "tip" | "paid_message";
export type PaymentRow = {
  id: string;
  kind: PaymentKind;
  targetId: string | null;
  amountCents: number;
  currency: string;
  status: string;
  feeBps: number | null;
  createdAt: string;
};
export type PayoutRow = {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};
export type BalanceRow = { currency: string; available: number; onHold: number };

export type Earnings = {
  /** Whether the payment feature flag is on. When false the UI must not imply live income. */
  paymentsEnabled: boolean;
  balances: BalanceRow[];
  payments: PaymentRow[];
  payouts: PayoutRow[];
};

export type DetailedBalanceRow = {
  currency: string;
  contentAvailableCents: number;
  contentPendingCents: number;
  contentOnHoldCents: number;
  referralAvailableCents: number;
  referralPendingCents: number;
  referralOnHoldCents: number;
  totalAvailableCents: number;
  totalPendingCents: number;
  totalOnHoldCents: number;
  withdrawnInProgressCents: number;
  withdrawnCompletedCents: number;
};

export type DetailedPayoutRow = {
  id: string;
  currency: string;
  amountCents: number;
  feeCents: number;
  netAmountCents: number;
  status: string;
  maskedDestination: string | null;
  transferRef: string | null;
  bankPayoutRef: string | null;
  failureReason: string | null;
  estimatedArrivalAt: string | null;
  createdAt: string;
  processedAt: string | null;
};

export type ReferredCreatorRow = {
  referredCreatorId: string;
  handle: string | null;
  displayName: string;
  status: string;
  capturedAt: string;
  confirmedAt: string | null;
};

export type ReferralCommissionRow = {
  id: string;
  paymentId: string;
  referredCreatorId: string;
  currency: string;
  eligiblePurchaseCents: number;
  platformFeeCents: number;
  referralRateBpsOfFee: number;
  commissionCents: number;
  refundedCommissionCents: number;
  status: string;
  createdAt: string;
};

export type LedgerAdjustmentRow = {
  id: number;
  txnId: string;
  paymentId: string | null;
  accountKind: string;
  amountCents: number;
  currency: string;
  memo: string;
  createdAt: string;
};

export type DetailedStudioEarnings = {
  paymentsEnabled: boolean;
  balances: BalanceRow[];
  detailedBalances: DetailedBalanceRow[];
  payments: PaymentRow[];
  payouts: PayoutRow[];
  detailedPayouts: DetailedPayoutRow[];
  ledgerAdjustments: LedgerAdjustmentRow[];
  recruitmentLink: CreatorRecruitmentLink;
  referredCreators: ReferredCreatorRow[];
  referralCommissions: ReferralCommissionRow[];
  payoutAccount: CreatorPayoutAccountView | null;
  waitlistEntry: {
    residenceCountry: string;
    entityType: string;
    preferredCurrency: string;
    status: string;
    reason: string;
  } | null;
  countryCapabilities: CountryPayoutCapability[];
  platformConfig: PlatformFinancialConfig;
  descriptors: DescriptorDocumentation;
};

function assertCreator(v: Viewer) {
  if (v.role !== "creator" || v.status !== "active") throw new AppError("forbidden", "Not allowed.");
}

type PaymentDb = {
  id: string;
  kind: PaymentKind;
  target_id: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  fee_bps: number | null;
  created_at: Date;
};
type PayoutDb = {
  id: string;
  amount_cents: string | number;
  currency: string;
  status: string;
  created_at: Date;
  updated_at: Date;
};
type BalanceDb = { currency: string; available: string | number; on_hold: string | number };

export async function myEarnings(viewer: Viewer): Promise<Earnings> {
  assertCreator(viewer);
  return asViewer(viewer, async (q) => {
    const balances = await q.query<BalanceDb>(
      `select currency::text as currency, available, on_hold from app.my_balances()`,
    );
    const payments = await q.query<PaymentDb>(
      `select id, kind, target_id, amount_cents, currency::text as currency, status, fee_bps, created_at from app.my_payments()`,
    );
    const payouts = await q.query<PayoutDb>(
      `select id, amount_cents, currency::text as currency, status, created_at, updated_at from app.my_payouts()`,
    );
    return {
      paymentsEnabled: featureEnabled("payments"),
      balances: balances.map((b) => ({
        currency: b.currency,
        available: Number(b.available),
        onHold: Number(b.on_hold),
      })),
      payments: payments.map((p) => ({
        id: p.id,
        kind: p.kind,
        targetId: p.target_id,
        amountCents: p.amount_cents,
        currency: p.currency,
        status: p.status,
        feeBps: p.fee_bps,
        createdAt: new Date(p.created_at).toISOString(),
      })),
      payouts: payouts.map((o) => ({
        id: o.id,
        amountCents: Number(o.amount_cents),
        currency: o.currency,
        status: o.status,
        createdAt: new Date(o.created_at).toISOString(),
        updatedAt: new Date(o.updated_at).toISOString(),
      })),
    };
  });
}

export async function myDetailedStudioEarnings(viewer: Viewer): Promise<DetailedStudioEarnings> {
  assertCreator(viewer);
  const [base, recruitmentLink, payoutAccount, countryCapabilities, platformConfig] = await Promise.all([
    myEarnings(viewer),
    getOrCreateCreatorRecruitmentLink(viewer),
    getCreatorPayoutAccount(viewer),
    listCountryPayoutCapabilities(),
    getPlatformFinancialConfig(),
  ]);

  const descriptors = describePaymentIdentities(platformConfig);

  const extra = await asViewer(viewer, async (q) => {
    const detailedBalances = await q.query<{
      currency: string;
      content_available: string;
      content_pending: string;
      content_on_hold: string;
      referral_available: string;
      referral_pending: string;
      referral_on_hold: string;
      withdrawn_in_progress: string;
      withdrawn_completed: string;
    }>(`select * from app.my_detailed_balances($1)`, [platformConfig.settlementHoldDays]);

    const detailedPayouts = await q.query<{
      id: string;
      currency: string;
      amount_cents: string;
      fee_cents: string;
      net_amount_cents: string;
      status: string;
      masked_destination: string | null;
      transfer_ref: string | null;
      bank_payout_ref: string | null;
      failure_reason: string | null;
      estimated_arrival_at: Date | null;
      created_at: Date;
      processed_at: Date | null;
    }>(`select * from app.my_payouts_detailed()`);

    const referredCreators = await q.query<{
      referred_creator_id: string;
      handle: string | null;
      display_name: string;
      status: string;
      captured_at: Date;
      confirmed_at: Date | null;
    }>(`select * from app.my_referred_creators()`);

    const referralCommissions = await q.query<{
      id: string;
      payment_id: string;
      referred_creator_id: string;
      currency: string;
      eligible_purchase_cents: string;
      platform_fee_cents: string;
      referral_rate_bps_of_fee: number;
      commission_cents: string;
      refunded_commission_cents: string;
      status: string;
      created_at: Date;
    }>(
      `select id, payment_id, referred_creator_id, currency::text as currency,
              eligible_purchase_cents, platform_fee_cents, referral_rate_bps_of_fee,
              commission_cents, refunded_commission_cents, status, created_at
         from app.referral_commissions
        where referrer_creator_id = $1
        order by created_at desc
        limit 100`,
      [viewer.id],
    );

    const ledgerAdjustments = await q.query<{
      id: string | number;
      txn_id: string;
      payment_id: string | null;
      account_kind: string;
      amount_cents: string;
      currency: string;
      memo: string;
      created_at: Date;
    }>(`select * from app.my_ledger_adjustments()`);

    const waitlist = await q.one<{
      residence_country: string;
      entity_type: string;
      preferred_currency: string;
      status: string;
      reason: string;
    }>(
      `select residence_country::text, entity_type, preferred_currency::text, status, reason
         from app.creator_monetization_waitlist
        where creator_id = $1`,
      [viewer.id],
    );

    return {
      detailedBalances,
      detailedPayouts,
      referredCreators,
      referralCommissions,
      ledgerAdjustments,
      waitlist,
    };
  });

  return {
    ...base,
    detailedBalances: extra.detailedBalances.map((b) => {
      const contentAvail = Number(b.content_available);
      const contentPend = Number(b.content_pending);
      const contentHold = Number(b.content_on_hold);
      const refAvail = Number(b.referral_available);
      const refPend = Number(b.referral_pending);
      const refHold = Number(b.referral_on_hold);
      return {
        currency: b.currency.trim(),
        contentAvailableCents: contentAvail,
        contentPendingCents: contentPend,
        contentOnHoldCents: contentHold,
        referralAvailableCents: refAvail,
        referralPendingCents: refPend,
        referralOnHoldCents: refHold,
        totalAvailableCents: Math.max(0, contentAvail + refAvail),
        totalPendingCents: contentPend + refPend,
        totalOnHoldCents: contentHold + refHold,
        withdrawnInProgressCents: Number(b.withdrawn_in_progress),
        withdrawnCompletedCents: Number(b.withdrawn_completed),
      };
    }),
    detailedPayouts: extra.detailedPayouts.map((p) => ({
      id: p.id,
      currency: p.currency.trim(),
      amountCents: Number(p.amount_cents),
      feeCents: Number(p.fee_cents),
      netAmountCents: Number(p.net_amount_cents),
      status: p.status,
      maskedDestination: p.masked_destination,
      transferRef: p.transfer_ref,
      bankPayoutRef: p.bank_payout_ref,
      failureReason: p.failure_reason,
      estimatedArrivalAt: p.estimated_arrival_at ? new Date(p.estimated_arrival_at).toISOString() : null,
      createdAt: new Date(p.created_at).toISOString(),
      processedAt: p.processed_at ? new Date(p.processed_at).toISOString() : null,
    })),
    ledgerAdjustments: extra.ledgerAdjustments.map((a) => ({
      id: Number(a.id),
      txnId: a.txn_id,
      paymentId: a.payment_id,
      accountKind: a.account_kind,
      amountCents: Number(a.amount_cents),
      currency: a.currency.trim(),
      memo: a.memo,
      createdAt: new Date(a.created_at).toISOString(),
    })),
    recruitmentLink,
    referredCreators: extra.referredCreators.map((r) => ({
      referredCreatorId: r.referred_creator_id,
      handle: r.handle,
      displayName: r.display_name,
      status: r.status,
      capturedAt: new Date(r.captured_at).toISOString(),
      confirmedAt: r.confirmed_at ? new Date(r.confirmed_at).toISOString() : null,
    })),
    referralCommissions: extra.referralCommissions.map((c) => ({
      id: c.id,
      paymentId: c.payment_id,
      referredCreatorId: c.referred_creator_id,
      currency: c.currency.trim(),
      eligiblePurchaseCents: Number(c.eligible_purchase_cents),
      platformFeeCents: Number(c.platform_fee_cents),
      referralRateBpsOfFee: c.referral_rate_bps_of_fee,
      commissionCents: Number(c.commission_cents),
      refundedCommissionCents: Number(c.refunded_commission_cents),
      status: c.status,
      createdAt: new Date(c.created_at).toISOString(),
    })),
    payoutAccount,
    waitlistEntry: extra.waitlist
      ? {
          residenceCountry: extra.waitlist.residence_country.trim(),
          entityType: extra.waitlist.entity_type,
          preferredCurrency: extra.waitlist.preferred_currency.trim(),
          status: extra.waitlist.status,
          reason: extra.waitlist.reason,
        }
      : null,
    countryCapabilities,
    platformConfig,
    descriptors,
  };
}
