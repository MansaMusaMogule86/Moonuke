import "server-only";
import { system } from "@/server/db";
import { AppError } from "@/server/errors";

/**
 * Payment Names, Statement Descriptors & Configurable US LLC Business Identity
 *
 * Business Context:
 *   DivaFans will operate through a US LLC formed in either Wyoming (WY) or Delaware (DE).
 *   The final legal entity name, formation state, Stripe account, and verified business
 *   details are not yet confirmed. This module keeps them strictly configurable and never
 *   invents company details or implies the business or statement descriptors are already approved.
 *
 * Technical Control Boundaries (Official Stripe & Banking Rail Documentation):
 *   1. Fan Card Statement Merchant Descriptor:
 *      - Platform-controlled (after processor verification): `statement_descriptor` (5-22 ASCII chars,
 *        must match the verified DBA/trading name or domain, cannot be a generic phrase like "Creator Platform")
 *        and `statement_descriptor_suffix` (2-12 ASCII chars for dynamic per-charge suffix).
 *      - Provider-controlled: Stripe validates descriptor changes against verified KYB business documents
 *        and domain ownership, and may prepend a shortened prefix when using dynamic suffixes.
 *      - Bank-controlled: The cardholder's issuing bank controls final statement formatting, truncation,
 *        location suffixes, and processor prefixes (e.g. `SP *`).
 *   2. Creator Bank Payout Sender Descriptor:
 *      - Platform-controlled (partial): `statement_descriptor` on Payout/Transfer objects where supported by rails.
 *      - Provider & Rail-controlled: Cross-border payouts (SEPA, Faster Payments, SWIFT, Global Payouts)
 *        frequently display Stripe's local licensed payment institution or correspondent bank as the sender of record.
 *   3. Receipt & Invoice Business Identity:
 *      - Platform-controlled: Rendered on platform receipts and invoices; must reflect the verified US LLC
 *        once formation in Wyoming (WY) or Delaware (DE) is completed.
 */

export type FormationState = "WY" | "DE" | "UNCONFIRMED";

export type PlatformFinancialConfig = {
  companyCountry: "US";
  formationState: FormationState;
  legalEntityName: string | null;
  tradingName: string | null;
  stripeAccountId: string | null;
  businessVerified: boolean;
  platformFeeBps: number;
  creatorShareBps: number;
  referralFeeBpsOfPlatform: number;
  processingFundedByPlatform: boolean;
  defaultMinWithdrawalCents: number;
  settlementHoldDays: number;
  fanStatementDescriptor: string | null;
  fanStatementSuffix: string | null;
  payoutSenderDescriptor: string | null;
  receiptBusinessName: string | null;
  descriptorsApproved: boolean;
};

export type DescriptorDocumentation = {
  fanCardStatement: {
    effectivePreview: string;
    approvedByProcessor: boolean;
    checkoutNotice: string;
    controlBreakdown: {
      platformControlled: string;
      providerControlled: string;
      bankControlled: string;
    };
  };
  creatorBankPayout: {
    effectivePreview: string;
    approvedByProcessor: boolean;
    controlBreakdown: {
      platformControlled: string;
      providerControlled: string;
      bankControlled: string;
    };
  };
  receiptBusinessIdentity: {
    displayName: string;
    formationDisclosure: string;
    businessVerified: boolean;
  };
};

const FORBIDDEN_GENERIC_DESCRIPTORS = new Set([
  "CREATOR PLATFORM",
  "PLATFORM",
  "PAYMENT",
  "PURCHASE",
  "ONLINE SERVICE",
]);

export function validateStatementDescriptorCandidate(descriptor: string): string {
  const cleaned = descriptor.trim().toUpperCase();
  if (cleaned.length < 5 || cleaned.length > 22) {
    throw new AppError("validation", "Card statement descriptor must be between 5 and 22 ASCII characters.");
  }
  if (!/^[A-Z0-9 .*-]+$/.test(cleaned)) {
    throw new AppError("validation", "Card statement descriptor may only contain ASCII letters, digits, spaces, '.', '*', or '-'.");
  }
  if (!/[A-Z]/.test(cleaned)) {
    throw new AppError("validation", "Card statement descriptor must contain at least one letter.");
  }
  if (FORBIDDEN_GENERIC_DESCRIPTORS.has(cleaned)) {
    throw new AppError(
      "validation",
      `"${cleaned}" cannot be used as a statement descriptor. Card networks require a recognizable verified DBA or legal name.`,
    );
  }
  return cleaned;
}

