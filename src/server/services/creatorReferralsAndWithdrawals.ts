import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { formatCreatorPublicName } from "@/lib/creatorName";
import { verifyPassword } from "@/server/auth/crypto";
import type { Viewer } from "@/server/auth/permissions";
import { asViewer, system } from "@/server/db";
import { AppError } from "@/server/errors";
import { requireFeature } from "@/server/flags";
import { evaluateCreatorCountryEligibility } from "@/server/payments/countryEligibility";
import { getPlatformFinancialConfig } from "@/server/payments/descriptors";
import { audit } from "@/server/services/audit";
import { deliverNotification } from "@/server/services/notifications";

// ============================================================================
// DivaFans — Creator Referrals, Bank Onboarding & Withdrawals Service
// ============================================================================

export type CreatorRecruitmentLink = {
  creatorId: string;
  recruitmentCode: string;
  recruitmentPath: string;
  active: boolean;
};

export type PublicRecruitmentPreview = {
  creatorId: string;
  handle: string;
  displayName: string;
  recruitmentCode: string;
  recruitmentPath: string;
};

export type CreatorReferralAttribution = {
  referredCreatorId: string;
  referrerCreatorId: string;
  recruitmentCode: string;
  status: "captured" | "confirmed" | "revoked";
  agreementAcceptedAt: string | null;
  capturedAt: string;
  confirmedAt: string | null;
};

export type CreatorPayoutAccountView = {
  creatorId: string;
  residenceCountry: string;
  entityType: "individual" | "company";
  provider: "stripe_connect_sandbox" | "global_payouts_sandbox";
  providerAccountRef: string;
  bankName: string;
  maskedAccount: string;
  currency: string;
  kycVerified: boolean;
  payoutsEnabled: boolean;
  autoPayoutEnabled: boolean;
  autoPayoutSchedule: "manual" | "weekly";
  securityHoldUntil: string | null;
};

export type CreatorWithdrawalRecord = {
  id: string;
  creatorId: string;
  amountCents: number;
  feeCents: number;
  netAmountCents: number;
  currency: string;
  status: "requested" | "approved" | "processing" | "paid" | "failed" | "canceled";
  maskedDestination: string | null;
  transferRef: string | null;
  bankPayoutRef: string | null;
  failureReason: string | null;
  estimatedArrivalAt: string | null;
  createdAt: string;
  processedAt: string | null;
};

function assertActiveCreator(viewer: Viewer) {
  if (viewer.status !== "active" || viewer.role !== "creator") {
    throw new AppError("forbidden", "Creator account required.");
  }
}

function assertActiveOwnerAal2(viewer: Viewer) {
  if (viewer.status !== "active" || viewer.role !== "owner" || viewer.aal < 2) {
    throw new AppError("forbidden", "Owner AAL2 authorization required.");
  }
}

function validateMaskedLast4(rawLast4: string, bankName: string): string {
  const trimmedBank = bankName.trim();
  if (trimmedBank.length < 2 || trimmedBank.length > 100) {
    throw new AppError("validation", "Bank name must be between 2 and 100 characters.");
  }
  // Reject if a caller attempts to pass a full IBAN or raw bank account number inside bankName or accountLast4
  if (/\b[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}\b/i.test(trimmedBank) || /\b[0-9]{8,24}\b/.test(trimmedBank)) {
    throw new AppError(
      "validation",
      "Never submit raw bank account numbers or IBANs to the platform database. Only masked bank metadata is stored.",
    );
  }
  const clean = rawLast4.trim();
  if (!/^[0-9A-Za-z]{4}$/.test(clean)) {
    throw new AppError(
      "validation",
      "Only the last 4 characters of your bank account may be stored (raw account numbers and IBANs are prohibited).",
    );
  }
  return `•••• ${clean.toUpperCase()}`;
}

// ----------------------------------------------------------------------------
// 1. Direct Creator Recruitment Links (Separate from Fan Invite Links)
// ----------------------------------------------------------------------------

export async function getOrCreateCreatorRecruitmentLink(viewer: Viewer): Promise<CreatorRecruitmentLink> {
  assertActiveCreator(viewer);
  return system(async (q) => {
    const existing = await q.one<{
      creator_id: string;
      recruitment_code: string;
      active: boolean;
    }>(`select creator_id, recruitment_code::text, active from app.creator_recruitment_links where creator_id = $1`, [
      viewer.id,
    ]);
    if (existing) {
      return {
        creatorId: existing.creator_id,
        recruitmentCode: existing.recruitment_code,
        recruitmentPath: `/recruit/${existing.recruitment_code}`,
        active: existing.active,
      };
    }

    const creator = await q.one<{ handle: string }>(
      `select handle::text from app.creators where user_id = $1`,
      [viewer.id],
    );
    const baseSlug = (creator?.handle ?? viewer.id.slice(0, 8))
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 20);
    const suffix = viewer.id.replace(/-/g, "").slice(0, 6).toLowerCase();
    const code = `diva-${baseSlug}-${suffix}`.slice(0, 32);

    const ins = await q.one<{
      creator_id: string;
      recruitment_code: string;
      active: boolean;
    }>(
      `insert into app.creator_recruitment_links (creator_id, recruitment_code, active)
       values ($1, $2, true)
       on conflict (creator_id) do update set updated_at = now()
       returning creator_id, recruitment_code::text, active`,
      [viewer.id, code],
    );

    return {
      creatorId: ins!.creator_id,
      recruitmentCode: ins!.recruitment_code,
      recruitmentPath: `/recruit/${ins!.recruitment_code}`,
      active: ins!.active,
    };
  });
}

