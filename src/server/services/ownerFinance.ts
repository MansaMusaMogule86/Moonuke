import "server-only";
import { asViewer, system, type Q } from "@/server/db";
import { can, type Permission, type Viewer } from "@/server/auth/permissions";
import { sha256 } from "@/server/auth/crypto";
import { decryptSecret, verifyTotp } from "@/server/auth/totp";
import { AppError } from "@/server/errors";
import {
  CREATOR_CONTRACTUAL_SHARE_BPS,
  OWNER_50_PERCENT_BPS,
  PROVISIONAL_PLATFORM_FEE_BPS,
  TOTAL_OWNERSHIP_BPS,
} from "@/server/payments/policy";
import { audit } from "./audit";

export type OwnerId = "OWNER_001" | "OWNER_002";

export type DistributionStatus =
  | "DRAFT"
  | "CALCULATED"
  | "RECONCILED"
  | "AWAITING_APPROVAL"
  | "PARTIALLY_APPROVED"
  | "APPROVED"
  | "READY_FOR_PAYOUT"
  | "SIMULATED"
  | "ON_HOLD"
  | "REJECTED"
  | "FAILED"
  | "PAID";

export type ResolvedOwner = {
  id: OwnerId;
  authUserId: string;
  displayName: "Jade" | "Kael Veyre";
  status: "active" | "suspended";
  percentageBasisPoints: number;
  percentageDisplay: string;
  welcomeHeader: string;
};

export type WaterfallInput = {
  grossSettledFanCollectionsMinor: number;
  applicableTaxesMinor: number;
  transactionReversalsMinor: number;
  creatorContractualEarningsMinor?: number;
  processingAndSettlementCostsMinor: number;
  approvedOperatingExpensesMinor: number;
  reserveAllocationsMinor: number;
  availableCashMinor?: number;
  overrideCreatorShareBps?: number;
  creatorShareChangeAuthorizationRef?: string;
};

export type WaterfallResult = {
  grossSettledFanCollectionsMinor: number;
  applicableTaxesMinor: number;
  transactionReversalsMinor: number;
  netSettledCollectionsMinor: number;
  creatorContractualEarningsMinor: number;
  platformRevenueBeforeCostsMinor: number;
  processingAndSettlementCostsMinor: number;
  approvedOperatingExpensesMinor: number;
  reserveAllocationsMinor: number;
  roundingCarryReserveMinor: number;
  totalDeductionsMinor: number;
  netDistributableEarningsMinor: number;
  jadeAllocationMinor: number;
  kaelAllocationMinor: number;
  provisionalPlatformFeeBps: number;
  creatorContractualShareBps: number;
  reconciliationExceptions: string[];
};

export type DestinationType =
  | "bank_account"
  | "settlement_wallet"
  | "custodial_account"
  | "wire_beneficiary";

export type PayoutDestinationRecord = {
  id: string;
  ownerId: OwnerId;
  accountCode: "Account A" | "Account B";
  provider: string;
  providerAccountReference: string;
  maskedAccountLabel: string;
  destinationType: DestinationType;
  currency: string;
  verificationStatus: "pending" | "verified" | "suspended" | "rejected";
  status: "active" | "archived" | "disabled";
  updatedAt: Date;
};

export type DistributionPeriodRecord = {
  id: string;
  periodStart: Date;
  periodEnd: Date;
  currency: string;
  grossFanCollectionsMinor: number;
  taxesMinor: number;
  reversalsMinor: number;
  creatorLiabilitiesMinor: number;
  platformRevenueMinor: number;
  processingCostsMinor: number;
  operatingExpensesMinor: number;
  reservesMinor: number;
  roundingCarryMinor: number;
  deductionsMinor: number;
  distributableAmountMinor: number;
  reconciliationExceptionsCount: number;
  calculationVersion: number;
  status: DistributionStatus;
  notes: string | null;
  finalizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  myAllocationMinor: number;
  myAllocationStatus: string;
  allocations: {
    id: string;
    ownerId: OwnerId;
    displayName: string;
    percentageSnapshotBasisPoints: number;
    allocatedAmountMinor: number;
    status: string;
  }[];
  approvals: {
    id: string;
    ownerId: OwnerId;
    displayName: string;
    authenticatedActorId: string;
    calculationVersion: number;
    decision: "APPROVED" | "REJECTED";
    note: string | null;
    approvedAt: Date;
  }[];
};

export type OwnerPayoutRecord = {
  id: string;
  ownerId: OwnerId;
  distributionAllocationId: string;
  payoutDestinationId: string;
  accountCode: string;
  maskedAccountLabel: string;
  amountMinor: number;
  currency: string;
  status: "READY_FOR_PAYOUT" | "SIMULATED" | "ON_HOLD" | "FAILED" | "PAID";
  providerReference: string | null;
  idempotencyKey: string;
  failureReason: string | null;
  statementJson: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

const FORBIDDEN_RAW_CREDENTIALS = [
  /\b(?:\d[ -]*?){12,19}\b/, // Raw card PAN / account number
  /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/, // Raw IBAN
  /\b0x[a-fA-F0-9]{64}\b/, // Raw hex private key
  /\bnsec1[a-z0-9]{20,}\b/i, // Raw nostr/bech32 private key
  /\b(?:seed[ _-]?phrase|private[ _-]?key|mnemonic|secret[ _-]?key)\b/i,
];

function assertSafeIntegerMinor(value: number, fieldName: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new AppError(
      "validation",
      `${fieldName} must be a non-negative integer in minor currency units (no floating-point values).`,
      fieldName,
    );
  }
}

function assertNoRawCredentials(value: string, fieldName: string) {
  for (const pattern of FORBIDDEN_RAW_CREDENTIALS) {
    if (pattern.test(value)) {
      throw new AppError(
        "validation",
        `Raw banking credentials, full IBAN/card numbers, or wallet private keys are not permitted in ${fieldName}. Use a provider reference and masked label only.`,
        fieldName,
      );
    }
  }
}

function normalizeDestinationType(raw?: string): DestinationType {
  if (
    raw === "bank_account" ||
    raw === "settlement_wallet" ||
    raw === "custodial_account" ||
    raw === "wire_beneficiary"
  ) {
    return raw;
  }
  if (raw === "wallet") return "settlement_wallet";
  return "custodial_account";
}

type ExpenseCategory =
  | "processing_fee"
  | "settlement_cost"
  | "tax"
  | "infrastructure"
  | "compliance"
  | "legal"
  | "other";

function normalizeExpenseCategory(raw: string): ExpenseCategory {
  const norm = raw.trim().toLowerCase().replace(/\s+/g, "_");
  const allowed: ExpenseCategory[] = [
    "processing_fee",
    "settlement_cost",
    "tax",
    "infrastructure",
    "compliance",
    "legal",
    "other",
  ];
  if (allowed.includes(norm as ExpenseCategory)) return norm as ExpenseCategory;
  if (norm.includes("host") || norm.includes("infra") || norm.includes("cloud")) return "infrastructure";
  if (norm.includes("comp")) return "compliance";
  if (norm.includes("leg")) return "legal";
  if (norm.includes("tax")) return "tax";
  if (norm.includes("proc")) return "processing_fee";
  if (norm.includes("settle")) return "settlement_cost";
  return "other";
}

