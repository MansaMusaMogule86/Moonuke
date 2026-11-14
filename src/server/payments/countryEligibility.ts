import "server-only";
import { system } from "@/server/db";
import { AppError } from "@/server/errors";

/**
 * Global Creator Eligibility & Country Payout Capability Matrix
 *
 * Based on official US Stripe platform documentation (Stripe Connect Cross-Border Payouts
 * vs. Stripe Global Payouts):
 *   - Company Country: US (Wyoming or Delaware LLC)
 *   - Individual European Countries (EEA + UK + Switzerland): Supported via US Stripe Connect
 *     Cross-Border Payouts in EUR / GBP / CHF / local EEA currency.
 *   - Morocco (MA): NOT supported by standard self-serve US Stripe Connect Cross-Border
 *     connected accounts. Requires Stripe Global Payouts (Outbound Payments) enablement
 *     or an approved cross-border payout corridor adapter.
 *   - Individual GCC Countries (AE, SA, QA, KW, BH, OM): Evaluated individually; not supported
 *     by standard self-serve US Stripe Connect Cross-Border connected accounts without
 *     Stripe Global Payouts or an approved local/cross-border payout corridor adapter.
 *
 * Compliance Rule:
 *   Creators in countries where a payout corridor is not yet active cannot enable paid
 *   monetization; they receive a transparent explanation and may join the corridor waitlist.
 *   False residence countries, VPN workarounds, or third-party/borrowed bank accounts are strictly prohibited.
 */

export type PayoutCapabilityStatus =
  | "supported_connect_sandbox"
  | "requires_global_payouts_or_adapter"
  | "pending_verification"
  | "unsupported";

export type CountryPayoutCapability = {
  countryCode: string;
  countryName: string;
  region: "north_america" | "europe" | "gcc" | "mena" | "other";
  companyCountry: string;
  individualSupported: boolean;
  businessSupported: boolean;
  paymentAcceptanceSupported: boolean;
  connectCrossBorderPayouts: boolean;
  globalPayoutsCorridor: boolean;
  payoutStatus: PayoutCapabilityStatus;
  supportedCurrencies: string[];
  supportedBankFormats: string[];
  requiredVerification: string[];
  providerNotes: string;
};

export type CreatorCountryEvaluation = {
  eligibleForPaidMonetization: boolean;
  canJoinWaitlist: boolean;
  countryCode: string;
  entityType: "individual" | "company";
  capability: CountryPayoutCapability | null;
  blockingReason: string | null;
  complianceNotice: string;
};

/**
 * Provider adapter interface for cross-border payout corridors that cannot use
 * standard US Stripe Connect connected accounts (e.g. Morocco or GCC corridors via
 * Stripe Global Payouts or a secondary licensed mass-payout provider).
 */
export interface PayoutCorridorAdapter {
  readonly providerId: "stripe_connect_sandbox" | "global_payouts_sandbox";
  supportsCountry(countryCode: string, entityType: "individual" | "company"): Promise<boolean>;
  createRecipientAccountSandbox(input: {
    creatorId: string;
    countryCode: string;
    entityType: "individual" | "company";
    currency: string;
    bankName: string;
    accountLast4: string;
  }): Promise<{
    providerAccountRef: string;
    maskedAccount: string;
    estimatedArrivalDays: number;
  }>;
}

const COMPLIANCE_RESIDENCE_NOTICE =
  "Your payout country must match your verified legal residence and a bank account held in your own legal or business name. Using a false country, VPN workaround, or borrowed bank account is prohibited and will result in account suspension.";