export async function resolveRecruitmentCode(code: string): Promise<PublicRecruitmentPreview | null> {
  const clean = code.trim().toLowerCase();
  if (!/^[a-z0-9_-]{4,32}$/.test(clean)) return null;

  return system(async (q) => {
    const row = await q.one<{
      creator_id: string;
      recruitment_code: string;
      handle: string;
      creator_name: string | null;
      display_name: string;
    }>(
      `select l.creator_id, l.recruitment_code::text, c.handle::text, c.creator_name, c.display_name
         from app.creator_recruitment_links l
         join app.creators c on c.user_id = l.creator_id
         join app.users u on u.id = l.creator_id
        where l.recruitment_code = $1
          and l.active = true
          and u.status = 'active'
          and u.role = 'creator'`,
      [clean],
    );
    if (!row) return null;
    return {
      creatorId: row.creator_id,
      handle: row.handle,
      displayName: formatCreatorPublicName(row.creator_name ?? row.display_name),
      recruitmentCode: row.recruitment_code,
      recruitmentPath: `/recruit/${row.recruitment_code}`,
    };
  });
}

// ----------------------------------------------------------------------------
// 2. Creator Referral Attribution (Single-Level Only, Immutable After Capture)
// ----------------------------------------------------------------------------

/**
 * Captures a direct creator referral during signup/application.
 * Enforces:
 *   - No self-referral
 *   - No circular referral chains (A -> B -> A, A -> B -> C -> A)
 *   - Never silently replaces an existing attribution
 *   - Never creates a financial reward for registration alone
 */
export async function captureCreatorReferralAtSignup(input: {
  referredUserId: string;
  recruitmentCode: string;
}): Promise<CreatorReferralAttribution> {
  const resolved = await resolveRecruitmentCode(input.recruitmentCode);
  if (!resolved) {
    throw new AppError("not_found", "Creator recruitment link is invalid or inactive.");
  }
  if (resolved.creatorId === input.referredUserId) {
    throw new AppError("validation", "Creators cannot refer themselves.");
  }

  return system(async (q) => {
    const existing = await q.one<{
      referred_creator_id: string;
      referrer_creator_id: string;
      recruitment_code: string;
      status: "captured" | "confirmed" | "revoked";
      agreement_accepted_at: Date | null;
      captured_at: Date;
      confirmed_at: Date | null;
    }>(`select * from app.creator_recruitments where referred_creator_id = $1 for update`, [input.referredUserId]);

    if (existing) {
      if (existing.referrer_creator_id !== resolved.creatorId) {
        throw new AppError(
          "conflict",
          "This creator account already has a recorded referral attribution and cannot be silently reassigned.",
        );
      }
      return {
        referredCreatorId: existing.referred_creator_id,
        referrerCreatorId: existing.referrer_creator_id,
        recruitmentCode: existing.recruitment_code,
        status: existing.status,
        agreementAcceptedAt: existing.agreement_accepted_at?.toISOString() ?? null,
        capturedAt: existing.captured_at.toISOString(),
        confirmedAt: existing.confirmed_at?.toISOString() ?? null,
      };
    }

    const cycle = await q.one<{ has_cycle: boolean }>(
      `select app.has_creator_recruitment_cycle($1::uuid, $2::uuid) as has_cycle`,
      [input.referredUserId, resolved.creatorId],
    );
    if (cycle?.has_cycle) {
      throw new AppError("validation", "Circular creator referral chains are prohibited.");
    }

    const ins = await q.one<{
      referred_creator_id: string;
      referrer_creator_id: string;
      recruitment_code: string;
      status: "captured" | "confirmed" | "revoked";
      agreement_accepted_at: Date | null;
      captured_at: Date;
      confirmed_at: Date | null;
    }>(
      `insert into app.creator_recruitments (
         referred_creator_id, referrer_creator_id, recruitment_code, status
       )
       values ($1, $2, $3, 'captured')
       returning *`,
      [input.referredUserId, resolved.creatorId, resolved.recruitmentCode],
    );

    await audit(q, {
      actorId: input.referredUserId,
      action: "referral.creator_captured",
      targetType: "creator_recruitment",
      targetId: input.referredUserId,
      metadata: {
        referrerCreatorId: resolved.creatorId,
        recruitmentCode: resolved.recruitmentCode,
      },
    });

    return {
      referredCreatorId: ins!.referred_creator_id,
      referrerCreatorId: ins!.referrer_creator_id,
      recruitmentCode: ins!.recruitment_code,
      status: ins!.status,
      agreementAcceptedAt: ins!.agreement_accepted_at?.toISOString() ?? null,
      capturedAt: ins!.captured_at.toISOString(),
      confirmedAt: ins!.confirmed_at?.toISOString() ?? null,
    };
  });
}

/**
 * Confirms a creator referral during creator onboarding before monetization begins.
 */
export async function confirmCreatorReferralOnboarding(
  viewer: Viewer,
  input: { acceptReferralTerms: boolean; recruitmentCode?: string },
): Promise<CreatorReferralAttribution | null> {
  assertActiveCreator(viewer);
  if (!input.acceptReferralTerms) {
    throw new AppError("validation", "You must accept the creator referral program terms to confirm attribution.");
  }

  if (input.recruitmentCode) {
    await captureCreatorReferralAtSignup({
      referredUserId: viewer.id,
      recruitmentCode: input.recruitmentCode,
    });
  }

  return system(async (q) => {
    const row = await q.one<{
      referred_creator_id: string;
      referrer_creator_id: string;
      recruitment_code: string;
      status: "captured" | "confirmed" | "revoked";
      agreement_accepted_at: Date | null;
      captured_at: Date;
      confirmed_at: Date | null;
    }>(
      `update app.creator_recruitments
          set status = 'confirmed',
              agreement_accepted_at = coalesce(agreement_accepted_at, now()),
              confirmed_at = coalesce(confirmed_at, now()),
              updated_at = now()
        where referred_creator_id = $1
          and status in ('captured', 'confirmed')
        returning *`,
      [viewer.id],
    );

    if (!row) return null;

    await audit(q, {
      actorId: viewer.id,
      action: "referral.creator_confirmed",
      targetType: "creator_recruitment",
      targetId: viewer.id,
      metadata: {
        referrerCreatorId: row.referrer_creator_id,
        recruitmentCode: row.recruitment_code,
      },
    });

    return {
      referredCreatorId: row.referred_creator_id,
      referrerCreatorId: row.referrer_creator_id,
      recruitmentCode: row.recruitment_code,
      status: row.status,
      agreementAcceptedAt: row.agreement_accepted_at?.toISOString() ?? null,
      capturedAt: row.captured_at.toISOString(),
      confirmedAt: row.confirmed_at?.toISOString() ?? null,
    };
  });
}

