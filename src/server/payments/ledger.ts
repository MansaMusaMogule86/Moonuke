/**
 * Double-entry postings & commission allocation engine (pure).
 *
 * Signed amounts; every posting set sums to zero per currency.
 *
 * Approved DivaFans Commission & Referral Model:
 *   - Default Platform Fee: 15% (1500 bps) of eligible purchase amount (excluding separately collected tax)
 *   - Default Creator Allocation: 85% (8500 bps) of eligible purchase amount
 *   - Direct Creator Referral Reward: 10% (1000 bps) of the platform fee (= 1.5% / 150 bps of eligible purchase)
 *     - Funded strictly out of the platform fee (platform keeps 13.5% = $13.50 on $100 when referred, or 15% = $15.00 when unreferred).
 *     - Referral reward MUST NEVER reduce the referred creator's 85% allocation.
 *   - Rounding rule:
 *     - Platform fee is `Math.floor((eligibleAmountCents * platformFeeBps) / 10000)` (rounds in creator's favor).
 *     - Creator allocation is `eligibleAmountCents - platformFeeCents`.
 *     - Referral commission is `Math.floor((platformFeeCents * referralFeeBpsOfPlatform) / 10000)`.
 *     - Platform net fee before processing expenses is `platformFeeCents - referralCommissionCents`.
 */
export type Posting = { account: string; amountCents: number; memo: string };

export const DEFAULT_PLATFORM_FEE_BPS = 1500; // 15%
export const DEFAULT_CREATOR_SHARE_BPS = 8500; // 85%
export const DEFAULT_REFERRAL_FEE_BPS_OF_PLATFORM = 1000; // 10% of the 15% platform fee = 1.5% of eligible purchase

export type PurchaseAllocationInput = {
  /** Gross amount charged to the fan (including any separately collected tax, after discount). */
  grossChargedCents?: number;
  /** List price before discount, or eligible purchase amount if no discount/tax passed. */
  subtotalBeforeDiscountCents?: number;
  /** Promotional discount applied before payment (reduces eligible purchase amount). */
  discountCents?: number;
  /** Separately collected sales/VAT tax (excluded from commission calculation). */
  taxCents?: number;
  /** Explicit eligible purchase amount in minor units (if provided directly). */
  eligibleAmountCents?: number;
  /** Platform fee in basis points (default: 1500 = 15%). */
  platformFeeBps?: number;
  /** Referral share of the platform fee in basis points (default: 1000 = 10% of platform fee = 1.5% of purchase). */
  referralFeeBpsOfPlatform?: number;
  /** Whether the creator has an eligible confirmed direct (1-level) referrer. */
  hasEligibleReferrer: boolean;
  /** Actual or estimated payment processor fee in minor units (e.g. Stripe 2.9% + 30c). */
  processorFeeCents?: number;
  /** Whether normal payment processing costs are funded from the platform allocation. */
  processingFundedByPlatform?: boolean;
};

export type PurchaseAllocationResult = {
  eligibleAmountCents: number;
  discountCents: number;
  taxCents: number;
  grossChargedCents: number;
  platformFeeBps: number;
  creatorShareBps: number;
  referralFeeBpsOfPlatform: number;
  effectiveReferralBpsOfPurchase: number;
  creatorAllocationCents: number;
  platformFeeCents: number;
  referralCommissionCents: number;
  platformRemainderBeforeExpensesCents: number;
  processorFeeCents: number;
  platformNetAfterProcessingCents: number;
  processingFundedByPlatform: boolean;
  processorCostSupportedByPlatformRemainder: boolean;
};

/**
 * Legacy 2-way fee split (kept for backward compatibility with existing callers/tests).
 */
export function splitFee(grossCents: number, feeBps: number): { fee: number; net: number } {
  if (!Number.isInteger(grossCents) || grossCents <= 0) throw new Error("gross must be a positive integer");
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10000) throw new Error("fee_bps must be 0..10000");
  const fee = Math.floor((grossCents * feeBps) / 10000); // round down in the creator's favour
  return { fee, net: grossCents - fee };
}