export async function logFinancialAudit(
  q: Q,
  input: {
    actorId: string | null;
    ownerId?: OwnerId | null;
    eventType: string;
    resourceType: string;
    resourceId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const cleanEventType = input.eventType.toLowerCase().replace(/[^a-z0-9_.]/g, "_");
  const resourceId = (input.resourceId ?? "platform").slice(0, 120);
  await q.query(
    `insert into app.financial_audit_events (actor_id, owner_id, event_type, resource_type, resource_id, metadata)
     values ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      input.actorId,
      input.ownerId ?? null,
      cleanEventType,
      input.resourceType,
      resourceId,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  await audit(q, {
    actorId: input.actorId,
    action: `finance.${cleanEventType.replace(/\./g, "_")}`,
    targetType: input.resourceType,
    targetId: resourceId,
    metadata: { ownerId: input.ownerId ?? null, ...(input.metadata ?? {}) },
  });
}

/**
 * Verifies a live second-factor code (TOTP or single-use recovery code) for
 * high-assurance owner actions: distribution approvals/rejections and payout
 * destination changes.
 */
export async function verifyOwnerMfaStepUp(viewer: Viewer, rawCode: string): Promise<void> {
  if (viewer.role !== "owner" || viewer.status !== "active" || viewer.aal !== 2) {
    throw new AppError("forbidden", "Owner session with verified MFA (AAL2) is required.");
  }
  const clean = (rawCode ?? "").trim().replace(/\s+/g, "");
  if (clean.length < 6) {
    throw new AppError(
      "validation",
      "Enter a current 6-digit authenticator code (or recovery code) to confirm this financial action.",
      "mfaCode",
    );
  }

  await system(async (q) => {
    const f = await q.one<{ secret_enc: string; last_used_step: string | null }>(
      `select secret_enc, last_used_step from app.mfa_factors where user_id = $1 and confirmed_at is not null for update`,
      [viewer.id],
    );
    if (!f) {
      throw new AppError("forbidden", "Two-step authentication is not enrolled on this owner account.");
    }
    const lastStep = f.last_used_step === null ? null : Number(f.last_used_step);
    const step = verifyTotp(decryptSecret(f.secret_enc), clean, lastStep);
    if (step !== null) {
      await q.query(`update app.mfa_factors set last_used_step = $2 where user_id = $1`, [viewer.id, step]);
      return;
    }
    // Check single-use recovery code fallback
    const norm = clean.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const formatted = norm.length === 10 ? `${norm.slice(0, 5)}-${norm.slice(5)}` : clean.toUpperCase();
    const used = await q.one<{ id: string }>(
      `update app.mfa_recovery_codes set used_at = now() where user_id = $1 and code_hash = $2 and used_at is null returning id`,
      [viewer.id, sha256(formatted)],
    );
    if (!used) {
      throw new AppError(
        "validation",
        "That authenticator code didn't work or was already used. Wait for the next code and try again.",
        "mfaCode",
      );
    }
  });
}

/**
 * Resolves the authenticated platform owner strictly from viewer.id on the server.
 * Never trusts or uses a user-supplied ownerId to scope data. If a caller supplies
 * an ownerId that does not match the authenticated owner's record, it is rejected
 * with 403 Forbidden.
 */
export async function resolveAuthenticatedOwner(
  viewer: Viewer | null | undefined,
  userSuppliedOwnerId?: string | null,
  requiredPermission: Permission = "owner.dashboard.view",
): Promise<ResolvedOwner> {
  if (!viewer || !can(viewer, requiredPermission)) {
    throw new AppError("forbidden", "Owner permissions and a verified second factor (AAL2) are required.");
  }

  return asViewer(viewer, async (q) => {
    const row = await q.one<{
      id: OwnerId;
      auth_user_id: string;
      display_name: "Jade" | "Kael Veyre";
      status: "active" | "suspended";
      percentage_basis_points: number;
    }>(
      `select po.id,
              po.auth_user_id,
              po.display_name,
              po.status,
              oa.percentage_basis_points
         from app.platform_owners po
         join app.ownership_allocations oa
           on oa.owner_id = po.id
          and oa.effective_to is null
        where po.auth_user_id = $1
          and po.status = 'active'`,
      [viewer.id],
    );

    if (!row) {
      throw new AppError("forbidden", "This account is not enrolled in the active platform ownership registry.");
    }

    if (userSuppliedOwnerId !== undefined && userSuppliedOwnerId !== null && userSuppliedOwnerId !== row.id) {
      throw new AppError(
        "forbidden",
        "Cross-owner access is forbidden: financial records are strictly scoped to the authenticated owner.",
      );
    }

    const pct = Number(row.percentage_basis_points);
    return {
      id: row.id,
      authUserId: row.auth_user_id,
      displayName: row.display_name,
      status: row.status,
      percentageBasisPoints: pct,
      percentageDisplay: `${pct / 100}%`,
      welcomeHeader: `Welcome back, ${row.display_name}.`,
    };
  });
}

/**
 * Verifies the internal ownership registry invariants (Section 1 & Section 5):
 * - Exactly 2 active owners (OWNER_001 = Jade, OWNER_002 = Kael Veyre)
 * - Active allocations total exactly 10000 basis points (100%)
 * - Each owner holds 5000 basis points (50%)
 */
export async function verifyOwnershipRegistry(viewer: Viewer) {
  await resolveAuthenticatedOwner(viewer, null, "owner.dashboard.view");
  return asViewer(viewer, async (q) => {
    const rows = await q.query<{
      id: OwnerId;
      display_name: string;
      status: string;
      percentage_basis_points: number;
      approval_reference: string;
      effective_from: Date;
    }>(
      `select po.id,
              po.display_name,
              po.status,
              oa.percentage_basis_points,
              oa.approval_reference,
              oa.effective_from
         from app.platform_owners po
         join app.ownership_allocations oa
           on oa.owner_id = po.id
          and oa.effective_to is null
        where po.status = 'active'
        order by po.id asc`,
    );

    const totalBasisPoints = rows.reduce((acc, r) => acc + Number(r.percentage_basis_points), 0);
    if (rows.length !== 2 || totalBasisPoints !== TOTAL_OWNERSHIP_BPS) {
      throw new AppError(
        "conflict",
        `Ownership registry invariant violation: expected 2 active owners totaling 10000 bps, found ${rows.length} totaling ${totalBasisPoints} bps.`,
      );
    }

    return {
      activeOwnerCount: rows.length,
      totalBasisPoints,
      owners: rows.map((r) => ({
        ownerId: r.id,
        displayName: r.display_name,
        status: r.status,
        percentageBasisPoints: Number(r.percentage_basis_points),
        percentageDisplay: `${Number(r.percentage_basis_points) / 100}%`,
        approvalReference: r.approval_reference,
        effectiveFrom: r.effective_from,
      })),
    };
  });
}

/**
 * Pure deterministic integer minor-unit financial waterfall calculation (Section 6).
 */
export function calculateWaterfallPure(input: WaterfallInput): WaterfallResult {
  assertSafeIntegerMinor(input.grossSettledFanCollectionsMinor, "grossSettledFanCollectionsMinor");
  assertSafeIntegerMinor(input.applicableTaxesMinor, "applicableTaxesMinor");
  assertSafeIntegerMinor(input.transactionReversalsMinor, "transactionReversalsMinor");
  assertSafeIntegerMinor(input.processingAndSettlementCostsMinor, "processingAndSettlementCostsMinor");
  assertSafeIntegerMinor(input.approvedOperatingExpensesMinor, "approvedOperatingExpensesMinor");
  assertSafeIntegerMinor(input.reserveAllocationsMinor, "reserveAllocationsMinor");

  if (input.creatorContractualEarningsMinor !== undefined) {
    assertSafeIntegerMinor(input.creatorContractualEarningsMinor, "creatorContractualEarningsMinor");
  }
  if (input.availableCashMinor !== undefined) {
    assertSafeIntegerMinor(input.availableCashMinor, "availableCashMinor");
  }

  if (
    input.overrideCreatorShareBps !== undefined &&
    input.overrideCreatorShareBps !== CREATOR_CONTRACTUAL_SHARE_BPS &&
    !input.creatorShareChangeAuthorizationRef?.trim()
  ) {
    throw new AppError(
      "forbidden",
      "Creator contractual revenue share cannot be modified without an explicit authorization reference.",
    );
  }

  const creatorShareBps = input.overrideCreatorShareBps ?? CREATOR_CONTRACTUAL_SHARE_BPS;
  const platformFeeBps = TOTAL_OWNERSHIP_BPS - creatorShareBps;

  const grossBig = BigInt(input.grossSettledFanCollectionsMinor);
  const taxesBig = BigInt(input.applicableTaxesMinor);
  const reversalsBig = BigInt(input.transactionReversalsMinor);

  const exceptions: string[] = [];
  const rawNetCollectionsBig = grossBig - taxesBig - reversalsBig;
  const netSettledCollectionsBig = rawNetCollectionsBig > 0n ? rawNetCollectionsBig : 0n;
  if (rawNetCollectionsBig < 0n) {
    exceptions.push("Taxes and reversals exceed gross settled collections for the period.");
  }

  // Default creator contractual earnings to 85% (8500 bps) of net settled collections
  // using deterministic ceiling protection for creator liabilities so creator share is never under-allocated.
  const defaultCreatorEarningsBig =
    (netSettledCollectionsBig * BigInt(creatorShareBps) + 9999n) / BigInt(TOTAL_OWNERSHIP_BPS);

  const creatorEarningsBig =
    input.creatorContractualEarningsMinor !== undefined
      ? BigInt(input.creatorContractualEarningsMinor)
      : defaultCreatorEarningsBig;

  if (
    input.creatorContractualEarningsMinor !== undefined &&
    creatorEarningsBig < defaultCreatorEarningsBig &&
    !input.creatorShareChangeAuthorizationRef?.trim()
  ) {
    throw new AppError(
      "forbidden",
      "Creator liabilities cannot be reduced or distributed to platform owners.",
    );
  }

  const rawPlatformRevenueBig = netSettledCollectionsBig - creatorEarningsBig;
  if (rawPlatformRevenueBig < 0n) {
    exceptions.push("Creator contractual liabilities exceed net settled fan collections.");
  }
  const platformRevenueBeforeCostsBig = rawPlatformRevenueBig > 0n ? rawPlatformRevenueBig : 0n;

  const processingBig = BigInt(input.processingAndSettlementCostsMinor);
  const expensesBig = BigInt(input.approvedOperatingExpensesMinor);
  const reservesBig = BigInt(input.reserveAllocationsMinor);

  const preSplitDeductionsBig = processingBig + expensesBig + reservesBig;
  const rawEarningsAfterDeductionsBig =
    platformRevenueBeforeCostsBig > preSplitDeductionsBig
      ? platformRevenueBeforeCostsBig - preSplitDeductionsBig
      : 0n;

  let cashConstrainedBig = rawEarningsAfterDeductionsBig;
  if (input.availableCashMinor !== undefined) {
    const availAfterCreatorBig = BigInt(input.availableCashMinor) - creatorEarningsBig;
    const maxDistributableCashBig = availAfterCreatorBig > 0n ? availAfterCreatorBig : 0n;
    if (maxDistributableCashBig < cashConstrainedBig) {
      exceptions.push("Available cash after covering creator liabilities is less than calculated net earnings.");
      cashConstrainedBig = maxDistributableCashBig;
    }
  }

  // Deterministic rounding: hold any odd 1-minor-unit remainder in platform reserve carry-forward
  const roundingCarryBig = cashConstrainedBig % 2n;
  const distributableBig = cashConstrainedBig - roundingCarryBig;

  const jadeBig = (distributableBig * BigInt(OWNER_50_PERCENT_BPS)) / BigInt(TOTAL_OWNERSHIP_BPS);
  const kaelBig = (distributableBig * BigInt(OWNER_50_PERCENT_BPS)) / BigInt(TOTAL_OWNERSHIP_BPS);
  const totalDeductionsBig = preSplitDeductionsBig + roundingCarryBig;

  return {
    grossSettledFanCollectionsMinor: Number(grossBig),
    applicableTaxesMinor: Number(taxesBig),
    transactionReversalsMinor: Number(reversalsBig),
    netSettledCollectionsMinor: Number(netSettledCollectionsBig),
    creatorContractualEarningsMinor: Number(creatorEarningsBig),
    platformRevenueBeforeCostsMinor: Number(platformRevenueBeforeCostsBig),
    processingAndSettlementCostsMinor: Number(processingBig),
    approvedOperatingExpensesMinor: Number(expensesBig),
    reserveAllocationsMinor: Number(reservesBig),
    roundingCarryReserveMinor: Number(roundingCarryBig),
    totalDeductionsMinor: Number(totalDeductionsBig),
    netDistributableEarningsMinor: Number(distributableBig),
    jadeAllocationMinor: Number(jadeBig),
    kaelAllocationMinor: Number(kaelBig),
    provisionalPlatformFeeBps: platformFeeBps,
    creatorContractualShareBps: creatorShareBps,
    reconciliationExceptions: exceptions,
  };
}

/**
 * Aggregates real ledger & payment activity from the database for a given period and currency.
 */
async function aggregateRealDatabaseActivity(
  q: Q,
  periodStart: Date,
  periodEnd: Date,
  currency: string,
) {
  const normCurrency = currency.trim().toUpperCase();

  // 1. Settled fan payments in the window (matching currency case-insensitively)
  const paymentsAgg = await q.one<{
    gross_minor: string;
    reversals_minor: string;
  }>(
    `select coalesce(sum(amount_cents) filter (where status in ('succeeded', 'refunded', 'disputed', 'charged_back')), 0)::bigint::text as gross_minor,
            coalesce(sum(amount_cents) filter (where status in ('refunded', 'charged_back')), 0)::bigint::text as reversals_minor
       from app.payments
      where upper(currency) = $1
        and updated_at >= $2
        and updated_at < $3`,
    [normCurrency, periodStart, periodEnd],
  );

  // 2. Ledger entries for creator earnings and platform fees in the window
  const ledgerAgg = await q.one<{
    creator_net_minor: string;
    platform_fee_minor: string;
  }>(
    `select coalesce(sum(amount_cents) filter (where account like 'creator:%' or account like 'creator_hold:%'), 0)::bigint::text as creator_net_minor,
            coalesce(sum(amount_cents) filter (where account = 'platform_fees'), 0)::bigint::text as platform_fee_minor
       from app.ledger_entries
      where upper(currency) = $1
        and created_at >= $2
        and created_at < $3`,
    [normCurrency, periodStart, periodEnd],
  );

  // 3. Explicit multi-currency conversion records settled into this target currency during the window
  const fxAgg = await q.one<{ converted_minor: string }>(
    `select coalesce(sum(to_amount_minor), 0)::bigint::text as converted_minor
       from app.currency_conversion_records
      where upper(to_currency) = $1
        and created_at >= $2
        and created_at < $3`,
    [normCurrency, periodStart, periodEnd],
  );

  // 4. Approved operating expenses in the window
  const expensesAgg = await q.one<{
    processing_minor: string;
    tax_minor: string;
    operating_minor: string;
  }>(
    `select coalesce(sum(amount_minor) filter (where category in ('processing_fee', 'settlement_cost')), 0)::bigint::text as processing_minor,
            coalesce(sum(amount_minor) filter (where category = 'tax'), 0)::bigint::text as tax_minor,
            coalesce(sum(amount_minor) filter (where category not in ('processing_fee', 'settlement_cost', 'tax')), 0)::bigint::text as operating_minor
       from app.platform_operating_expenses
      where upper(currency) = $1
        and status = 'approved'
        and incurred_at >= $2
        and incurred_at < $3`,
    [normCurrency, periodStart, periodEnd],
  );

  // 5. Active reserve allocations in the window
  const reservesAgg = await q.one<{ reserves_minor: string }>(
    `select coalesce(sum(amount_minor), 0)::bigint::text as reserves_minor
       from app.platform_reserves
      where upper(currency) = $1
        and status = 'active'
        and created_at >= $2
        and created_at < $3`,
    [normCurrency, periodStart, periodEnd],
  );

  // 6. Check double-entry ledger balance exceptions and payments missing ledger entries
  const unbalancedTx = await q.one<{ n: number }>(
    `select count(*)::int as n
       from (
         select txn_id
           from app.ledger_entries
          where upper(currency) = $1
            and created_at >= $2
            and created_at < $3
          group by txn_id
         having sum(amount_cents) <> 0
       ) u`,
    [normCurrency, periodStart, periodEnd],
  );

  const unbookedPayments = await q.one<{ n: number }>(
    `select count(*)::int as n
       from app.payments p
      where upper(p.currency) = $1
        and p.status = 'succeeded'
        and p.updated_at >= $2
        and p.updated_at < $3
        and not exists (
          select 1 from app.ledger_entries le where le.payment_id = p.id
        )`,
    [normCurrency, periodStart, periodEnd],
  );

  const grossFromPayments = Number(paymentsAgg?.gross_minor ?? "0");
  const grossFromFx = Number(fxAgg?.converted_minor ?? "0");
  const grossSettledFanCollectionsMinor = grossFromPayments + grossFromFx;
  const applicableTaxesMinor = Number(expensesAgg?.tax_minor ?? "0");
  const transactionReversalsMinor = Number(paymentsAgg?.reversals_minor ?? "0");
  const processingAndSettlementCostsMinor = Number(expensesAgg?.processing_minor ?? "0");
  const approvedOperatingExpensesMinor = Number(expensesAgg?.operating_minor ?? "0");
  const reserveAllocationsMinor = Number(reservesAgg?.reserves_minor ?? "0");

  const netSettledAfterTaxAndReversals = Math.max(
    0,
    grossSettledFanCollectionsMinor - applicableTaxesMinor - transactionReversalsMinor,
  );
  const ledgerCreatorMinor = Math.max(0, Number(ledgerAgg?.creator_net_minor ?? "0"));
  const defaultCreatorMinor = Number(
    (BigInt(netSettledAfterTaxAndReversals) * BigInt(CREATOR_CONTRACTUAL_SHARE_BPS) + 9999n) /
      BigInt(TOTAL_OWNERSHIP_BPS),
  );
  const creatorContractualEarningsMinor = Math.max(ledgerCreatorMinor, defaultCreatorMinor);

  const reconciliationExceptionsCount = (unbalancedTx?.n ?? 0) + (unbookedPayments?.n ?? 0);

  return {
    grossSettledFanCollectionsMinor,
    applicableTaxesMinor,
    transactionReversalsMinor,
    creatorContractualEarningsMinor,
    processingAndSettlementCostsMinor,
    approvedOperatingExpensesMinor,
    reserveAllocationsMinor,
    reconciliationExceptionsCount,
  };
}

export async function recordOperatingExpense(
  viewer: Viewer,
  input: {
    category: string;
    description: string;
    amountMinor: number;
    currency?: string;
    incurredAt?: Date;
    periodId?: string | null;
  },
) {
  const owner = await resolveAuthenticatedOwner(viewer, null, "owner.distributions.calculate");
  assertSafeIntegerMinor(input.amountMinor, "amountMinor");
  if (input.amountMinor <= 0) {
    throw new AppError("validation", "Expense amount must be greater than 0 minor units.", "amountMinor");
  }
  const category = normalizeExpenseCategory(input.category);
  const description = input.description.trim();
  if (description.length < 2 || description.length > 200) {
    throw new AppError("validation", "Provide an expense description (2–200 characters).");
  }
  const currency = (input.currency ?? "USD").trim().toUpperCase();

  return system(async (q) => {
    const row = await q.one<{ id: string }>(
      `insert into app.platform_operating_expenses
         (period_id, category, description, amount_minor, currency, status, approved_by, incurred_at)
       values ($1, $2, $3, $4, $5, 'approved', $6, $7)
       returning id`,
      [
        input.periodId ?? null,
        category,
        description,
        input.amountMinor,
        currency,
        viewer.id,
        input.incurredAt ?? new Date(),
      ],
    );
    await logFinancialAudit(q, {
      actorId: viewer.id,
      ownerId: owner.id,
      eventType: "expense.recorded",
      resourceType: "platform_operating_expense",
      resourceId: row!.id,
      metadata: { category, amountMinor: input.amountMinor, currency },
    });
    return { id: row!.id };
  });
}

export async function recordPlatformReserve(
  viewer: Viewer,
  input: {
    reason: string;
    amountMinor: number;
    currency?: string;
    distributionPeriodId?: string | null;
  },
) {
  const owner = await resolveAuthenticatedOwner(viewer, null, "owner.distributions.calculate");
  assertSafeIntegerMinor(input.amountMinor, "amountMinor");
  if (input.amountMinor <= 0) {
    throw new AppError("validation", "Reserve amount must be greater than 0 minor units.", "amountMinor");
  }
  const reason = input.reason.trim();
  if (reason.length < 2 || reason.length > 200) {
    throw new AppError("validation", "Provide a reserve reason (2–200 characters).", "reason");
  }
  const currency = (input.currency ?? "USD").trim().toUpperCase();

  return system(async (q) => {
    const row = await q.one<{ id: string }>(
      `insert into app.platform_reserves (period_id, reason, amount_minor, currency, status)
       values ($1, $2, $3, $4, 'active')
       returning id`,
      [input.distributionPeriodId ?? null, reason, input.amountMinor, currency],
    );
    await logFinancialAudit(q, {
      actorId: viewer.id,
      ownerId: owner.id,
      eventType: "reserve.recorded",
      resourceType: "platform_reserve",
      resourceId: row!.id,
      metadata: { reason, amountMinor: input.amountMinor, currency },
    });
    return { id: row!.id };
  });
}

export async function recordCurrencyConversion(
  viewer: Viewer,
  input: {
    sourceCurrency: string;
    sourceAmountMinor: number;
    targetCurrency: string;
    rateNumerator: number;
    rateDenominator: number;
    reference: string;
  },
) {
  const owner = await resolveAuthenticatedOwner(viewer, null, "owner.distributions.calculate");
  assertSafeIntegerMinor(input.sourceAmountMinor, "sourceAmountMinor");
  assertSafeIntegerMinor(input.rateNumerator, "rateNumerator");
  assertSafeIntegerMinor(input.rateDenominator, "rateDenominator");
  if (input.sourceAmountMinor <= 0 || input.rateNumerator <= 0 || input.rateDenominator <= 0) {
    throw new AppError("validation", "Conversion amounts and rational rate components must be positive integers.");
  }
  const convertedAmountMinor = Number(
    (BigInt(input.sourceAmountMinor) * BigInt(input.rateNumerator)) / BigInt(input.rateDenominator),
  );
  const srcCurr = input.sourceCurrency.trim().toUpperCase();
  const dstCurr = input.targetCurrency.trim().toUpperCase();
  const ref = input.reference.trim();
  if (ref.length < 2 || ref.length > 120) {
    throw new AppError("validation", "Provide a conversion reconciliation reference (2–120 characters).", "reference");
  }

  return system(async (q) => {
    const row = await q.one<{ id: string }>(
      `insert into app.currency_conversion_records
         (from_currency, to_currency, from_amount_minor, to_amount_minor, rate_numerator, rate_denominator, reference)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id`,
      [
        srcCurr,
        dstCurr,
        input.sourceAmountMinor,
        convertedAmountMinor,
        input.rateNumerator,
        input.rateDenominator,
        ref,
      ],
    );
    await logFinancialAudit(q, {
      actorId: viewer.id,
      ownerId: owner.id,
      eventType: "currency_conversion.recorded",
      resourceType: "currency_conversion_record",
      resourceId: row!.id,
      metadata: {
        sourceCurrency: srcCurr,
        sourceAmountMinor: input.sourceAmountMinor,
        targetCurrency: dstCurr,
        convertedAmountMinor,
        rateNumerator: input.rateNumerator,
        rateDenominator: input.rateDenominator,
        reference: ref,
      },
    });
    return { id: row!.id, convertedAmountMinor };
  });
}

/**
 * Creates or recalculates a financial distribution period (Section 5, 6, 8).
 * Any recalculation increments `calculation_version`, invalidating prior approvals.
 */
export async function createOrCalculateDistributionPeriod(
  viewer: Viewer,
  input: {
    periodId?: string;
    periodStart: Date;
    periodEnd: Date;
    currency?: string;
    notes?: string;
    overrideWaterfall?: WaterfallInput;
  },
) {
  const owner = await resolveAuthenticatedOwner(viewer, null, "owner.distributions.calculate");
  if (!(input.periodStart instanceof Date) || !(input.periodEnd instanceof Date) || input.periodEnd <= input.periodStart) {
    throw new AppError("validation", "periodEnd must be after periodStart.");
  }
  const currency = (input.currency ?? "USD").trim().toUpperCase();

  return system(async (q) => {
    const activeAllocations = await q.query<{ owner_id: OwnerId; percentage_basis_points: number }>(
      `select oa.owner_id, oa.percentage_basis_points
         from app.ownership_allocations oa
         join app.platform_owners po on po.id = oa.owner_id
        where oa.effective_to is null and po.status = 'active'
        order by oa.owner_id asc`,
    );
    const totalBps = activeAllocations.reduce((sum, a) => sum + Number(a.percentage_basis_points), 0);
    if (activeAllocations.length !== 2 || totalBps !== TOTAL_OWNERSHIP_BPS) {
      throw new AppError("conflict", "Active ownership allocations must contain exactly 2 owners totaling 10000 basis points.");
    }

    const dbMetrics = await aggregateRealDatabaseActivity(q, input.periodStart, input.periodEnd, currency);
    const waterfallInput: WaterfallInput = input.overrideWaterfall ?? {
      grossSettledFanCollectionsMinor: dbMetrics.grossSettledFanCollectionsMinor,
      applicableTaxesMinor: dbMetrics.applicableTaxesMinor,
      transactionReversalsMinor: dbMetrics.transactionReversalsMinor,
      creatorContractualEarningsMinor: dbMetrics.creatorContractualEarningsMinor,
      processingAndSettlementCostsMinor: dbMetrics.processingAndSettlementCostsMinor,
      approvedOperatingExpensesMinor: dbMetrics.approvedOperatingExpensesMinor,
      reserveAllocationsMinor: dbMetrics.reserveAllocationsMinor,
    };

    const wf = calculateWaterfallPure(waterfallInput);
    const exceptionsCount = dbMetrics.reconciliationExceptionsCount + wf.reconciliationExceptions.length;
    const totalReservesWithRounding = wf.reserveAllocationsMinor + wf.roundingCarryReserveMinor;

    // Check if a period with this exact (period_start, period_end, currency) or periodId already exists
    const existing = input.periodId
      ? await q.one<{ id: string; status: DistributionStatus; calculation_version: number }>(
          `select id, status, calculation_version from app.financial_distribution_periods where id = $1 for update`,
          [input.periodId],
        )
      : await q.one<{ id: string; status: DistributionStatus; calculation_version: number }>(
          `select id, status, calculation_version from app.financial_distribution_periods
            where period_start = $1 and period_end = $2 and currency = $3 for update`,
          [input.periodStart, input.periodEnd, currency],
        );

    let periodId: string;
    let calculationVersion = 1;

    if (existing) {
      if (existing.status === "SIMULATED" || existing.status === "PAID") {
        throw new AppError("conflict", "Finalized or simulated distribution periods cannot be recalculated.");
      }
      periodId = existing.id;
      calculationVersion = existing.calculation_version + 1;
      await q.query(
        `update app.financial_distribution_periods
            set period_start = $2,
                period_end = $3,
                currency = $4,
                gross_collections_minor = $5,
                taxes_minor = $6,
                refunds_chargebacks_minor = $7,
                creator_liabilities_minor = $8,
                platform_revenue_minor = $9,
                processing_costs_minor = $10,
                operating_expenses_minor = $11,
                reserves_minor = $12,
                deductions_minor = $13,
                distributable_amount_minor = $14,
                reconciliation_exceptions = $15,
                calculation_version = $16,
                status = 'CALCULATED',
                updated_at = now()
          where id = $1`,
        [
          periodId,
          input.periodStart,
          input.periodEnd,
          currency,
          wf.grossSettledFanCollectionsMinor,
          wf.applicableTaxesMinor,
          wf.transactionReversalsMinor,
          wf.creatorContractualEarningsMinor,
          wf.platformRevenueBeforeCostsMinor,
          wf.processingAndSettlementCostsMinor,
          wf.approvedOperatingExpensesMinor,
          totalReservesWithRounding,
          wf.totalDeductionsMinor,
          wf.netDistributableEarningsMinor,
          exceptionsCount,
          calculationVersion,
        ],
      );
    } else {
      const inserted = await q.one<{ id: string; calculation_version: number }>(
        `insert into app.financial_distribution_periods
           (period_start, period_end, currency,
            gross_collections_minor, taxes_minor, refunds_chargebacks_minor, creator_liabilities_minor,
            platform_revenue_minor, processing_costs_minor, operating_expenses_minor, reserves_minor,
            deductions_minor, distributable_amount_minor,
            reconciliation_exceptions, calculation_version, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,1,'CALCULATED')
         returning id, calculation_version`,
        [
          input.periodStart,
          input.periodEnd,
          currency,
          wf.grossSettledFanCollectionsMinor,
          wf.applicableTaxesMinor,
          wf.transactionReversalsMinor,
          wf.creatorContractualEarningsMinor,
          wf.platformRevenueBeforeCostsMinor,
          wf.processingAndSettlementCostsMinor,
          wf.approvedOperatingExpensesMinor,
          totalReservesWithRounding,
          wf.totalDeductionsMinor,
          wf.netDistributableEarningsMinor,
          exceptionsCount,
        ],
      );
      periodId = inserted!.id;
      calculationVersion = inserted!.calculation_version;
    }

    // Upsert the two 50/50 owner_distribution_allocations rows
    for (const alloc of activeAllocations) {
      const amountMinor = alloc.owner_id === "OWNER_001" ? wf.jadeAllocationMinor : wf.kaelAllocationMinor;
      await q.query(
        `insert into app.owner_distribution_allocations
           (distribution_period_id, owner_id, percentage_snapshot_basis_points, allocated_amount_minor, status)
         values ($1, $2, $3, $4, 'PENDING')
         on conflict (distribution_period_id, owner_id) do update
           set percentage_snapshot_basis_points = excluded.percentage_snapshot_basis_points,
               allocated_amount_minor = excluded.allocated_amount_minor,
               status = 'PENDING',
               updated_at = now()`,
        [periodId, alloc.owner_id, alloc.percentage_basis_points, amountMinor],
      );
    }

    await logFinancialAudit(q, {
      actorId: viewer.id,
      ownerId: owner.id,
      eventType: "distribution.calculated",
      resourceType: "financial_distribution_period",
      resourceId: periodId,
      metadata: {
        calculationVersion,
        currency,
        platformRevenueMinor: wf.platformRevenueBeforeCostsMinor,
        deductionsMinor: wf.totalDeductionsMinor,
        distributableAmountMinor: wf.netDistributableEarningsMinor,
        jadeAllocationMinor: wf.jadeAllocationMinor,
        kaelAllocationMinor: wf.kaelAllocationMinor,
        reconciliationExceptionsCount: exceptionsCount,
        notes: input.notes ?? null,
      },
    });

    return {
      periodId,
      calculationVersion,
      status: "CALCULATED" as DistributionStatus,
      waterfall: wf,
      reconciliationExceptionsCount: exceptionsCount,
    };
  });
}

/**
 * Reconciles a CALCULATED distribution period and opens it for dual-owner approval
 * (CALCULATED -> RECONCILED -> AWAITING_APPROVAL, or ON_HOLD if reconciliation exceptions exist).
 */
export async function reconcileDistributionPeriod(viewer: Viewer, periodId: string) {
  const owner = await resolveAuthenticatedOwner(viewer, null, "owner.distributions.calculate");

  return system(async (q) => {
    const period = await q.one<{
      id: string;
      status: DistributionStatus;
      distributable_amount_minor: string;
      reconciliation_exceptions: number;
      calculation_version: number;
    }>(
      `select id, status, distributable_amount_minor::text, reconciliation_exceptions, calculation_version
         from app.financial_distribution_periods
        where id = $1 for update`,
      [periodId],
    );
    if (!period) throw new AppError("not_found", "Distribution period not found.");
    if (!["CALCULATED", "REJECTED", "ON_HOLD"].includes(period.status)) {
      throw new AppError("conflict", `Period in status ${period.status} cannot be transitioned to reconciliation.`);
    }

    const allocations = await q.query<{
      owner_id: OwnerId;
      percentage_snapshot_basis_points: number;
      allocated_amount_minor: string;
    }>(
      `select owner_id, percentage_snapshot_basis_points, allocated_amount_minor::text
         from app.owner_distribution_allocations
        where distribution_period_id = $1`,
      [periodId],
    );

    const sumAllocMinor = allocations.reduce((s, a) => s + BigInt(a.allocated_amount_minor), 0n);
    const sumBps = allocations.reduce((s, a) => s + Number(a.percentage_snapshot_basis_points), 0);
    const expectedDistributableMinor = BigInt(period.distributable_amount_minor);

    if (allocations.length !== 2 || sumBps !== TOTAL_OWNERSHIP_BPS || sumAllocMinor !== expectedDistributableMinor) {
      await q.query(
        `update app.financial_distribution_periods
            set status = 'ON_HOLD', reconciliation_exceptions = reconciliation_exceptions + 1, updated_at = now()
          where id = $1`,
        [periodId],
      );
      throw new AppError(
        "conflict",
        "Allocation sum or basis points mismatch detected during reconciliation. Period placed ON_HOLD.",
      );
    }

    if (period.reconciliation_exceptions > 0) {
      await q.query(
        `update app.financial_distribution_periods set status = 'ON_HOLD', updated_at = now() where id = $1`,
        [periodId],
      );
      await logFinancialAudit(q, {
        actorId: viewer.id,
        ownerId: owner.id,
        eventType: "distribution.on_hold",
        resourceType: "financial_distribution_period",
        resourceId: periodId,
        metadata: { exceptionsCount: period.reconciliation_exceptions },
      });
      return { periodId, status: "ON_HOLD" as DistributionStatus };
    }

    await q.query(
      `update app.financial_distribution_periods
          set status = 'AWAITING_APPROVAL', updated_at = now()
        where id = $1`,
      [periodId],
    );
    await q.query(
      `update app.owner_distribution_allocations
          set status = 'PENDING', updated_at = now()
        where distribution_period_id = $1`,
      [periodId],
    );

    await logFinancialAudit(q, {
      actorId: viewer.id,
      ownerId: owner.id,
      eventType: "distribution.reconciled",
      resourceType: "financial_distribution_period",
      resourceId: periodId,
      metadata: { calculationVersion: period.calculation_version },
    });

    return { periodId, status: "AWAITING_APPROVAL" as DistributionStatus };
  });
}

/**
 * Dual-Owner Approval System (Section 8):
 * - Jade must approve using Jade's own authenticated session.
 * - Kael Veyre must approve using Kael's own authenticated session.
 * - Requires MFA step-up verification.
 * - One owner cannot approve twice or approve on behalf of the other.
 * - A rejected distribution returns to review (status = 'REJECTED').
 * - Once both owners approve the current calculation_version, status moves
 *   through APPROVED to READY_FOR_PAYOUT.
 */
export async function submitDistributionDecision(
  viewer: Viewer,
  input: {
    periodId: string;
    decision: "APPROVED" | "REJECTED";
    mfaCode: string;
    note?: string;
    expectedOwnerId?: string;
  },
) {
  const owner = await resolveAuthenticatedOwner(viewer, input.expectedOwnerId ?? null, "owner.distributions.approve");
  await verifyOwnerMfaStepUp(viewer, input.mfaCode);

  return system(async (q) => {
    const period = await q.one<{
      id: string;
      status: DistributionStatus;
      calculation_version: number;
      reconciliation_exceptions: number;
    }>(
      `select id, status, calculation_version, reconciliation_exceptions
         from app.financial_distribution_periods
        where id = $1 for update`,
      [input.periodId],
    );
    if (!period) throw new AppError("not_found", "Distribution period not found.");

    if (!["AWAITING_APPROVAL", "PARTIALLY_APPROVED"].includes(period.status)) {
      throw new AppError(
        "conflict",
        `Distribution period in status ${period.status} is not open for approval decisions.`,
      );
    }
    if (period.reconciliation_exceptions > 0) {
      throw new AppError("conflict", "Cannot approve a distribution period with unresolved reconciliation exceptions.");
    }

    const existingApproval = await q.one<{ id: string; decision: string }>(
      `select id, decision
         from app.distribution_approvals
        where distribution_period_id = $1
          and owner_id = $2
          and calculation_version = $3`,
      [input.periodId, owner.id, period.calculation_version],
    );
    if (existingApproval) {
      throw new AppError(
        "conflict",
        `${owner.displayName} has already recorded a decision (${existingApproval.decision}) for calculation version ${period.calculation_version}.`,
      );
    }

    const approvalRow = await q.one<{ id: string }>(
      `insert into app.distribution_approvals
         (distribution_period_id, owner_id, authenticated_actor_id, calculation_version, decision, note)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [
        input.periodId,
        owner.id,
        viewer.id,
        period.calculation_version,
        input.decision,
        input.note?.trim() || null,
      ],
    );

    if (input.decision === "REJECTED") {
      await q.query(
        `update app.financial_distribution_periods
            set status = 'REJECTED', updated_at = now()
          where id = $1`,
        [input.periodId],
      );
      await q.query(
        `update app.owner_distribution_allocations
            set status = 'REJECTED', updated_at = now()
          where distribution_period_id = $1`,
        [input.periodId],
      );
      await logFinancialAudit(q, {
        actorId: viewer.id,
        ownerId: owner.id,
        eventType: "distribution.rejected",
        resourceType: "financial_distribution_period",
        resourceId: input.periodId,
        metadata: {
          approvalId: approvalRow!.id,
          calculationVersion: period.calculation_version,
          note: input.note?.trim() || null,
        },
      });
      return {
        periodId: input.periodId,
        status: "REJECTED" as DistributionStatus,
        approvedOwners: [] as OwnerId[],
      };
    }

    const approvals = await q.query<{ owner_id: OwnerId }>(
      `select distinct da.owner_id
         from app.distribution_approvals da
         join app.platform_owners po on po.id = da.owner_id and po.status = 'active'
        where da.distribution_period_id = $1
          and da.calculation_version = $2
          and da.decision = 'APPROVED'
        order by da.owner_id asc`,
      [input.periodId, period.calculation_version],
    );

    const approvedOwners = approvals.map((a) => a.owner_id);
    const bothApproved = approvedOwners.includes("OWNER_001") && approvedOwners.includes("OWNER_002");
    const nextStatus: DistributionStatus = bothApproved ? "READY_FOR_PAYOUT" : "PARTIALLY_APPROVED";

    await q.query(
      `update app.financial_distribution_periods
          set status = $2, updated_at = now()
        where id = $1`,
      [input.periodId, nextStatus],
    );
    await q.query(
      `update app.owner_distribution_allocations
          set status = 'APPROVED', updated_at = now()
        where distribution_period_id = $1
          and owner_id = $2`,
      [input.periodId, owner.id],
    );
    if (bothApproved) {
      await q.query(
        `update app.owner_distribution_allocations
            set status = 'READY_FOR_PAYOUT', updated_at = now()
          where distribution_period_id = $1`,
        [input.periodId],
      );
    }

    await logFinancialAudit(q, {
      actorId: viewer.id,
      ownerId: owner.id,
      eventType: bothApproved ? "distribution.dual_approved" : "distribution.partially_approved",
      resourceType: "financial_distribution_period",
      resourceId: input.periodId,
      metadata: {
        approvalId: approvalRow!.id,
        calculationVersion: period.calculation_version,
        approvedOwners,
        status: nextStatus,
      },
    });

    return {
      periodId: input.periodId,
      status: nextStatus,
      approvedOwners,
    };
  });
}