/**
 * Authorized, audited administrative correction of a creator's direct referrer.
 * Requires Owner AAL2 and an explicit written reason.
 */
export async function adminReassignCreatorReferrer(
  ownerViewer: Viewer,
  input: {
    referredCreatorId: string;
    newReferrerCreatorId: string;
    reason: string;
  },
): Promise<CreatorReferralAttribution> {
  assertActiveOwnerAal2(ownerViewer);
  const reason = input.reason.trim();
  if (reason.length < 5) {
    throw new AppError("validation", "An explicit audit reason (at least 5 characters) is required for referral reassignment.");
  }
  if (input.referredCreatorId === input.newReferrerCreatorId) {
    throw new AppError("validation", "Creators cannot refer themselves.");
  }

  return system(async (q) => {
    const cycle = await q.one<{ has_cycle: boolean }>(
      `select app.has_creator_recruitment_cycle($1::uuid, $2::uuid) as has_cycle`,
      [input.referredCreatorId, input.newReferrerCreatorId],
    );
    if (cycle?.has_cycle) {
      throw new AppError("validation", "Circular creator referral chains are prohibited.");
    }

    const link = await q.one<{ recruitment_code: string }>(
      `select recruitment_code::text from app.creator_recruitment_links where creator_id = $1`,
      [input.newReferrerCreatorId],
    );
    const code = link?.recruitment_code ?? `admin-assigned-${input.newReferrerCreatorId.slice(0, 8)}`;

    const row = await q.one<{
      referred_creator_id: string;
      referrer_creator_id: string;
      recruitment_code: string;
      status: "captured" | "confirmed" | "revoked";
      agreement_accepted_at: Date | null;
      captured_at: Date;
      confirmed_at: Date | null;
    }>(
      `insert into app.creator_recruitments (
         referred_creator_id, referrer_creator_id, recruitment_code, status,
         agreement_accepted_at, confirmed_at, attributed_by, override_reason
       )
       values ($1, $2, $3, 'confirmed', now(), now(), $4, $5)
       on conflict (referred_creator_id) do update
         set referrer_creator_id = excluded.referrer_creator_id,
             recruitment_code = excluded.recruitment_code,
             status = 'confirmed',
             agreement_accepted_at = coalesce(app.creator_recruitments.agreement_accepted_at, now()),
             confirmed_at = coalesce(app.creator_recruitments.confirmed_at, now()),
             attributed_by = excluded.attributed_by,
             override_reason = excluded.override_reason,
             updated_at = now()
       returning *`,
      [input.referredCreatorId, input.newReferrerCreatorId, code, ownerViewer.id, reason],
    );

    await audit(q, {
      actorId: ownerViewer.id,
      action: "referral.admin_reassigned",
      targetType: "creator_recruitment",
      targetId: input.referredCreatorId,
      metadata: {
        newReferrerCreatorId: input.newReferrerCreatorId,
        reason,
      },
    });

    return {
      referredCreatorId: row!.referred_creator_id,
      referrerCreatorId: row!.referrer_creator_id,
      recruitmentCode: row!.recruitment_code,
      status: row!.status,
      agreementAcceptedAt: row!.agreement_accepted_at?.toISOString() ?? null,
      capturedAt: row!.captured_at.toISOString(),
      confirmedAt: row!.confirmed_at?.toISOString() ?? null,
    };
  });
}

// ----------------------------------------------------------------------------
// 3. Country Eligibility, Waitlist & Creator Bank Onboarding
// ----------------------------------------------------------------------------

export async function joinCreatorMonetizationWaitlist(
  viewer: Viewer,
  input: {
    residenceCountry: string;
    entityType?: "individual" | "company";
    preferredCurrency?: string;
    reason?: string;
  },
) {
  assertActiveCreator(viewer);
  const countryCode = input.residenceCountry.trim().toUpperCase();
  const entityType = input.entityType ?? "individual";
  const evalResult = await evaluateCreatorCountryEligibility(countryCode, entityType);
  const preferredCurrency = (input.preferredCurrency ?? "USD").trim().toUpperCase();
  const reason = input.reason?.trim() || evalResult.blockingReason || "Corridor pending enablement";

  return system(async (q) => {
    const row = await q.one<{
      id: string;
      creator_id: string;
      residence_country: string;
      entity_type: "individual" | "company";
      preferred_currency: string;
      status: string;
      reason: string;
    }>(
      `insert into app.creator_monetization_waitlist (
         creator_id, residence_country, entity_type, preferred_currency, status, reason
       )
       values ($1, $2, $3, $4, 'waitlisted', $5)
       on conflict (creator_id) do update
         set residence_country = excluded.residence_country,
             entity_type = excluded.entity_type,
             preferred_currency = excluded.preferred_currency,
             reason = excluded.reason,
             updated_at = now()
       returning id, creator_id, residence_country, entity_type, preferred_currency, status, reason`,
      [viewer.id, countryCode, entityType, preferredCurrency, reason],
    );

    await audit(q, {
      actorId: viewer.id,
      action: "creator.monetization_waitlisted",
      targetType: "creator",
      targetId: viewer.id,
      metadata: {
        residenceCountry: countryCode,
        entityType,
        reason,
      },
    });

    return row!;
  });
}