export async function getPlatformFinancialConfig(): Promise<PlatformFinancialConfig> {
  const row = await system((q) =>
    q.one<{
      company_country: "US";
      formation_state: FormationState;
      legal_entity_name: string | null;
      trading_name: string | null;
      stripe_account_id: string | null;
      business_verified: boolean;
      platform_fee_bps: number;
      creator_share_bps: number;
      referral_fee_bps_of_platform: number;
      processing_funded_by_platform: boolean;
      default_min_withdrawal_cents: number;
      settlement_hold_days: number;
      fan_statement_descriptor: string | null;
      fan_statement_suffix: string | null;
      payout_sender_descriptor: string | null;
      receipt_business_name: string | null;
      descriptors_approved: boolean;
    }>(`select * from app.platform_financial_config where id = 1`),
  );

  if (!row) {
    return {
      companyCountry: "US",
      formationState: "UNCONFIRMED",
      legalEntityName: null,
      tradingName: null,
      stripeAccountId: null,
      businessVerified: false,
      platformFeeBps: 1500,
      creatorShareBps: 8500,
      referralFeeBpsOfPlatform: 1000,
      processingFundedByPlatform: true,
      defaultMinWithdrawalCents: 5000,
      settlementHoldDays: 14,
      fanStatementDescriptor: null,
      fanStatementSuffix: null,
      payoutSenderDescriptor: null,
      receiptBusinessName: null,
      descriptorsApproved: false,
    };
  }

  return {
    companyCountry: row.company_country,
    formationState: row.formation_state,
    legalEntityName: row.legal_entity_name,
    tradingName: row.trading_name,
    stripeAccountId: row.stripe_account_id,
    businessVerified: row.business_verified,
    platformFeeBps: row.platform_fee_bps,
    creatorShareBps: row.creator_share_bps,
    referralFeeBpsOfPlatform: row.referral_fee_bps_of_platform,
    processingFundedByPlatform: row.processing_funded_by_platform,
    defaultMinWithdrawalCents: row.default_min_withdrawal_cents,
    settlementHoldDays: row.settlement_hold_days,
    fanStatementDescriptor: row.fan_statement_descriptor,
    fanStatementSuffix: row.fan_statement_suffix,
    payoutSenderDescriptor: row.payout_sender_descriptor,
    receiptBusinessName: row.receipt_business_name,
    descriptorsApproved: row.descriptors_approved,
  };
}

export async function updatePlatformFinancialConfig(input: Partial<{
  formationState: FormationState;
  legalEntityName: string | null;
  tradingName: string | null;
  stripeAccountId: string | null;
  businessVerified: boolean;
  platformFeeBps: number;
  referralFeeBpsOfPlatform: number;
  processingFundedByPlatform: boolean;
  defaultMinWithdrawalCents: number;
  settlementHoldDays: number;
  fanStatementDescriptor: string | null;
  fanStatementSuffix: string | null;
  payoutSenderDescriptor: string | null;
  receiptBusinessName: string | null;
  descriptorsApproved: boolean;
  updatedBy: string | null;
}>): Promise<PlatformFinancialConfig> {
  if (input.fanStatementDescriptor != null && input.fanStatementDescriptor !== "") {
    input.fanStatementDescriptor = validateStatementDescriptorCandidate(input.fanStatementDescriptor);
  }
  if (input.platformFeeBps !== undefined) {
    if (!Number.isInteger(input.platformFeeBps) || input.platformFeeBps < 0 || input.platformFeeBps > 5000) {
      throw new AppError("validation", "Platform fee must be an integer between 0 and 5000 bps.");
    }
  }
  if (input.referralFeeBpsOfPlatform !== undefined) {
    if (
      !Number.isInteger(input.referralFeeBpsOfPlatform) ||
      input.referralFeeBpsOfPlatform < 0 ||
      input.referralFeeBpsOfPlatform > 5000
    ) {
      throw new AppError("validation", "Referral share of platform fee must be between 0 and 5000 bps.");
    }
  }

  const current = await getPlatformFinancialConfig();
  const nextPlatformFeeBps = input.platformFeeBps ?? current.platformFeeBps;
  const nextCreatorShareBps = 10000 - nextPlatformFeeBps;

  await system((q) =>
    q.query(
      `update app.platform_financial_config
          set formation_state = $1,
              legal_entity_name = $2,
              trading_name = $3,
              stripe_account_id = $4,
              business_verified = $5,
              platform_fee_bps = $6,
              creator_share_bps = $7,
              referral_fee_bps_of_platform = $8,
              processing_funded_by_platform = $9,
              default_min_withdrawal_cents = $10,
              settlement_hold_days = $11,
              fan_statement_descriptor = $12,
              fan_statement_suffix = $13,
              payout_sender_descriptor = $14,
              receipt_business_name = $15,
              descriptors_approved = $16,
              updated_by = $17,
              updated_at = now()
        where id = 1`,
      [
        input.formationState ?? current.formationState,
        input.legalEntityName !== undefined ? input.legalEntityName : current.legalEntityName,
        input.tradingName !== undefined ? input.tradingName : current.tradingName,
        input.stripeAccountId !== undefined ? input.stripeAccountId : current.stripeAccountId,
        input.businessVerified ?? current.businessVerified,
        nextPlatformFeeBps,
        nextCreatorShareBps,
        input.referralFeeBpsOfPlatform ?? current.referralFeeBpsOfPlatform,
        input.processingFundedByPlatform ?? current.processingFundedByPlatform,
        input.defaultMinWithdrawalCents ?? current.defaultMinWithdrawalCents,
        input.settlementHoldDays ?? current.settlementHoldDays,
        input.fanStatementDescriptor !== undefined ? input.fanStatementDescriptor : current.fanStatementDescriptor,
        input.fanStatementSuffix !== undefined ? input.fanStatementSuffix : current.fanStatementSuffix,
        input.payoutSenderDescriptor !== undefined ? input.payoutSenderDescriptor : current.payoutSenderDescriptor,
        input.receiptBusinessName !== undefined ? input.receiptBusinessName : current.receiptBusinessName,
        input.descriptorsApproved ?? current.descriptorsApproved,
        input.updatedBy ?? null,
      ],
    ),
  );

  return getPlatformFinancialConfig();
}