/**
 * Returns ONLY the authenticated owner's payout destination (Account A for Jade, Account B for Kael Veyre).
 * Enforced by both server-side owner resolution and PostgreSQL RLS (`owner_id = app.current_owner_id()`).
 */
export async function getMyPayoutDestination(viewer: Viewer): Promise<PayoutDestinationRecord> {
  const owner = await resolveAuthenticatedOwner(viewer, null, "owner.payout_accounts.manage");

  return asViewer(viewer, async (q) => {
    const rows = await q.query<{
      id: string;
      owner_id: OwnerId;
      account_label: "Account A" | "Account B";
      provider: string;
      provider_account_reference: string;
      masked_details: string;
      destination_type: DestinationType;
      currency: string;
      verification_status: PayoutDestinationRecord["verificationStatus"];
      status: PayoutDestinationRecord["status"];
      updated_at: Date;
    }>(
      `select id,
              owner_id,
              account_label,
              provider,
              provider_account_reference,
              masked_details,
              destination_type,
              currency,
              verification_status,
              status,
              updated_at
         from app.payout_destinations
        where status = 'active'`,
    );

    if (rows.length !== 1 || rows[0].owner_id !== owner.id) {
      throw new AppError("not_found", "Payout destination for the authenticated owner was not found.");
    }
    const r = rows[0];
    return {
      id: r.id,
      ownerId: r.owner_id,
      accountCode: r.account_label,
      provider: r.provider,
      providerAccountReference: r.provider_account_reference,
      maskedAccountLabel: r.masked_details,
      destinationType: r.destination_type,
      currency: r.currency,
      verificationStatus: r.verification_status,
      status: r.status,
      updatedAt: r.updated_at,
    };
  });
}