/**
 * Onboards a creator's payout account in the provider sandbox environment.
 * Enforces country eligibility first; blocks unsupported/unapproved corridors
 * with a clear explanation and waitlist registration.
 * Stores only provider token references and masked bank details — never raw account numbers or IBANs.
 */
export async function onboardCreatorPayoutAccount(
  viewer: Viewer,
  input: {
    residenceCountry: string;
    entityType?: "individual" | "company";
    currency: string;
    bankName: string;
    accountLast4: string;
    kycVerified?: boolean;
    autoPayoutEnabled?: boolean;
    autoPayoutSchedule?: "manual" | "weekly";
  },
): Promise<CreatorPayoutAccountView> {
  assertActiveCreator(viewer);
  const countryCode = input.residenceCountry.trim().toUpperCase();
  const entityType = input.entityType ?? "individual";
  const evalResult = await evaluateCreatorCountryEligibility(countryCode, entityType);

  if (!evalResult.eligibleForPaidMonetization || !evalResult.capability) {
    // Automatically record waitlist registration so the creator's application is preserved
    await joinCreatorMonetizationWaitlist(viewer, {
      residenceCountry: countryCode,
      entityType,
      preferredCurrency: input.currency,
      reason: evalResult.blockingReason ?? "Payout corridor not yet enabled",
    });
    throw new AppError(
      "validation",
      `${evalResult.blockingReason} Your account has been added to our regional payout waitlist. ${evalResult.complianceNotice}`,
    );
  }

  const currency = input.currency.trim().toUpperCase();
  if (!evalResult.capability.supportedCurrencies.includes(currency)) {
    throw new AppError(
      "validation",
      `Currency ${currency} is not supported for payouts in ${evalResult.capability.countryName}. Supported currencies: ${evalResult.capability.supportedCurrencies.join(", ")}.`,
    );
  }

  const maskedAccount = validateMaskedLast4(input.accountLast4, input.bankName);
  const bankName = input.bankName.trim();
  const kycVerified = input.kycVerified ?? true;
  const payoutsEnabled = kycVerified;
  const autoPayoutEnabled = input.autoPayoutEnabled ?? false;
  const autoPayoutSchedule = autoPayoutEnabled ? (input.autoPayoutSchedule ?? "weekly") : "manual";
  const providerAccountRef = `acct_sandbox_${countryCode.toLowerCase()}_${viewer.id.replace(/-/g, "").slice(0, 12)}`;

  return system(async (q) => {
    if (kycVerified) {
      await q.query(
        `insert into app.creator_verifications (
           user_id, status, checks, submitted_at, reviewed_at, review_note,
           age_attested_at, identity_attested_at, consent_records_attested_at, terms_accepted_at
         )
         values (
           $1, 'verified', '{"identity":true,"age":true,"consent_records":true}',
           now(), now(), 'Provider sandbox KYC verified',
           now(), now(), now(), now()
         )
         on conflict (user_id) do update set status = 'verified', reviewed_at = coalesce(app.creator_verifications.reviewed_at, now())`,
        [viewer.id],
      );
    }

    const row = await q.one<{
      creator_id: string;
      residence_country: string;
      entity_type: "individual" | "company";
      provider: "stripe_connect_sandbox" | "global_payouts_sandbox";
      provider_account_ref: string;
      bank_name: string;
      masked_account: string;
      currency: string;
      kyc_verified: boolean;
      payouts_enabled: boolean;
      auto_payout_enabled: boolean;
      auto_payout_schedule: "manual" | "weekly";
      security_hold_until: Date | null;
    }>(
      `insert into app.creator_payout_accounts (
         creator_id, residence_country, entity_type, provider, provider_account_ref,
         bank_name, masked_account, currency, kyc_verified, payouts_enabled,
         auto_payout_enabled, auto_payout_schedule
       )
       values ($1, $2, $3, 'stripe_connect_sandbox', $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (creator_id) do update
         set residence_country = excluded.residence_country,
             entity_type = excluded.entity_type,
             provider_account_ref = excluded.provider_account_ref,
             bank_name = excluded.bank_name,
             masked_account = excluded.masked_account,
             currency = excluded.currency,
             kyc_verified = excluded.kyc_verified,
             payouts_enabled = excluded.payouts_enabled,
             auto_payout_enabled = excluded.auto_payout_enabled,
             auto_payout_schedule = excluded.auto_payout_schedule,
             updated_at = now()
       returning *`,
      [
        viewer.id,
        countryCode,
        entityType,
        providerAccountRef,
        bankName,
        maskedAccount,
        currency,
        kycVerified,
        payoutsEnabled,
        autoPayoutEnabled,
        autoPayoutSchedule,
      ],
    );

    await audit(q, {
      actorId: viewer.id,
      action: "creator.payout_account_onboarded",
      targetType: "creator_payout_account",
      targetId: viewer.id,
      metadata: {
        residenceCountry: countryCode,
        entityType,
        currency,
        maskedAccount,
        providerAccountRef,
      },
    });

    return {
      creatorId: row!.creator_id,
      residenceCountry: row!.residence_country,
      entityType: row!.entity_type,
      provider: row!.provider,
      providerAccountRef: row!.provider_account_ref,
      bankName: row!.bank_name,
      maskedAccount: row!.masked_account,
      currency: row!.currency,
      kycVerified: row!.kyc_verified,
      payoutsEnabled: row!.payouts_enabled,
      autoPayoutEnabled: row!.auto_payout_enabled,
      autoPayoutSchedule: row!.auto_payout_schedule,
      securityHoldUntil: row!.security_hold_until?.toISOString() ?? null,
    };
  });
}