export function describePaymentIdentities(cfg: PlatformFinancialConfig): DescriptorDocumentation {
  const approvedAndVerified = cfg.businessVerified && cfg.descriptorsApproved && Boolean(cfg.fanStatementDescriptor);
  const effectiveFanDescriptor = approvedAndVerified
    ? cfg.fanStatementSuffix
      ? `${cfg.fanStatementDescriptor}* ${cfg.fanStatementSuffix}`.slice(0, 22)
      : cfg.fanStatementDescriptor!
    : cfg.fanStatementDescriptor
      ? `${cfg.fanStatementDescriptor} (PENDING PROCESSOR APPROVAL)`
      : "UNCONFIRMED — AWAITING US LLC & PROCESSOR APPROVAL";

  const checkoutNotice = approvedAndVerified
    ? `Your statement may show "${effectiveFanDescriptor}" (final formatting depends on your card issuer).`
    : `Your statement may show our verified US LLC merchant descriptor once processor onboarding is finalized (sandbox preview: ${cfg.fanStatementDescriptor ?? "pending descriptor configuration"}).`;

  const effectivePayoutSender =
    cfg.businessVerified && cfg.descriptorsApproved && cfg.payoutSenderDescriptor
      ? cfg.payoutSenderDescriptor
      : "STRIPE / LOCAL PAYOUT RAIL PARTNER (pending US LLC payout descriptor verification)";

  const stateLabel =
    cfg.formationState === "WY"
      ? "Wyoming (US LLC)"
      : cfg.formationState === "DE"
        ? "Delaware (US LLC)"
        : "US LLC (Wyoming or Delaware — formation pending confirmation)";

  const receiptDisplayName =
    cfg.businessVerified && cfg.legalEntityName
      ? `${cfg.legalEntityName} (${stateLabel})`
      : cfg.receiptBusinessName
        ? `${cfg.receiptBusinessName} — ${stateLabel} (unverified sandbox config)`
        : `DivaFans — ${stateLabel}`;

  return {
    fanCardStatement: {
      effectivePreview: effectiveFanDescriptor,
      approvedByProcessor: approvedAndVerified,
      checkoutNotice,
      controlBreakdown: {
        platformControlled:
          "Configured statement_descriptor (5-22 ASCII chars) and optional statement_descriptor_suffix passed on PaymentIntent after business verification.",
        providerControlled:
          "Stripe verifies DBA/legal entity match, rejects generic descriptors (such as 'Creator Platform'), and enforces prefix rules.",
        bankControlled:
          "Issuing bank controls final line-item truncation, capitalization, city/state suffix, and processor prefix.",
      },
    },
    creatorBankPayout: {
      effectivePreview: effectivePayoutSender,
      approvedByProcessor: Boolean(cfg.businessVerified && cfg.descriptorsApproved && cfg.payoutSenderDescriptor),
      controlBreakdown: {
        platformControlled:
          "Configured payout statement_descriptor where supported by domestic ACH / local transfer rails.",
        providerControlled:
          "Cross-border Connect and Global Payouts corridors frequently transmit via Stripe's local licensed payment entity.",
        bankControlled:
          "Receiving bank formats incoming ACH/SEPA/SWIFT remittance fields according to local clearing rules.",
      },
    },
    receiptBusinessIdentity: {
      displayName: receiptDisplayName,
      formationDisclosure: stateLabel,
      businessVerified: cfg.businessVerified,
    },
  };
}