/**
 * Updates ONLY the authenticated owner's payout destination (Account A for Jade, Account B for Kael Veyre).
 * - Validates input fields and forbids raw credentials BEFORE consuming the MFA step.
 * - Requires MFA step-up verification.
 * - Invalidates any in-flight distribution approvals by incrementing `calculation_version`
 *   and resetting `PARTIALLY_APPROVED` / `APPROVED` / `READY_FOR_PAYOUT` periods to `AWAITING_APPROVAL`.
 * - Records an immutable audit log entry.
 */
export async function updateMyPayoutDestination(
  viewer: Viewer,
  input: {
    provider: string;
    providerAccountReference: string;
    maskedAccountLabel: string;
    destinationType?: string;
    currency?: string;
    mfaCode: string;
    targetOwnerId?: string;
  },
): Promise<PayoutDestinationRecord> {
  const owner = await resolveAuthenticatedOwner(viewer, input.targetOwnerId ?? null, "owner.payout_accounts.manage");

  const provider = input.provider.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  const providerRef = input.providerAccountReference.trim();
  const maskedLabel = input.maskedAccountLabel.trim();
  const currency = (input.currency ?? "USD").trim().toUpperCase();
  const destinationType = normalizeDestinationType(input.destinationType);

  if (provider.length < 2 || provider.length > 40) {
    throw new AppError("validation", "Enter a valid payout provider identifier (2–40 characters).", "provider");
  }
  if (providerRef.length < 4 || providerRef.length > 160) {
    throw new AppError("validation", "Enter a valid provider account reference (4–160 characters).", "providerAccountReference");
  }
  if (maskedLabel.length < 4 || maskedLabel.length > 80) {
    throw new AppError("validation", "Enter a masked account label (e.g., Account A •••• 4821).", "maskedAccountLabel");
  }

  assertNoRawCredentials(providerRef, "providerAccountReference");
  assertNoRawCredentials(maskedLabel, "maskedAccountLabel");

  // Verify MFA after validating field formats so a typo does not consume a TOTP step
  await verifyOwnerMfaStepUp(viewer, input.mfaCode);

  await system(async (q) => {
    const dest = await q.one<{ id: string; account_label: string }>(
      `update app.payout_destinations
          set provider = $2,
              provider_account_reference = $3,
              masked_details = $4,
              destination_type = $5,
              currency = $6,
              updated_at = now()
        where owner_id = $1 and status = 'active'
        returning id, account_label`,
      [owner.id, provider, providerRef, maskedLabel, destinationType, currency],
    );
    if (!dest) throw new AppError("not_found", "Payout destination not found.");

    // Section 8: A material change to payout destinations invalidates relevant pending approvals.
    const invalidated = await q.query<{ id: string }>(
      `update app.financial_distribution_periods
          set calculation_version = calculation_version + 1,
              status = 'AWAITING_APPROVAL',
              updated_at = now()
        where status in ('PARTIALLY_APPROVED', 'APPROVED', 'READY_FOR_PAYOUT')
        returning id`,
    );
    if (invalidated.length > 0) {
      await q.query(
        `update app.owner_distribution_allocations
            set status = 'PENDING',
                updated_at = now()
          where distribution_period_id = any($1::uuid[])`,
        [invalidated.map((r) => r.id)],
      );
    }

    await logFinancialAudit(q, {
      actorId: viewer.id,
      ownerId: owner.id,
      eventType: "payout_destination.updated",
      resourceType: "payout_destination",
      resourceId: dest.id,
      metadata: {
        accountCode: dest.account_label,
        provider,
        providerAccountReference: providerRef,
        maskedAccountLabel: maskedLabel,
        destinationType,
        currency,
        invalidatedPeriodIds: invalidated.map((r) => r.id),
      },
    });
  });

  return getMyPayoutDestination(viewer);
}