/**
 * Updates a creator's bank payout destination.
 * Requires explicit reauthentication (password verification or AAL2 session),
 * records an immutable audit log, sets a 24-hour security hold, and notifies the creator.
 */
export async function updateCreatorBankDestination(
  viewer: Viewer,
  input: {
    password?: string;
    bankName: string;
    accountLast4: string;
    currency?: string;
    autoPayoutEnabled?: boolean;
    autoPayoutSchedule?: "manual" | "weekly";
  },
): Promise<CreatorPayoutAccountView> {
  assertActiveCreator(viewer);

  // Reauthentication check: require valid password (or active AAL2 step-up if password omitted and aal >= 2)
  const cred = await system((q) =>
    q.one<{ password_hash: string }>(`select password_hash from app.users where id = $1`, [viewer.id]),
  );
  if (!cred) throw new AppError("forbidden", "User credentials not found.");

  if (!input.password || input.password.trim().length === 0) {
    throw new AppError("forbidden", "Reauthentication (your account password) is required to change your bank payout destination.");
  }
  const ok = await verifyPassword(input.password, cred.password_hash);
  if (!ok) {
    throw new AppError("forbidden", "Incorrect password. Bank payout destination was not changed.");
  }

  const maskedAccount = validateMaskedLast4(input.accountLast4, input.bankName);
  const bankName = input.bankName.trim();

  const updated = await system(async (q) => {
    const existing = await q.one<{
      residence_country: string;
      entity_type: "individual" | "company";
      currency: string;
      masked_account: string;
      auto_payout_enabled: boolean;
      auto_payout_schedule: "manual" | "weekly";
    }>(`select * from app.creator_payout_accounts where creator_id = $1 for update`, [viewer.id]);

    if (!existing) {
      throw new AppError("not_found", "Complete creator payout onboarding before updating your bank destination.");
    }

    const nextCurrency = input.currency ? input.currency.trim().toUpperCase() : existing.currency;
    const evalResult = await evaluateCreatorCountryEligibility(existing.residence_country, existing.entity_type);
    if (evalResult.capability && !evalResult.capability.supportedCurrencies.includes(nextCurrency)) {
      throw new AppError(
        "validation",
        `Currency ${nextCurrency} is not supported for ${evalResult.capability.countryName}.`,
      );
    }

    const nextAuto = input.autoPayoutEnabled ?? existing.auto_payout_enabled;
    const nextSched = nextAuto ? (input.autoPayoutSchedule ?? existing.auto_payout_schedule ?? "weekly") : "manual";

    const row = await q.one<{
      creator_id: string;
      residence_country: string;
      entity_type: "individual" | "company";
      provider: "stripe_connect_sandbox" | "global_payouts_sandbox";
      provider_account_ref: string;
      bank_name: string;
      masked_account: string;
      currency: string;
      kyc_verified: boolean;
      payouts_enabled: boolean;
      auto_payout_enabled: boolean;
      auto_payout_schedule: "manual" | "weekly";
      security_hold_until: Date | null;
    }>(
      `update app.creator_payout_accounts
          set bank_name = $2,
              masked_account = $3,
              currency = $4,
              auto_payout_enabled = $5,
              auto_payout_schedule = $6,
              security_hold_until = now() + interval '24 hours',
              updated_at = now()
        where creator_id = $1
        returning *`,
      [viewer.id, bankName, maskedAccount, nextCurrency, nextAuto, nextSched],
    );

    await audit(q, {
      actorId: viewer.id,
      action: "creator.bank_destination_updated",
      targetType: "creator_payout_account",
      targetId: viewer.id,
      metadata: {
        previousMaskedAccount: existing.masked_account,
        newMaskedAccount: maskedAccount,
        bankName,
        currency: nextCurrency,
        reauthenticated: true,
      },
    });

    return row!;
  });

  // Notify the creator of the sensitive bank destination change
  await deliverNotification({
    userId: viewer.id,
    kind: "system",
    creatorId: viewer.id,
    data: {
      title: `Your payout bank destination was updated to ${bankName} (${maskedAccount})`,
      href: "/studio/earnings",
    },
  });

  return {
    creatorId: updated.creator_id,
    residenceCountry: updated.residence_country,
    entityType: updated.entity_type,
    provider: updated.provider,
    providerAccountRef: updated.provider_account_ref,
    bankName: updated.bank_name,
    maskedAccount: updated.masked_account,
    currency: updated.currency,
    kycVerified: updated.kyc_verified,
    payoutsEnabled: updated.payouts_enabled,
    autoPayoutEnabled: updated.auto_payout_enabled,
    autoPayoutSchedule: updated.auto_payout_schedule,
    securityHoldUntil: updated.security_hold_until?.toISOString() ?? null,
  };
}

// ----------------------------------------------------------------------------
// 4. Concurrency-Safe Creator Withdrawals & Payout Webhook Reconciliation
// ----------------------------------------------------------------------------

function gateWithdrawals(testing?: boolean) {
  if (testing && process.env.NODE_ENV !== "production") return;
  requireFeature("payments");
}

/**
 * Initiates a creator withdrawal from settled, unreserved content and referral earnings.
 *
 * Safety & Concurrency Guarantees:
 *   - Acquires a transaction-scoped advisory lock (`pg_advisory_xact_lock`) AND row lock (`FOR UPDATE`)
 *     on the creator's payout account so concurrent requests can NEVER overspend available balance.
 *   - Enforces the configurable minimum withdrawal ($50.00 USD = 5000 cents default).
 *   - Separates transfer to the connected account (`transferRef`) from actual bank settlement (`bankPayoutRef`).
 *   - NEVER marks a withdrawal `'paid'` based only on the initial request; status starts as `'processing'`
 *     and transitions to `'paid'` or `'failed'` only upon verified settlement webhook (`applyCreatorPayoutWebhook`).
 */
