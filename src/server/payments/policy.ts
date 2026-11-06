/**
 * Payment business policy. Changing any value is an owner decision.
 *
 * refundRevokesAccess: false keeps the confirmed default PAY2, so a purchase
 * stays after a refund or chargeback. Setting it to true needs an explicit
 * owner override of PAY2 (DECISION_REGISTER B-5) and counsel on where
 * revoking is legally appropriate. Payments remain disabled either way.
 */
export const PAYMENT_POLICY = {
  refundRevokesAccess: false,
} as const;

/** Proposed by the owner for evaluation (B-3), NOT applied: eligibility takes the hold explicitly. */
export const PROPOSED_PAYOUT_HOLD_DAYS = 14;