/**
 * Simulated Payout Processing (Section 7 & Section 8)
 */
export async function simulateOwnerPayouts(
  viewer: Viewer,
  input: {
    periodId: string;
    idempotencyKey: string;
    simulateFailureForOwnerId?: OwnerId;
    requestedSettlementMode?: "SIMULATED" | "PAID";
  },
) {
  const owner = await resolveAuthenticatedOwner(viewer, null, "owner.payouts.simulate");

  if (input.requestedSettlementMode === "PAID") {
    throw new AppError(
      "forbidden",
      "Live settlement transfers (PAID) are disabled until provider split-payout capabilities are verified and explicitly enabled.",
    );
  }

  const idemBase = input.idempotencyKey.trim().replace(/[^A-Za-z0-9_:-]/g, "-");
  if (idemBase.length < 4 || idemBase.length > 100) {
    throw new AppError("validation", "Provide a valid idempotencyKey (4–100 characters).", "idempotencyKey");
  }

  return system(async (q) => {
    const period = await q.one<{
      id: string;
      status: DistributionStatus;
      currency: string;
      calculation_version: number;
      distributable_amount_minor: string;
      platform_revenue_minor: string;
      deductions_minor: string;
      period_start: Date;
      period_end: Date;
    }>(
      `select id, status, currency, calculation_version,
              distributable_amount_minor::text, platform_revenue_minor::text, deductions_minor::text,
              period_start, period_end
         from app.financial_distribution_periods
        where id = $1 for update`,
      [input.periodId],
    );
    if (!period) throw new AppError("not_found", "Distribution period not found.");

    const existingForKey = await q.query<{
      id: string;
      owner_id: OwnerId;
      amount_minor: string;
      status: string;
      provider_reference: string | null;
    }>(
      `select id, owner_id, amount_minor::text, status, provider_reference
         from app.owner_payouts
        where idempotency_key in ($1, $2)
        order by owner_id asc`,
      [`${idemBase}:OWNER_001`, `${idemBase}:OWNER_002`],
    );
    if (existingForKey.length === 2) {
      return {
        idempotentReplay: true,
        periodId: period.id,
        periodStatus: period.status,
        payouts: existingForKey.map((p) => ({
          id: p.id,
          ownerId: p.owner_id,
          amountMinor: Number(p.amount_minor),
          status: p.status,
          providerReference: p.provider_reference,
        })),
      };
    }

    if (period.status !== "READY_FOR_PAYOUT") {
      throw new AppError(
        "conflict",
        `Distribution period must be READY_FOR_PAYOUT with dual-owner approval before simulating payouts (current status: ${period.status}).`,
      );
    }

    const allocations = await q.query<{
      id: string;
      owner_id: OwnerId;
      percentage_snapshot_basis_points: number;
      allocated_amount_minor: string;
    }>(
      `select id, owner_id, percentage_snapshot_basis_points, allocated_amount_minor::text
         from app.owner_distribution_allocations
        where distribution_period_id = $1
        order by owner_id asc`,
      [period.id],
    );
    if (allocations.length !== 2) {
      throw new AppError("conflict", "Expected exactly two owner allocations for payout simulation.");
    }

    const createdPayouts: {
      id: string;
      ownerId: OwnerId;
      amountMinor: number;
      status: "SIMULATED" | "FAILED";
      providerReference: string;
    }[] = [];

    let anyFailed = false;

    for (const alloc of allocations) {
      const dest = await q.one<{
        id: string;
        owner_id: OwnerId;
        account_label: string;
        provider: string;
        provider_account_reference: string;
        masked_details: string;
        status: string;
      }>(
        `select id, owner_id, account_label, provider, provider_account_reference, masked_details, status
           from app.payout_destinations
          where owner_id = $1 and status = 'active'`,
        [alloc.owner_id],
      );
      if (!dest) {
        throw new AppError("conflict", `No active payout destination registered for ${alloc.owner_id}.`);
      }

      const shouldFail = input.simulateFailureForOwnerId === alloc.owner_id;
      if (shouldFail) anyFailed = true;

      const payoutStatus: "SIMULATED" | "FAILED" = shouldFail ? "FAILED" : "SIMULATED";
      const providerRef = `SIM-${period.id.slice(0, 8)}-${alloc.owner_id}-v${period.calculation_version}`;
      const amountMinor = Number(alloc.allocated_amount_minor);

      const statement = {
        statementType: "OWNER_DISTRIBUTION_SIMULATION",
        periodId: period.id,
        periodStart: period.period_start.toISOString(),
        periodEnd: period.period_end.toISOString(),
        calculationVersion: period.calculation_version,
        ownerId: alloc.owner_id,
        ownershipBasisPoints: alloc.percentage_snapshot_basis_points,
        accountCode: dest.account_label,
        maskedDestination: dest.masked_details,
        provider: dest.provider,
        currency: period.currency,
        platformRevenueMinor: Number(period.platform_revenue_minor),
        platformDeductionsMinor: Number(period.deductions_minor),
        netDistributableMinor: Number(period.distributable_amount_minor),
        ownerAllocatedMinor: amountMinor,
        settlementMode: payoutStatus,
        liveTransferExecuted: false,
        generatedAt: new Date().toISOString(),
      };

      const pRow = await q.one<{ id: string }>(
        `insert into app.owner_payouts
           (owner_id, distribution_allocation_id, payout_destination_id, amount_minor, currency,
            status, provider_reference, idempotency_key, failure_reason, statement_json)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
         returning id`,
        [
          alloc.owner_id,
          alloc.id,
          dest.id,
          amountMinor,
          period.currency,
          payoutStatus,
          providerRef,
          `${idemBase}:${alloc.owner_id}`,
          shouldFail ? "Simulated payout provider rejection — funds held in owner allocation (never redirected)" : null,
          JSON.stringify(statement),
        ],
      );

      await q.query(
        `update app.owner_distribution_allocations
            set status = $2, updated_at = now()
          where id = $1`,
        [alloc.id, payoutStatus],
      );

      createdPayouts.push({
        id: pRow!.id,
        ownerId: alloc.owner_id,
        amountMinor,
        status: payoutStatus,
        providerReference: providerRef,
      });
    }

    const finalPeriodStatus: DistributionStatus = anyFailed ? "FAILED" : "SIMULATED";
    await q.query(
      `update app.financial_distribution_periods
          set status = $2,
              finalized_at = case when $2 = 'SIMULATED' then now() else finalized_at end,
              updated_at = now()
        where id = $1`,
      [period.id, finalPeriodStatus],
    );

    await logFinancialAudit(q, {
      actorId: viewer.id,
      ownerId: owner.id,
      eventType: anyFailed ? "payout.simulation_failed" : "payout.simulated",
      resourceType: "financial_distribution_period",
      resourceId: period.id,
      metadata: {
        idempotencyKey: idemBase,
        periodStatus: finalPeriodStatus,
        payouts: createdPayouts,
      },
    });

    return {
      idempotentReplay: false,
      periodId: period.id,
      periodStatus: finalPeriodStatus,
      payouts: createdPayouts,
    };
  });
}