/**
 * Complete DivaFans purchase allocation calculator with explicit treatment of:
 *   - Discounts (reduce eligible purchase amount prior to split)
 *   - Separately collected taxes (excluded from commission calculation)
 *   - 85% Creator / 15% Platform split
 *   - 10% of Platform Fee (= 1.5% of eligible purchase) Direct Referral allocation
 *   - Payment processing cost coverage reporting
 */
export function splitPurchaseAllocation(input: PurchaseAllocationInput): PurchaseAllocationResult {
  const discountCents = input.discountCents ?? 0;
  const taxCents = input.taxCents ?? 0;
  if (!Number.isInteger(discountCents) || discountCents < 0) throw new Error("discountCents must be a non-negative integer");
  if (!Number.isInteger(taxCents) || taxCents < 0) throw new Error("taxCents must be a non-negative integer");

  const eligibleAmountCents =
    input.eligibleAmountCents !== undefined
      ? input.eligibleAmountCents
      : input.subtotalBeforeDiscountCents !== undefined
        ? input.subtotalBeforeDiscountCents - discountCents
        : (input.grossChargedCents ?? 0) - taxCents;

  if (!Number.isInteger(eligibleAmountCents) || eligibleAmountCents <= 0) {
    throw new Error("eligibleAmountCents must be a positive integer");
  }

  const platformFeeBps = input.platformFeeBps ?? DEFAULT_PLATFORM_FEE_BPS;
  if (!Number.isInteger(platformFeeBps) || platformFeeBps < 0 || platformFeeBps > 10000) {
    throw new Error("platformFeeBps must be 0..10000");
  }
  const creatorShareBps = 10000 - platformFeeBps;

  const referralFeeBpsOfPlatform = input.referralFeeBpsOfPlatform ?? DEFAULT_REFERRAL_FEE_BPS_OF_PLATFORM;
  if (!Number.isInteger(referralFeeBpsOfPlatform) || referralFeeBpsOfPlatform < 0 || referralFeeBpsOfPlatform > 10000) {
    throw new Error("referralFeeBpsOfPlatform must be 0..10000");
  }

  // 1. Platform fee & Creator allocation (referral NEVER reduces creator's 85% share)
  const platformFeeCents = Math.floor((eligibleAmountCents * platformFeeBps) / 10000);
  const creatorAllocationCents = eligibleAmountCents - platformFeeCents;

  // 2. Direct referral commission funded strictly from the platform fee
  const referralCommissionCents = input.hasEligibleReferrer
    ? Math.floor((platformFeeCents * referralFeeBpsOfPlatform) / 10000)
    : 0;

  const platformRemainderBeforeExpensesCents = platformFeeCents - referralCommissionCents;

  // 3. Processor fee coverage assessment
  const processorFeeCents = input.processorFeeCents ?? 0;
  if (!Number.isInteger(processorFeeCents) || processorFeeCents < 0) {
    throw new Error("processorFeeCents must be a non-negative integer");
  }
  const processingFundedByPlatform = input.processingFundedByPlatform ?? true;
  const platformNetAfterProcessingCents = processingFundedByPlatform
    ? platformRemainderBeforeExpensesCents - processorFeeCents
    : platformRemainderBeforeExpensesCents;

  const processorCostSupportedByPlatformRemainder = processorFeeCents <= platformRemainderBeforeExpensesCents;

  return {
    eligibleAmountCents,
    discountCents,
    taxCents,
    grossChargedCents: eligibleAmountCents + taxCents,
    platformFeeBps,
    creatorShareBps,
    referralFeeBpsOfPlatform: input.hasEligibleReferrer ? referralFeeBpsOfPlatform : 0,
    effectiveReferralBpsOfPurchase: input.hasEligibleReferrer
      ? Math.floor((platformFeeBps * referralFeeBpsOfPlatform) / 10000)
      : 0,
    creatorAllocationCents,
    platformFeeCents,
    referralCommissionCents,
    platformRemainderBeforeExpensesCents,
    processorFeeCents,
    platformNetAfterProcessingCents,
    processingFundedByPlatform,
    processorCostSupportedByPlatformRemainder,
  };
}