export async function requestCreatorWithdrawal(
  viewer: Viewer,
  input: {
    amountCents: number;
    currency?: string;
    idempotencyKey: string;
  },
  opts: {
    testing?: boolean;
    holdDays?: number;
    minimumWithdrawalCents?: number;
    bypassSecurityHold?: boolean;
    asOf?: Date;
  } = {},
): Promise<CreatorWithdrawalRecord> {
  assertActiveCreator(viewer);
  gateWithdrawals(opts.testing);

  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new AppError("validation", "Withdrawal amount must be a positive integer in minor units.");
  }
  const idempotencyKey = input.idempotencyKey.trim();
  if (idempotencyKey.length < 4 || idempotencyKey.length > 128) {
    throw new AppError("validation", "A valid idempotencyKey is required for withdrawal requests.");
  }

  const cfg = await getPlatformFinancialConfig();
  const minWithdrawal = opts.minimumWithdrawalCents ?? cfg.defaultMinWithdrawalCents;
  const holdDays = opts.holdDays ?? cfg.settlementHoldDays;

  if (input.amountCents < minWithdrawal) {
    throw new AppError(
      "validation",
      `Withdrawal amount ($${(input.amountCents / 100).toFixed(2)}) is below the minimum withdrawal threshold of $${(minWithdrawal / 100).toFixed(2)}.`,
    );
  }

  return system(async (q) => {
    // 1. Serialize all withdrawal operations for this creator within this transaction
    await q.query(`select pg_advisory_xact_lock(hashtext('withdrawal:' || $1::text))`, [viewer.id]);

    // 2. Check idempotency key first
    const existingPayout = await q.one<{
      id: string;
      creator_id: string;
      amount_cents: string;
      fee_cents: string;
      net_amount_cents: string;
      currency: string;
      status: CreatorWithdrawalRecord["status"];
      masked_destination: string | null;
      transfer_ref: string | null;
      bank_payout_ref: string | null;
      failure_reason: string | null;
      estimated_arrival_at: Date | null;
      created_at: Date;
      processed_at: Date | null;
    }>(`select * from app.payouts where idempotency_key = $1`, [idempotencyKey]);

    if (existingPayout) {
      if (
        existingPayout.creator_id !== viewer.id ||
        Number(existingPayout.amount_cents) !== input.amountCents
      ) {
        throw new AppError("conflict", "Withdrawal idempotency key was reused with different parameters.");
      }
      return {
        id: existingPayout.id,
        creatorId: existingPayout.creator_id,
        amountCents: Number(existingPayout.amount_cents),
        feeCents: Number(existingPayout.fee_cents),
        netAmountCents: Number(existingPayout.net_amount_cents),
        currency: existingPayout.currency,
        status: existingPayout.status,
        maskedDestination: existingPayout.masked_destination,
        transferRef: existingPayout.transfer_ref,
        bankPayoutRef: existingPayout.bank_payout_ref,
        failureReason: existingPayout.failure_reason,
        estimatedArrivalAt: existingPayout.estimated_arrival_at?.toISOString() ?? null,
        createdAt: existingPayout.created_at.toISOString(),
        processedAt: existingPayout.processed_at?.toISOString() ?? null,
      };
    }

    // 3. Verify payout account readiness & country eligibility
    const acct = await q.one<{
      creator_id: string;
      residence_country: string;
      entity_type: "individual" | "company";
      provider_account_ref: string;
      bank_name: string;
      masked_account: string;
      currency: string;
      kyc_verified: boolean;
      payouts_enabled: boolean;
      security_hold_until: Date | null;
    }>(`select * from app.creator_payout_accounts where creator_id = $1 for update`, [viewer.id]);

    if (!acct || !acct.kyc_verified || !acct.payouts_enabled) {
      throw new AppError("validation", "You must complete identity and bank onboarding before requesting a withdrawal.");
    }

    if (!opts.bypassSecurityHold && acct.security_hold_until && acct.security_hold_until > new Date()) {
      throw new AppError(
        "validation",
        "Withdrawals are temporarily held for 24 hours following a recent bank destination change.",
      );
    }

    const currency = (input.currency ?? "USD").trim().toUpperCase();

    // 4. Compute matured, unreserved content and referral balances inside the lock
    const balRow = await q.one<{
      content_total: string;
      content_matured: string;
      content_hold: string;
      referral_total: string;
      referral_matured: string;
      referral_hold: string;
    }>(
      `select
         coalesce(sum(amount_cents) filter (where account = 'creator:' || $1::text), 0) as content_total,
         coalesce(sum(amount_cents) filter (
           where account = 'creator:' || $1::text
             and (amount_cents < 0 or payment_id is null or created_at <= coalesce($4::timestamptz, now()) - make_interval(days => $3::int))
         ), 0) as content_matured,
         coalesce(sum(amount_cents) filter (where account = 'creator_hold:' || $1::text), 0) as content_hold,
         coalesce(sum(amount_cents) filter (where account = 'referral:' || $1::text), 0) as referral_total,
         coalesce(sum(amount_cents) filter (
           where account = 'referral:' || $1::text
             and (amount_cents < 0 or payment_id is null or created_at <= coalesce($4::timestamptz, now()) - make_interval(days => $3::int))
         ), 0) as referral_matured,
         coalesce(sum(amount_cents) filter (where account = 'referral_hold:' || $1::text), 0) as referral_hold
       from app.ledger_entries
       where currency = $2
         and account in (
           'creator:' || $1::text,
           'creator_hold:' || $1::text,
           'referral:' || $1::text,
           'referral_hold:' || $1::text
         )`,
      [viewer.id, currency, holdDays, opts.asOf ?? null],
    );

    const contentAvailable = Math.max(
      0,
      Math.min(Number(balRow?.content_total ?? 0), Number(balRow?.content_matured ?? 0)),
    );
    const referralAvailable = Math.max(
      0,
      Math.min(Number(balRow?.referral_total ?? 0), Number(balRow?.referral_matured ?? 0)),
    );
    const totalHold = Number(balRow?.content_hold ?? 0) + Number(balRow?.referral_hold ?? 0);

    if (totalHold > 0) {
      throw new AppError("validation", "Withdrawals are paused while an open payment dispute hold is active.");
    }

    const totalMaturedAvailable = contentAvailable + referralAvailable;
    if (input.amountCents > totalMaturedAvailable) {
      throw new AppError(
        "validation",
        `Insufficient settled available balance ($${(totalMaturedAvailable / 100).toFixed(2)} available, $${(input.amountCents / 100).toFixed(2)} requested).`,
      );
    }

    // 5. Split the withdrawal debit across creator:<id> (first) and referral:<id> (remainder)
    const fromContent = Math.min(contentAvailable, input.amountCents);
    const fromReferral = input.amountCents - fromContent;

    const txnId = randomUUID();
    if (fromContent > 0) {
      await q.query(
        `insert into app.ledger_entries (txn_id, account, amount_cents, currency, memo)
         values ($1, $2, $3, $4, 'creator withdrawal initiated')`,
        [txnId, `creator:${viewer.id}`, -fromContent, currency],
      );
    }
    if (fromReferral > 0) {
      await q.query(
        `insert into app.ledger_entries (txn_id, account, amount_cents, currency, memo)
         values ($1, $2, $3, $4, 'referral withdrawal initiated')`,
        [txnId, `referral:${viewer.id}`, -fromReferral, currency],
      );
    }
    await q.query(
      `insert into app.ledger_entries (txn_id, account, amount_cents, currency, memo)
       values ($1, 'payout_clearing', $2, $3, 'withdrawal in transit to bank')`,
      [txnId, input.amountCents, currency],
    );

    const transferRef = `tr_sandbox_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const maskedDestination = `${acct.bank_name} (${acct.masked_account})`;

    // Status is 'processing' (transfer initiated to connected account, awaiting bank settlement webhook 'payout.paid').
    // Never mark 'paid' on the initial API call!
    const payout = await q.one<{
      id: string;
      creator_id: string;
      amount_cents: string;
      fee_cents: string;
      net_amount_cents: string;
      currency: string;
      status: CreatorWithdrawalRecord["status"];
      masked_destination: string | null;
      transfer_ref: string | null;
      bank_payout_ref: string | null;
      failure_reason: string | null;
      estimated_arrival_at: Date | null;
      created_at: Date;
      processed_at: Date | null;
    }>(
      `insert into app.payouts (
         creator_id, amount_cents, fee_cents, net_amount_cents, currency,
         status, payout_account_ref, masked_destination,
         transfer_ref, bank_payout_ref, idempotency_key,
         estimated_arrival_at, ledger_txn_id
       )
       values (
         $1, $2, 0, $2, $3,
         'processing', $4, $5,
         $6, null, $7,
         now() + interval '2 days', $8
       )
       returning *`,
      [
        viewer.id,
        input.amountCents,
        currency,
        acct.provider_account_ref,
        maskedDestination,
        transferRef,
        idempotencyKey,
        txnId,
      ],
    );

    await audit(q, {
      actorId: viewer.id,
      action: "payout.requested",
      targetType: "payout",
      targetId: payout!.id,
      metadata: {
        amountCents: input.amountCents,
        fromContentCents: fromContent,
        fromReferralCents: fromReferral,
        currency,
        transferRef,
        maskedDestination,
      },
    });

    return {
      id: payout!.id,
      creatorId: payout!.creator_id,
      amountCents: Number(payout!.amount_cents),
      feeCents: Number(payout!.fee_cents),
      netAmountCents: Number(payout!.net_amount_cents),
      currency: payout!.currency,
      status: payout!.status,
      maskedDestination: payout!.masked_destination,
      transferRef: payout!.transfer_ref,
      bankPayoutRef: payout!.bank_payout_ref,
      failureReason: payout!.failure_reason,
      estimatedArrivalAt: payout!.estimated_arrival_at?.toISOString() ?? null,
      createdAt: payout!.created_at.toISOString(),
      processedAt: payout!.processed_at?.toISOString() ?? null,
    };
  });
}

/**
 * Reconciles a verified provider payout webhook event (`payout.paid`, `payout.failed`, `payout.canceled`).
 * Idempotent on `eventId`:
 *   - `paid`: records `bankPayoutRef`, clears `payout_clearing` to `provider_clearing`, and marks the withdrawal `paid`.
 *   - `failed` | `canceled`: reverses the exact original debits from `payout_clearing` back to `creator:<id>` / `referral:<id>`
 *     so the creator's available balance is accurately restored without duplicate payouts.
 */
export async function applyCreatorPayoutWebhook(
  input: {
    eventId: string;
    payoutId: string;
    status: "processing" | "paid" | "failed" | "canceled";
    bankPayoutRef?: string;
    failureReason?: string;
  },
  opts: { testing?: boolean } = {},
): Promise<{ outcome: "applied" | "duplicate" | "ignored"; status: CreatorWithdrawalRecord["status"] }> {
  gateWithdrawals(opts.testing);

  return system(async (q) => {
    const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const ev = await q.one<{ id: number }>(
      `insert into app.payment_events (provider, event_id, type, payload_sha256)
       values ('payout_sandbox', $1, $2, $3)
       on conflict (provider, event_id) do nothing
       returning id`,
      [input.eventId, `payout.${input.status}`, hash],
    );

    const currentPayout = await q.one<{
      id: string;
      creator_id: string;
      amount_cents: string;
      currency: string;
      status: CreatorWithdrawalRecord["status"];
      ledger_txn_id: string | null;
      reversal_txn_id: string | null;
    }>(`select * from app.payouts where id = $1 for update`, [input.payoutId]);

    if (!currentPayout) {
      throw new AppError("not_found", "Withdrawal record not found.");
    }

    if (!ev) {
      return { outcome: "duplicate", status: currentPayout.status };
    }

    // Terminal states cannot be re-transitioned
    if (
      currentPayout.status === "paid" ||
      currentPayout.status === "failed" ||
      currentPayout.status === "canceled"
    ) {
      await q.query(`update app.payment_events set outcome = 'ignored', note = 'already terminal' where id = $1`, [
        ev.id,
      ]);
      return { outcome: "ignored", status: currentPayout.status };
    }

    const amountCents = Number(currentPayout.amount_cents);

    if (input.status === "paid") {
      const bankRef = input.bankPayoutRef ?? `po_sandbox_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
      const settleTxn = randomUUID();
      await q.query(
        `insert into app.ledger_entries (txn_id, account, amount_cents, currency, memo)
         values ($1, 'payout_clearing', $2, $3, 'bank payout settled'),
                ($1, 'provider_clearing', $4, $3, 'bank payout settled')`,
        [settleTxn, -amountCents, currentPayout.currency, amountCents],
      );

      await q.query(
        `update app.payouts
            set status = 'paid',
                bank_payout_ref = $2,
                processed_at = now(),
                updated_at = now()
          where id = $1`,
        [currentPayout.id, bankRef],
      );

      await q.query(`update app.payment_events set outcome = 'applied' where id = $1`, [ev.id]);
      await audit(q, {
        actorId: null,
        action: "payout.paid",
        targetType: "payout",
        targetId: currentPayout.id,
        metadata: { bankPayoutRef: bankRef, amountCents },
      });

      return { outcome: "applied", status: "paid" };
    }

    if (input.status === "failed" || input.status === "canceled") {
      const reversalTxn = randomUUID();
      const origEntries = currentPayout.ledger_txn_id
        ? await q.query<{ account: string; amount_cents: string }>(
            `select account, amount_cents from app.ledger_entries where txn_id = $1`,
            [currentPayout.ledger_txn_id],
          )
        : [];

      if (origEntries.length > 0) {
        for (const entry of origEntries) {
          await q.query(
            `insert into app.ledger_entries (txn_id, account, amount_cents, currency, memo)
             values ($1, $2, $3, $4, $5)`,
            [
              reversalTxn,
              entry.account,
              -Number(entry.amount_cents),
              currentPayout.currency,
              `payout ${input.status} reversal: ${input.failureReason ?? "provider return"}`,
            ],
          );
        }
      } else {
        await q.query(
          `insert into app.ledger_entries (txn_id, account, amount_cents, currency, memo)
           values ($1, 'payout_clearing', $2, $3, 'payout failed reversal'),
                  ($1, $4, $5, $3, 'payout failed reversal')`,
          [reversalTxn, -amountCents, currentPayout.currency, `creator:${currentPayout.creator_id}`, amountCents],
        );
      }

      await q.query(
        `update app.payouts
            set status = $2,
                failure_reason = $3,
                reversal_txn_id = $4,
                processed_at = now(),
                updated_at = now()
          where id = $1`,
        [currentPayout.id, input.status, input.failureReason ?? "Bank rejected transfer", reversalTxn],
      );

      await q.query(`update app.payment_events set outcome = 'applied' where id = $1`, [ev.id]);
      await audit(q, {
        actorId: null,
        action: `payout.${input.status}`,
        targetType: "payout",
        targetId: currentPayout.id,
        metadata: { failureReason: input.failureReason, reversalTxnId: reversalTxn },
      });

      return { outcome: "applied", status: input.status };
    }

    await q.query(`update app.payouts set status = 'processing', updated_at = now() where id = $1`, [
      currentPayout.id,
    ]);
    await q.query(`update app.payment_events set outcome = 'applied' where id = $1`, [ev.id]);
    return { outcome: "applied", status: "processing" };
  });
}