/**
 * Fetches all scoped data for the authenticated owner's dashboard (Section 4)
 */
export async function getOwnerDashboardData(viewer: Viewer) {
  const owner = await resolveAuthenticatedOwner(viewer, null, "owner.dashboard.view");
  const myDestination = await getMyPayoutDestination(viewer);

  return asViewer(viewer, async (q) => {
    const now = new Date();
    const epoch = new Date("2020-01-01T00:00:00.000Z");
    const liveActivity = await system((sq) => aggregateRealDatabaseActivity(sq, epoch, new Date(now.getTime() + 86400_000), "USD"));
    const liveWaterfall = calculateWaterfallPure({
      grossSettledFanCollectionsMinor: liveActivity.grossSettledFanCollectionsMinor,
      applicableTaxesMinor: liveActivity.applicableTaxesMinor,
      transactionReversalsMinor: liveActivity.transactionReversalsMinor,
      creatorContractualEarningsMinor: liveActivity.creatorContractualEarningsMinor,
      processingAndSettlementCostsMinor: liveActivity.processingAndSettlementCostsMinor,
      approvedOperatingExpensesMinor: liveActivity.approvedOperatingExpensesMinor,
      reserveAllocationsMinor: liveActivity.reserveAllocationsMinor,
    });

    const periodRows = await q.query<{
      id: string;
      period_start: Date;
      period_end: Date;
      currency: string;
      gross_collections_minor: string;
      taxes_minor: string;
      refunds_chargebacks_minor: string;
      creator_liabilities_minor: string;
      platform_revenue_minor: string;
      processing_costs_minor: string;
      operating_expenses_minor: string;
      reserves_minor: string;
      deductions_minor: string;
      distributable_amount_minor: string;
      reconciliation_exceptions: number;
      calculation_version: number;
      status: DistributionStatus;
      finalized_at: Date | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `select * from app.financial_distribution_periods order by period_end desc, created_at desc limit 50`,
    );

    const allocRows = await q.query<{
      id: string;
      distribution_period_id: string;
      owner_id: OwnerId;
      display_name: string;
      percentage_snapshot_basis_points: number;
      allocated_amount_minor: string;
      status: string;
    }>(
      `select oda.id,
              oda.distribution_period_id,
              oda.owner_id,
              po.display_name,
              oda.percentage_snapshot_basis_points,
              oda.allocated_amount_minor::text,
              oda.status
         from app.owner_distribution_allocations oda
         join app.platform_owners po on po.id = oda.owner_id
        order by oda.owner_id asc`,
    );

    const approvalRows = await q.query<{
      id: string;
      distribution_period_id: string;
      owner_id: OwnerId;
      display_name: string;
      authenticated_actor_id: string;
      calculation_version: number;
      decision: "APPROVED" | "REJECTED";
      note: string | null;
      approved_at: Date;
    }>(
      `select da.id,
              da.distribution_period_id,
              da.owner_id,
              po.display_name,
              da.authenticated_actor_id,
              da.calculation_version,
              da.decision,
              da.note,
              da.approved_at
         from app.distribution_approvals da
         join app.platform_owners po on po.id = da.owner_id
        order by da.approved_at desc`,
    );

    const periods: DistributionPeriodRecord[] = periodRows.map((p) => {
      const pAllocs = allocRows
        .filter((a) => a.distribution_period_id === p.id)
        .map((a) => ({
          id: a.id,
          ownerId: a.owner_id,
          displayName: a.display_name,
          percentageSnapshotBasisPoints: Number(a.percentage_snapshot_basis_points),
          allocatedAmountMinor: Number(a.allocated_amount_minor),
          status: a.status,
        }));
      const myAlloc = pAllocs.find((a) => a.ownerId === owner.id);
      const pApprovals = approvalRows
        .filter((ap) => ap.distribution_period_id === p.id)
        .map((ap) => ({
          id: ap.id,
          ownerId: ap.owner_id,
          displayName: ap.display_name,
          authenticatedActorId: ap.authenticated_actor_id,
          calculationVersion: Number(ap.calculation_version),
          decision: ap.decision,
          note: ap.note,
          approvedAt: ap.approved_at,
        }));

      return {
        id: p.id,
        periodStart: p.period_start,
        periodEnd: p.period_end,
        currency: p.currency,
        grossFanCollectionsMinor: Number(p.gross_collections_minor),
        taxesMinor: Number(p.taxes_minor),
        reversalsMinor: Number(p.refunds_chargebacks_minor),
        creatorLiabilitiesMinor: Number(p.creator_liabilities_minor),
        platformRevenueMinor: Number(p.platform_revenue_minor),
        processingCostsMinor: Number(p.processing_costs_minor),
        operatingExpensesMinor: Number(p.operating_expenses_minor),
        reservesMinor: Number(p.reserves_minor),
        roundingCarryMinor: Number(p.reserves_minor) % 2,
        deductionsMinor: Number(p.deductions_minor),
        distributableAmountMinor: Number(p.distributable_amount_minor),
        reconciliationExceptionsCount: Number(p.reconciliation_exceptions),
        calculationVersion: Number(p.calculation_version),
        status: p.status,
        notes: null,
        finalizedAt: p.finalized_at,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        myAllocationMinor: myAlloc?.allocatedAmountMinor ?? 0,
        myAllocationStatus: myAlloc?.status ?? "PENDING",
        allocations: pAllocs,
        approvals: pApprovals,
      };
    });

    const payoutRows = await q.query<{
      id: string;
      owner_id: OwnerId;
      distribution_allocation_id: string;
      payout_destination_id: string;
      amount_minor: string;
      currency: string;
      status: OwnerPayoutRecord["status"];
      provider_reference: string | null;
      idempotency_key: string;
      failure_reason: string | null;
      statement_json: Record<string, unknown>;
      created_at: Date;
      updated_at: Date;
    }>(`select * from app.owner_payouts order by created_at desc limit 50`);

    const myPayouts: OwnerPayoutRecord[] = payoutRows.map((r) => ({
      id: r.id,
      ownerId: r.owner_id,
      distributionAllocationId: r.distribution_allocation_id,
      payoutDestinationId: r.payout_destination_id,
      accountCode: myDestination.accountCode,
      maskedAccountLabel: myDestination.maskedAccountLabel,
      amountMinor: Number(r.amount_minor),
      currency: r.currency,
      status: r.status,
      providerReference: r.provider_reference,
      idempotencyKey: r.idempotency_key,
      failureReason: r.failure_reason,
      statementJson: r.statement_json,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    const pendingDistributionsMinor = periods
      .filter((p) => ["DRAFT", "CALCULATED", "RECONCILED", "AWAITING_APPROVAL", "PARTIALLY_APPROVED", "ON_HOLD"].includes(p.status))
      .reduce((s, p) => s + p.myAllocationMinor, 0);

    const approvedDistributionsMinor = periods
      .filter((p) => ["APPROVED", "READY_FOR_PAYOUT", "SIMULATED"].includes(p.status))
      .reduce((s, p) => s + p.myAllocationMinor, 0);

    const paidDistributionsMinor = myPayouts
      .filter((p) => p.status === "PAID")
      .reduce((s, p) => s + p.amountMinor, 0);

    const simulatedDistributionsMinor = myPayouts
      .filter((p) => p.status === "SIMULATED")
      .reduce((s, p) => s + p.amountMinor, 0);

    const totalReconciliationExceptions =
      liveActivity.reconciliationExceptionsCount +
      periods.reduce((s, p) => s + p.reconciliationExceptionsCount, 0);

    const creators = await system((sq) =>
      sq.query<{
        user_id: string;
        handle: string;
        display_name: string;
        discipline: string;
        category: string;
        visibility: string;
        published: boolean;
        verification_status: string;
        active_subscribers: number;
        published_posts: number;
      }>(
        `select c.user_id,
                c.handle::text as handle,
                c.display_name,
                c.discipline,
                c.category,
                c.visibility,
                (c.published_at is not null) as published,
                coalesce(v.status, 'not_started') as verification_status,
                (select count(*)::int from app.subscriptions s where s.creator_id = c.user_id and s.status = 'active') as active_subscribers,
                (select count(*)::int from app.posts p where p.creator_id = c.user_id and p.published_at is not null and p.hidden_at is null) as published_posts
           from app.creators c
           left join app.creator_verifications v on v.user_id = c.user_id
          order by c.created_at desc
          limit 100`,
      ),
    );

    const platformStats = await system((sq) =>
      sq.one<{
        active_creators: number;
        verified_creators: number;
        active_fans: number;
        active_subscriptions: number;
        total_purchases: number;
        published_posts: number;
      }>(
        `select (select count(*)::int from app.creators where published_at is not null) as active_creators,
                (select count(*)::int from app.creator_verifications where status = 'verified') as verified_creators,
                (select count(*)::int from app.users where role = 'member' and status = 'active') as active_fans,
                (select count(*)::int from app.subscriptions where status = 'active') as active_subscriptions,
                (select count(*)::int from app.purchases) as total_purchases,
                (select count(*)::int from app.posts where published_at is not null and hidden_at is null) as published_posts`,
      ),
    );

    const auditEvents = await q.query<{
      id: string;
      actor_id: string | null;
      owner_id: OwnerId | null;
      event_type: string;
      resource_type: string;
      resource_id: string | null;
      metadata: Record<string, unknown>;
      created_at: Date;
    }>(
      `select id::text, actor_id, owner_id, event_type, resource_type, resource_id, metadata, created_at
         from app.financial_audit_events
        order by id desc
        limit 100`,
    );

    const expenses = await q.query<{
      id: string;
      category: string;
      description: string;
      amount_minor: string;
      currency: string;
      status: string;
      approved_by: string | null;
      incurred_at: Date;
    }>(`select * from app.platform_operating_expenses order by incurred_at desc limit 50`);

    const reserves = await q.query<{
      id: string;
      reason: string;
      amount_minor: string;
      currency: string;
      status: string;
      created_at: Date;
    }>(`select * from app.platform_reserves order by created_at desc limit 50`);

    const conversions = await q.query<{
      id: string;
      from_currency: string;
      from_amount_minor: string;
      to_currency: string;
      to_amount_minor: string;
      rate_numerator: string;
      rate_denominator: string;
      reference: string;
      created_at: Date;
    }>(`select * from app.currency_conversion_records order by created_at desc limit 50`);

    const myShareOfLiveMinor =
      owner.id === "OWNER_001" ? liveWaterfall.jadeAllocationMinor : liveWaterfall.kaelAllocationMinor;

    return {
      owner,
      overview: {
        grossFanCollectionsMinor: liveWaterfall.grossSettledFanCollectionsMinor,
        creatorLiabilitiesMinor: liveWaterfall.creatorContractualEarningsMinor,
        platformRevenueMinor: liveWaterfall.platformRevenueBeforeCostsMinor,
        approvedExpensesMinor: liveWaterfall.approvedOperatingExpensesMinor,
        refundsAndChargebacksMinor: liveWaterfall.transactionReversalsMinor,
        reservesMinor: liveWaterfall.reserveAllocationsMinor + liveWaterfall.roundingCarryReserveMinor,
        netDistributableEarningsMinor: liveWaterfall.netDistributableEarningsMinor,
        my50PercentAllocationMinor: myShareOfLiveMinor,
        pendingDistributionsMinor,
        approvedDistributionsMinor,
        paidDistributionsMinor,
        simulatedDistributionsMinor,
        reconciliationExceptionsCount: totalReconciliationExceptions,
        provisionalPlatformFeeBps: PROVISIONAL_PLATFORM_FEE_BPS,
        creatorContractualShareBps: CREATOR_CONTRACTUAL_SHARE_BPS,
      },
      myDestination,
      myPayouts,
      periods,
      creators,
      platformStats: platformStats!,
      auditEvents,
      expenses: expenses.map((e) => ({
        id: e.id,
        category: e.category,
        description: e.description,
        amountMinor: Number(e.amount_minor),
        currency: e.currency,
        status: e.status,
        approvedByOwnerId: e.approved_by,
        incurredAt: e.incurred_at,
      })),
      reserves: reserves.map((r) => ({
        id: r.id,
        reason: r.reason,
        amountMinor: Number(r.amount_minor),
        currency: r.currency,
        status: r.status,
        createdAt: r.created_at,
      })),
      conversions: conversions.map((c) => ({
        id: c.id,
        sourceCurrency: c.from_currency,
        sourceAmountMinor: Number(c.from_amount_minor),
        targetCurrency: c.to_currency,
        convertedAmountMinor: Number(c.to_amount_minor),
        rateNumerator: Number(c.rate_numerator),
        rateDenominator: Number(c.rate_denominator),
        reference: c.reference,
        convertedAt: c.created_at,
      })),
    };
  });
}