function mapCapabilityRow(r: {
  country_code: string;
  country_name: string;
  region: "north_america" | "europe" | "gcc" | "mena" | "other";
  company_country: string;
  individual_supported: boolean;
  business_supported: boolean;
  payment_acceptance_supported: boolean;
  connect_cross_border_payouts: boolean;
  global_payouts_corridor: boolean;
  payout_status: PayoutCapabilityStatus;
  supported_currencies: string[];
  supported_bank_formats: string[];
  required_verification: string[];
  provider_notes: string;
}): CountryPayoutCapability {
  return {
    countryCode: r.country_code,
    countryName: r.country_name,
    region: r.region,
    companyCountry: r.company_country,
    individualSupported: r.individual_supported,
    businessSupported: r.business_supported,
    paymentAcceptanceSupported: r.payment_acceptance_supported,
    connectCrossBorderPayouts: r.connect_cross_border_payouts,
    globalPayoutsCorridor: r.global_payouts_corridor,
    payoutStatus: r.payout_status,
    supportedCurrencies: r.supported_currencies,
    supportedBankFormats: r.supported_bank_formats,
    requiredVerification: r.required_verification,
    providerNotes: r.provider_notes,
  };
}

export async function listCountryPayoutCapabilities(): Promise<CountryPayoutCapability[]> {
  const rows = await system((q) =>
    q.query<{
      country_code: string;
      country_name: string;
      region: "north_america" | "europe" | "gcc" | "mena" | "other";
      company_country: string;
      individual_supported: boolean;
      business_supported: boolean;
      payment_acceptance_supported: boolean;
      connect_cross_border_payouts: boolean;
      global_payouts_corridor: boolean;
      payout_status: PayoutCapabilityStatus;
      supported_currencies: string[];
      supported_bank_formats: string[];
      required_verification: string[];
      provider_notes: string;
    }>(`select * from app.country_payout_capabilities order by region, country_name`),
  );
  return rows.map(mapCapabilityRow);
}

export async function getCountryPayoutCapability(countryCode: string): Promise<CountryPayoutCapability | null> {
  const code = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  const row = await system((q) =>
    q.one<{
      country_code: string;
      country_name: string;
      region: "north_america" | "europe" | "gcc" | "mena" | "other";
      company_country: string;
      individual_supported: boolean;
      business_supported: boolean;
      payment_acceptance_supported: boolean;
      connect_cross_border_payouts: boolean;
      global_payouts_corridor: boolean;
      payout_status: PayoutCapabilityStatus;
      supported_currencies: string[];
      supported_bank_formats: string[];
      required_verification: string[];
      provider_notes: string;
    }>(`select * from app.country_payout_capabilities where country_code = $1`, [code]),
  );
  return row ? mapCapabilityRow(row) : null;
}

export async function evaluateCreatorCountryEligibility(
  countryCode: string,
  entityType: "individual" | "company" = "individual",
): Promise<CreatorCountryEvaluation> {
  const code = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) {
    throw new AppError("validation", "Country code must be a valid 2-letter ISO code.");
  }

  const cap = await getCountryPayoutCapability(code);
  if (!cap) {
    return {
      eligibleForPaidMonetization: false,
      canJoinWaitlist: true,
      countryCode: code,
      entityType,
      capability: null,
      blockingReason: `Country "${code}" is not currently in our active US Stripe Connect payout matrix. Paid monetization cannot be enabled until a verified payout corridor is available for your jurisdiction.`,
      complianceNotice: COMPLIANCE_RESIDENCE_NOTICE,
    };
  }

  const entitySupported = entityType === "individual" ? cap.individualSupported : cap.businessSupported;
  if (cap.payoutStatus !== "supported_connect_sandbox" || !entitySupported) {
    return {
      eligibleForPaidMonetization: false,
      canJoinWaitlist: true,
      countryCode: code,
      entityType,
      capability: cap,
      blockingReason: `${cap.countryName} (${cap.countryCode}): ${cap.providerNotes}`,
      complianceNotice: COMPLIANCE_RESIDENCE_NOTICE,
    };
  }

  return {
    eligibleForPaidMonetization: true,
    canJoinWaitlist: false,
    countryCode: code,
    entityType,
    capability: cap,
    blockingReason: null,
    complianceNotice: COMPLIANCE_RESIDENCE_NOTICE,
  };
}