export async function getCreatorPayoutAccount(viewer: Viewer): Promise<CreatorPayoutAccountView | null> {
  assertActiveCreator(viewer);
  return asViewer(viewer, async (q) => {
    const row = await q.one<{
      creator_id: string;
      residence_country: string;
      entity_type: "individual" | "company";
      provider: "stripe_connect_sandbox" | "global_payouts_sandbox";
      provider_account_ref: string;
      bank_name: string;
      masked_account: string;
      currency: string;
      kyc_verified: boolean;
      payouts_enabled: boolean;
      auto_payout_enabled: boolean;
      auto_payout_schedule: "manual" | "weekly";
      security_hold_until: Date | null;
    }>(`select * from app.creator_payout_accounts where creator_id = $1`, [viewer.id]);
    if (!row) return null;
    return {
      creatorId: row.creator_id,
      residenceCountry: row.residence_country,
      entityType: row.entity_type,
      provider: row.provider,
      providerAccountRef: row.provider_account_ref,
      bankName: row.bank_name,
      maskedAccount: row.masked_account,
      currency: row.currency,
      kycVerified: row.kyc_verified,
      payoutsEnabled: row.payouts_enabled,
      autoPayoutEnabled: row.auto_payout_enabled,
      autoPayoutSchedule: row.auto_payout_schedule,
      securityHoldUntil: row.security_hold_until?.toISOString() ?? null,
    };
  });
}