export type PostingOptions = {
  referrerCreatorId?: string | null;
  referralFeeBpsOfPlatform?: number;
};

/**
 * Generates balanced double-entry postings for a payment lifecycle event.
 * Backward-compatible with 4-argument calls (when no referrer is present).
 */
export function postingsFor(
  ev: "succeeded" | "refunded" | "dispute_opened" | "dispute_won" | "dispute_lost",
  creatorId: string,
  grossCents: number,
  feeBps: number,
  opts?: PostingOptions,
): Posting[] {
  const referrerCreatorId =
    opts?.referrerCreatorId && opts.referrerCreatorId !== creatorId ? opts.referrerCreatorId : null;
  const hasEligibleReferrer = Boolean(referrerCreatorId);

  const alloc = splitPurchaseAllocation({
    eligibleAmountCents: grossCents,
    platformFeeBps: feeBps,
    referralFeeBpsOfPlatform: opts?.referralFeeBpsOfPlatform ?? DEFAULT_REFERRAL_FEE_BPS_OF_PLATFORM,
    hasEligibleReferrer,
  });

  const creator = `creator:${creatorId}`;
  const hold = `creator_hold:${creatorId}`;
  const referral = referrerCreatorId ? `referral:${referrerCreatorId}` : null;
  const referralHold = referrerCreatorId ? `referral_hold:${referrerCreatorId}` : null;
  const p = (account: string, amountCents: number, memo: string): Posting => ({ account, amountCents, memo });

  let out: Posting[];
  if (ev === "succeeded") {
    out = [
      p("provider_clearing", -grossCents, "payment received"),
      p(creator, alloc.creatorAllocationCents, "creator earnings"),
      ...(referral && alloc.referralCommissionCents > 0
        ? [p(referral, alloc.referralCommissionCents, "direct creator referral commission")]
        : []),
      p("platform_fees", alloc.platformRemainderBeforeExpensesCents, "platform fee"),
    ];
  } else if (ev === "refunded") {
    out = [
      p("provider_clearing", grossCents, "refund"),
      p(creator, -alloc.creatorAllocationCents, "refund reverses earnings"),
      ...(referral && alloc.referralCommissionCents > 0
        ? [p(referral, -alloc.referralCommissionCents, "refund reverses referral commission")]
        : []),
      p("platform_fees", -alloc.platformRemainderBeforeExpensesCents, "refund reverses fee"),
    ];
  } else if (ev === "dispute_opened") {
    out = [
      p(creator, -alloc.creatorAllocationCents, "dispute hold"),
      p(hold, alloc.creatorAllocationCents, "dispute hold"),
      ...(referral && referralHold && alloc.referralCommissionCents > 0
        ? [
            p(referral, -alloc.referralCommissionCents, "dispute hold on referral commission"),
            p(referralHold, alloc.referralCommissionCents, "dispute hold on referral commission"),
          ]
        : []),
    ];
  } else if (ev === "dispute_won") {
    out = [
      p(hold, -alloc.creatorAllocationCents, "dispute released"),
      p(creator, alloc.creatorAllocationCents, "dispute released"),
      ...(referral && referralHold && alloc.referralCommissionCents > 0
        ? [
            p(referralHold, -alloc.referralCommissionCents, "dispute released on referral commission"),
            p(referral, alloc.referralCommissionCents, "dispute released on referral commission"),
          ]
        : []),
    ];
  } else {
    // dispute_lost (chargeback)
    out = [
      p(hold, -alloc.creatorAllocationCents, "chargeback"),
      ...(referralHold && alloc.referralCommissionCents > 0
        ? [p(referralHold, -alloc.referralCommissionCents, "chargeback reverses referral commission")]
        : []),
      p("platform_fees", -alloc.platformRemainderBeforeExpensesCents, "chargeback reverses fee"),
      p("provider_clearing", grossCents, "chargeback"),
    ];
  }

  const nonZero = out.filter((x) => x.amountCents !== 0);
  if (nonZero.reduce((n, x) => n + x.amountCents, 0) !== 0) throw new Error("postings must balance");
  return nonZero;
}

