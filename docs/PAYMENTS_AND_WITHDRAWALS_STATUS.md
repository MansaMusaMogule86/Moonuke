# Payments and withdrawals — configuration status (no live money)

No company facts are invented. Legal entity, formation state, Stripe account,
and descriptor approvals are unconfirmed placeholders until counsel and the
processor approve in writing.

## Configuration (placeholders, not facts)

- Company country: US. Formation: Wyoming or Delaware — `formationState`
  is `UNCONFIRMED` until filed (`descriptors.ts`, migration `20261125000001`).
- `legalEntityName`, `tradingName`, and `stripeAccountId` are NULL.
- `businessVerified=false`, `descriptorsApproved=false`.
- Fee defaults: 15% platform (`1500` bps), 85% creator, referral 10% of
  platform fee (1.5% of sale). Bounds and the fee+share=10000 invariant are
  enforced in `migration 20261125000001` and `ledger.ts`/`engine.ts`.
- Minimum withdrawal: $50 (`5000` cents). Settlement hold: 14 days.
  Schedule: manual or weekly where supported
  (`creatorReferralsAndWithdrawals.ts`).

## Provider and enablement

- `approvedProviders=[]` (`payments/index.ts`). `FEATURE_PAYMENTS` defaults
  off and production refuses ON without an approved provider
  (`flags.ts`, `env.ts`). Webhook route is inert 404 until then.
- No Stripe SDK in `package.json`. Sandbox refs only (`*_sandbox`, `tr_*`,
  `po_*`); raw PAN/IBAN patterns are rejected.
- Integrity that is already built: HMAC-SHA256 webhooks (300s tolerance),
  DB-resolved pricing (never trust the client), idempotency keys, state
  machine, proportional refunds, per-currency integer minor units
  (`ledger.ts`, `engine.ts`, `webhook.ts`, `checkout.ts`).

## Country support (verify with the provider before enabling)

- Matrix: `src/server/payments/countryEligibility.ts`.
- US LLC via Stripe Connect cross-border payouts: EEA + UK + CH are modelled
  as supported; Morocco and individual GCC states require Stripe Global
  Payouts or an approved corridor adapter and are not enabled by default.
- Rule: creators where no payout corridor is active cannot enable paid
  monetization; they get an explanation and a waitlist option. False
  residence, VPN workarounds, and third-party bank accounts are prohibited.
- Do not treat this file as provider approval. Each country must be verified
  in current official provider docs plus a written confirmation for the
  approved account before monetization opens there.

## Balances and descriptors

- Balances: pending, available, reserved, withdrawn are derived from the
  append-only ledger (`maturedBalance`, `payoutEligibility` in `engine.ts`).
- Statement descriptors distinguish three things (`descriptors.ts`):
  card statement descriptor, bank payout sender info, and receipt identity.
  Previews fall back to `UNCONFIRMED_*` until the processor approves them.
  Truthful checkout notices are shown; nothing claims approval.