export type ProportionalRefundResult = {
  refundAmountCents: number;
  creatorReversedCents: number;
  referralReversedCents: number;
  platformNetReversedCents: number;
  postings: Posting[];
};

/**
 * Calculates proportional partial or full refund reversals across creator, referrer, and platform
 * using the payment's historical snapshot allocations, guaranteeing that:
 *   creatorReversedCents + referralReversedCents + platformNetReversedCents === refundAmountCents
 * and never reversing more than the remaining unrefunded allocation on any leg.
 */
export function postingsForProportionalRefund(input: {
  creatorId: string;
  referrerCreatorId: string | null;
  eligibleAmountCents: number;
  creatorAllocationCents: number;
  referralCommissionCents: number;
  platformNetCents: number;
  alreadyRefundedAmountCents: number;
  refundAmountCents: number;
}): ProportionalRefundResult {
  const {
    creatorId,
    referrerCreatorId,
    eligibleAmountCents,
    creatorAllocationCents,
    referralCommissionCents,
    platformNetCents,
    alreadyRefundedAmountCents,
    refundAmountCents,
  } = input;

  if (!Number.isInteger(refundAmountCents) || refundAmountCents <= 0) {
    throw new Error("refundAmountCents must be a positive integer");
  }
  if (alreadyRefundedAmountCents + refundAmountCents > eligibleAmountCents) {
    throw new Error("refundAmountCents exceeds remaining refundable balance");
  }

  // Cumulative proportional calculation prevents rounding drift across multiple partial refunds
  const prevCreatorRev = Math.round((creatorAllocationCents * alreadyRefundedAmountCents) / eligibleAmountCents);
  const prevReferralRev = Math.round((referralCommissionCents * alreadyRefundedAmountCents) / eligibleAmountCents);
  const prevPlatformRev = alreadyRefundedAmountCents - prevCreatorRev - prevReferralRev;

  const newTotalRefunded = alreadyRefundedAmountCents + refundAmountCents;
  const nextCreatorRev =
    newTotalRefunded === eligibleAmountCents
      ? creatorAllocationCents
      : Math.round((creatorAllocationCents * newTotalRefunded) / eligibleAmountCents);
  const nextReferralRev =
    newTotalRefunded === eligibleAmountCents
      ? referralCommissionCents
      : Math.round((referralCommissionCents * newTotalRefunded) / eligibleAmountCents);
  const nextPlatformRev = newTotalRefunded - nextCreatorRev - nextReferralRev;

  const creatorReversedCents = nextCreatorRev - prevCreatorRev;
  const referralReversedCents = nextReferralRev - prevReferralRev;
  const platformNetReversedCents = nextPlatformRev - prevPlatformRev;

  if (creatorReversedCents + referralReversedCents + platformNetReversedCents !== refundAmountCents) {
    throw new Error("proportional refund legs must sum to refundAmountCents");
  }
  if (platformNetReversedCents < 0 || creatorReversedCents < 0 || referralReversedCents < 0) {
    throw new Error("proportional refund leg cannot be negative");
  }

  const p = (account: string, amountCents: number, memo: string): Posting => ({ account, amountCents, memo });
  const isPartial = refundAmountCents < eligibleAmountCents;
  const label = isPartial ? "partial refund" : "refund";

  const raw: Posting[] = [
    p("provider_clearing", refundAmountCents, label),
    p(`creator:${creatorId}`, -creatorReversedCents, `${label} reverses creator earnings`),
    ...(referrerCreatorId && referralReversedCents > 0
      ? [p(`referral:${referrerCreatorId}`, -referralReversedCents, `${label} reverses referral commission`)]
      : []),
    p("platform_fees", -platformNetReversedCents, `${label} reverses platform fee`),
  ];

  const postings = raw.filter((x) => x.amountCents !== 0);
  if (postings.reduce((n, x) => n + x.amountCents, 0) !== 0) {
    throw new Error("refund postings must balance");
  }

  return {
    refundAmountCents,
    creatorReversedCents,
    referralReversedCents,
    platformNetReversedCents,
    postings,
  };
}
