import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { can, resolvePlatformRoleLabel } from "@/server/auth/permissions";
import { codeAt, currentStep } from "@/server/auth/totp";
import {
  DEV_PASSWORD,
  devTotpSecret,
  JADE_OWNER_TEST_EMAIL,
  KAEL_OWNER_TEST_EMAIL,
  type SeedResult,
} from "@/server/seed";
import { signIn } from "@/server/services/accounts";
import { verifyChallenge } from "@/server/services/mfa";
import {
  calculateWaterfallPure,
  createOrCalculateDistributionPeriod,
  getMyPayoutDestination,
  getOwnerDashboardData,
  reconcileDistributionPeriod,
  recordCurrencyConversion,
  recordOperatingExpense,
  recordPlatformReserve,
  resolveAuthenticatedOwner,
  simulateOwnerPayouts,
  submitDistributionDecision,
  updateMyPayoutDestination,
  verifyOwnershipRegistry,
} from "@/server/services/ownerFinance";
import { resolveSession } from "@/server/services/sessions";
import { applyEvent, attachProviderRef, createPayment } from "@/server/payments/engine";
import { PROVISIONAL_PLATFORM_FEE_BPS } from "@/server/payments/policy";
import { asViewer, closePool, meta, resetDb, rlsError, system, viewer } from "./helpers";

let s: SeedResult;
let totpStepOffset = 0;

beforeEach(async () => {
  s = await resetDb();
  totpStepOffset = 0;
});
afterAll(closePool);

async function nextJadeCode(): Promise<string> {
  await system((q) => q.query(`update app.mfa_factors set last_used_step = null where user_id = $1`, [s.jadeUserId]));
  return codeAt(devTotpSecret(JADE_OWNER_TEST_EMAIL), currentStep());
}

async function nextKaelCode(): Promise<string> {
  await system((q) => q.query(`update app.mfa_factors set last_used_step = null where user_id = $1`, [s.kaelUserId]));
  return codeAt(devTotpSecret(KAEL_OWNER_TEST_EMAIL), currentStep());
}

async function signInAndVerifyOwner(email: string) {
  const { sessionToken } = await signIn(email, DEV_PASSWORD, meta);
  const preMfa = (await resolveSession(sessionToken))!;
  expect(preMfa.mfa).toBe("pending");
  expect(preMfa.aal).toBe(1);
  await system((q) => q.query(`update app.mfa_factors set last_used_step = null where user_id = $1`, [preMfa.id]));
  const code = codeAt(devTotpSecret(email), currentStep());
  await verifyChallenge(preMfa, code, meta);
  return (await resolveSession(sessionToken))!;
}

describe("1–2. Two-owner authentication, independent MFA, and personalized dashboard identity", () => {
  it("Jade (OWNER_001) logs in with independent MFA and sees 'Welcome back, Jade.' and Account A only", async () => {
    const jadeViewer = await signInAndVerifyOwner(JADE_OWNER_TEST_EMAIL);
    expect(jadeViewer.id).toBe(s.jadeUserId);
    expect(jadeViewer.role).toBe("owner");
    expect(jadeViewer.aal).toBe(2);

    const data = await getOwnerDashboardData(jadeViewer);
    expect(data.owner.id).toBe("OWNER_001");
    expect(data.owner.displayName).toBe("Jade");
    expect(data.owner.percentageBasisPoints).toBe(5000);
    expect(data.owner.percentageDisplay).toBe("50%");
    expect(data.owner.welcomeHeader).toBe("Welcome back, Jade.");
    expect(data.myDestination.accountCode).toBe("Account A");
    expect(JSON.stringify(data.myDestination)).not.toContain("Account B");
  });

  it("Kael Veyre (OWNER_002) logs in with independent MFA and sees 'Welcome back, Kael Veyre.' and Account B only", async () => {
    const kaelViewer = await signInAndVerifyOwner(KAEL_OWNER_TEST_EMAIL);
    expect(kaelViewer.id).toBe(s.kaelUserId);
    expect(kaelViewer.role).toBe("owner");
    expect(kaelViewer.aal).toBe(2);

    const data = await getOwnerDashboardData(kaelViewer);
    expect(data.owner.id).toBe("OWNER_002");
    expect(data.owner.displayName).toBe("Kael Veyre");
    expect(data.owner.percentageBasisPoints).toBe(5000);
    expect(data.owner.percentageDisplay).toBe("50%");
    expect(data.owner.welcomeHeader).toBe("Welcome back, Kael Veyre.");
    expect(data.myDestination.accountCode).toBe("Account B");
    expect(JSON.stringify(data.myDestination)).not.toContain("Account A");
  });
});

describe("3–4 & 10. Strict cross-owner isolation and anti-spoofing", () => {
  it("Jade cannot access or modify Kael Veyre's payout destination (app layer AND PostgreSQL RLS)", async () => {
    const jadeViewer = await viewer(s.jadeUserId);

    // Direct RLS query as Jade returns only Account A (never Account B)
    const visibleDestinations = await asViewer(jadeViewer, (q) =>
      q.query<{ owner_id: string; account_label: string }>(`select owner_id, account_label from app.payout_destinations`),
    );
    expect(visibleDestinations).toEqual([{ owner_id: "OWNER_001", account_label: "Account A" }]);

    // Direct RLS/table-privilege UPDATE attempting to modify Kael's Account B is denied (42501)
    expect(
      await rlsError(
        s.jadeUserId,
        `update app.payout_destinations set provider_account_reference = 'hijacked' where owner_id = 'OWNER_002'`,
      ),
    ).toBe("42501");

    // Service layer rejects spoofed targetOwnerId = OWNER_002
    await expect(
      updateMyPayoutDestination(jadeViewer, {
        provider: "stripe_treasury",
        providerAccountReference: "acct_jade_attempt",
        maskedAccountLabel: "Account B •••• 9999",
        destinationType: "settlement_account",
        mfaCode: await nextJadeCode(),
        targetOwnerId: "OWNER_002",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("Kael Veyre cannot access or modify Jade's payout destination (app layer AND PostgreSQL RLS)", async () => {
    const kaelViewer = await viewer(s.kaelUserId);

    const visibleDestinations = await asViewer(kaelViewer, (q) =>
      q.query<{ owner_id: string; account_label: string }>(`select owner_id, account_label from app.payout_destinations`),
    );
    expect(visibleDestinations).toEqual([{ owner_id: "OWNER_002", account_label: "Account B" }]);

    expect(
      await rlsError(
        s.kaelUserId,
        `update app.payout_destinations set provider_account_reference = 'hijacked' where owner_id = 'OWNER_001'`,
      ),
    ).toBe("42501");

    await expect(
      updateMyPayoutDestination(kaelViewer, {
        provider: "stripe_treasury",
        providerAccountReference: "acct_kael_attempt",
        maskedAccountLabel: "Account A •••• 9999",
        destinationType: "settlement_account",
        mfaCode: await nextKaelCode(),
        targetOwnerId: "OWNER_001",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("rejects spoofed user-supplied ownerId parameters in resolveAuthenticatedOwner", async () => {
    const jadeViewer = await viewer(s.jadeUserId);
    const kaelViewer = await viewer(s.kaelUserId);

    await expect(resolveAuthenticatedOwner(jadeViewer, "OWNER_002")).rejects.toMatchObject({ code: "forbidden" });
    await expect(resolveAuthenticatedOwner(kaelViewer, "OWNER_001")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("rejects raw banking credentials, IBANs, card PANs, or wallet private keys in payout destinations", async () => {
    const jadeViewer = await viewer(s.jadeUserId);
    await expect(
      updateMyPayoutDestination(jadeViewer, {
        provider: "bank",
        providerAccountReference: "4532015112830366", // Raw 16-digit PAN
        maskedAccountLabel: "Account A •••• 0366",
        destinationType: "bank_account",
        mfaCode: await nextJadeCode(),
      }),
    ).rejects.toMatchObject({ code: "validation", field: "providerAccountReference" });

    await expect(
      updateMyPayoutDestination(jadeViewer, {
        provider: "wallet",
        providerAccountReference: "0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318", // Raw hex private key
        maskedAccountLabel: "Account A Wallet",
        destinationType: "wallet",
        mfaCode: await nextJadeCode(),
      }),
    ).rejects.toMatchObject({ code: "validation", field: "providerAccountReference" });
  });
});

describe("5–7. Ownership registry invariants (2 active owners, 10000 bps, no overlaps)", () => {
  it("ownership registry contains exactly 2 active owners (Jade & Kael Veyre) totaling 10000 basis points", async () => {
    const jadeViewer = await viewer(s.jadeUserId);
    const reg = await verifyOwnershipRegistry(jadeViewer);
    expect(reg.activeOwnerCount).toBe(2);
    expect(reg.totalBasisPoints).toBe(10000);
    expect(reg.owners).toEqual([
      expect.objectContaining({
        ownerId: "OWNER_001",
        displayName: "Jade",
        percentageBasisPoints: 5000,
        percentageDisplay: "50%",
      }),
      expect.objectContaining({
        ownerId: "OWNER_002",
        displayName: "Kael Veyre",
        percentageBasisPoints: 5000,
        percentageDisplay: "50%",
      }),
    ]);
  });

  it("database rejects invalid ownership basis points or active totals not equal to 10000", async () => {
    // Attempting to change OWNER_001 to 6000 bps without balancing to 10000 fails at commit/check
    const badBps = await system((q) =>
      q.query(`update app.ownership_allocations set percentage_basis_points = 6000 where owner_id = 'OWNER_001'`),
    ).then(
      () => null,
      (e) => e.code,
    );
    expect(badBps).toBe("23514");

    // Attempting to insert a 0 or negative basis points allocation fails
    const zeroBps = await system((q) =>
      q.query(
        `insert into app.ownership_allocations (owner_id, percentage_basis_points, effective_from, effective_to, approval_reference)
         values ('OWNER_001', 0, now() - interval '60 days', now() - interval '30 days', 'bad')`,
      ),
    ).then(
      () => null,
      (e) => e.code,
    );
    expect(zeroBps).toBe("23514");
  });

  it("database rejects overlapping ownership allocation date ranges for the same owner", async () => {
    const overlapErr = await system((q) =>
      q.query(
        `insert into app.ownership_allocations (owner_id, percentage_basis_points, effective_from, effective_to, approval_reference)
         values ('OWNER_001', 5000, now() - interval '1 day', now() + interval '30 days', 'overlap-test')`,
      ),
    ).then(
      () => null,
      (e) => e.code,
    );
    expect(overlapErr).toBe("23505");
  });
});

describe("8–9. Role separation: Creator and Fan independence and security", () => {
  it("creators cannot access /owner, owner services, or owner financial tables", async () => {
    const creatorViewer = await viewer(s.creatorIds.isadora);
    expect(resolvePlatformRoleLabel(creatorViewer)).toBe("CREATOR");
    expect(can(creatorViewer, "owner.dashboard.view")).toBe(false);
    expect(can(creatorViewer, "owner.distributions.approve")).toBe(false);
    expect(can(creatorViewer, "owner.payout_accounts.manage")).toBe(false);

    await expect(resolveAuthenticatedOwner(creatorViewer)).rejects.toMatchObject({ code: "forbidden" });
    await expect(getOwnerDashboardData(creatorViewer)).rejects.toMatchObject({ code: "forbidden" });
    await expect(getMyPayoutDestination(creatorViewer)).rejects.toMatchObject({ code: "forbidden" });

    // RLS blocks creators from reading owner tables
    expect(await asViewer(s.creatorIds.isadora, (q) => q.query(`select * from app.platform_owners`))).toHaveLength(0);
    expect(await asViewer(s.creatorIds.isadora, (q) => q.query(`select * from app.payout_destinations`))).toHaveLength(0);
    expect(
      await asViewer(s.creatorIds.isadora, (q) => q.query(`select * from app.financial_distribution_periods`)),
    ).toHaveLength(0);
  });

  it("fans cannot access /owner, /studio, or owner financial APIs, and moderator capabilities remain distinct", async () => {
    const fanViewer = await viewer(s.memberId);
    expect(resolvePlatformRoleLabel(fanViewer)).toBe("FAN");
    expect(resolvePlatformRoleLabel({ ...fanViewer, aal: 2, staff: ["reports.view"] })).toBe("MODERATOR");
    expect(can(fanViewer, "owner.dashboard.view")).toBe(false);

    await expect(resolveAuthenticatedOwner(fanViewer)).rejects.toMatchObject({ code: "forbidden" });
    await expect(getOwnerDashboardData(fanViewer)).rejects.toMatchObject({ code: "forbidden" });

    expect(await asViewer(s.memberId, (q) => q.query(`select * from app.platform_owners`))).toHaveLength(0);
    expect(await asViewer(s.memberId, (q) => q.query(`select * from app.payout_destinations`))).toHaveLength(0);
    expect(await rlsError(s.memberId, `update app.ownership_allocations set percentage_basis_points = 9000`)).toBe(
      "42501",
    );
  });
});

describe("11–14. Financial waterfall, creator liability protection, and deterministic 50/50 rounding", () => {
  it("deducts taxes, reversals, and 85% creator contractual liabilities BEFORE calculating 15% platform revenue, then deducts expenses and reserves before the 50/50 split", () => {
    // Example:
    // Gross settled fan collections: $10,000.00 (1,000,000 cents)
    // Applicable taxes: $500.00 (50,000 cents)
    // Refunds & chargebacks: $500.00 (50,000 cents)
    // Net settled collections: $9,000.00 (900,000 cents)
    // Creator contractual earnings (85%): $7,650.00 (765,000 cents) — protected creator liability
    // Platform revenue before costs (15%): $1,350.00 (135,000 cents)
    // Processing costs: $50.00 (5,000 cents)
    // Approved operating expenses: $200.00 (20,000 cents)
    // Reserve allocations: $100.00 (10,000 cents)
    // Net distributable earnings: $1,000.00 (100,000 cents)
    // Jade (50%): $500.00 (50,000 cents)
    // Kael Veyre (50%): $500.00 (50,000 cents)
    const wf = calculateWaterfallPure({
      grossSettledFanCollectionsMinor: 1_000_000,
      applicableTaxesMinor: 50_000,
      transactionReversalsMinor: 50_000,
      processingAndSettlementCostsMinor: 5_000,
      approvedOperatingExpensesMinor: 20_000,
      reserveAllocationsMinor: 10_000,
    });

    expect(wf.netSettledCollectionsMinor).toBe(900_000);
    expect(wf.creatorContractualEarningsMinor).toBe(765_000);
    expect(wf.platformRevenueBeforeCostsMinor).toBe(135_000);
    expect(wf.totalDeductionsMinor).toBe(35_000);
    expect(wf.netDistributableEarningsMinor).toBe(100_000);
    expect(wf.jadeAllocationMinor).toBe(50_000);
    expect(wf.kaelAllocationMinor).toBe(50_000);
    expect(wf.roundingCarryReserveMinor).toBe(0);
  });

  it("protects creator liabilities from being reduced or distributed to owners, and rejects floating-point numbers", () => {
    expect(() =>
      calculateWaterfallPure({
        grossSettledFanCollectionsMinor: 100.5,
        applicableTaxesMinor: 0,
        transactionReversalsMinor: 0,
        processingAndSettlementCostsMinor: 0,
        approvedOperatingExpensesMinor: 0,
        reserveAllocationsMinor: 0,
      }),
    ).toThrow(/integer/i);

    // Attempting to pass a smaller creator liability than the 85% contractual share is forbidden
    expect(() =>
      calculateWaterfallPure({
        grossSettledFanCollectionsMinor: 100_000,
        applicableTaxesMinor: 0,
        transactionReversalsMinor: 0,
        creatorContractualEarningsMinor: 50_000, // less than 85,000 contractual share
        processingAndSettlementCostsMinor: 0,
        approvedOperatingExpensesMinor: 0,
        reserveAllocationsMinor: 0,
      }),
    ).toThrow(/Creator liabilities cannot be reduced/i);
  });

  it("handles odd-cent net earnings deterministically with exact cent reconciliation", () => {
    // Suppose net collections = 10,000 cents, creator = 8,500 cents, platform = 1,500 cents,
    // operating expenses = 499 cents -> raw net before split = 1,001 cents (odd).
    // Deterministic rounding holds 1 cent in roundingCarryReserveMinor so distributable = 1,000 cents:
    // Jade gets 500 cents, Kael Veyre gets 500 cents, and 500 + 500 + 1 === 1,001.
    const wf = calculateWaterfallPure({
      grossSettledFanCollectionsMinor: 10_000,
      applicableTaxesMinor: 0,
      transactionReversalsMinor: 0,
      creatorContractualEarningsMinor: 8_500,
      processingAndSettlementCostsMinor: 0,
      approvedOperatingExpensesMinor: 499,
      reserveAllocationsMinor: 0,
    });

    expect(wf.platformRevenueBeforeCostsMinor).toBe(1_500);
    expect(wf.roundingCarryReserveMinor).toBe(1);
    expect(wf.netDistributableEarningsMinor).toBe(1_000);
    expect(wf.jadeAllocationMinor).toBe(500);
    expect(wf.kaelAllocationMinor).toBe(500);
    expect(
      wf.jadeAllocationMinor +
        wf.kaelAllocationMinor +
        wf.roundingCarryReserveMinor +
        wf.approvedOperatingExpensesMinor,
    ).toBe(wf.platformRevenueBeforeCostsMinor);
  });
});

describe("15–20. Dual-owner approval workflow, invalidation, simulated payouts, and idempotency", () => {
  it("runs end-to-end: real fan payment + expense + reserve -> calculate -> reconcile -> Jade approves (PARTIALLY_APPROVED) -> Jade cannot approve twice -> Kael approves (READY_FOR_PAYOUT) -> simulated payouts for Account A & Account B", async () => {
    const jadeViewer = await viewer(s.jadeUserId);
    const kaelViewer = await viewer(s.kaelUserId);

    // 1. Book a real settled fan payment ($200.00 = 20,000 cents) and a multi-currency conversion
    const post = await system((q) =>
      q.one<{ id: string }>(`select id from app.posts where creator_id = $1 and access = 'ppv' limit 1`, [
        s.creatorIds.isadora,
      ]),
    );
    const pay = await createPayment(
      {
        kind: "ppv",
        fanId: s.member2Id,
        creatorId: s.creatorIds.isadora,
        targetId: post!.id,
        amountCents: 20_000,
        currency: "USD",
        provider: "mock",
        idempotencyKey: "fan-ppv-waterfall-1",
      },
      { testing: true, feeBps: PROVISIONAL_PLATFORM_FEE_BPS },
    );
    await attachProviderRef(pay.id, "mock_wf_ref_1", { testing: true });
    await applyEvent(
      "mock",
      {
        eventId: "evt_waterfall_1",
        type: "payment.succeeded",
        providerRef: "mock_wf_ref_1",
        amountCents: 20_000,
        currency: "USD",
      },
      "{}",
      { testing: true, feeBps: PROVISIONAL_PLATFORM_FEE_BPS },
    );

    await recordCurrencyConversion(jadeViewer, {
      sourceCurrency: "eur",
      sourceAmountMinor: 100_000,
      targetCurrency: "usd",
      rateNumerator: 110,
      rateDenominator: 100,
      reference: "FX-BATCH-001",
    });

    await recordOperatingExpense(jadeViewer, {
      category: "Hosting",
      description: "Managed database cluster",
      amountMinor: 1_000,
      currency: "usd",
    });

    await recordPlatformReserve(kaelViewer, {
      reason: "Rolling settlement reserve",
      amountMinor: 500,
      currency: "usd",
    });

    const periodStart = new Date(Date.now() - 3600_000);
    const periodEnd = new Date(Date.now() + 3600_000);

    // 2. Calculate & reconcile period
    const calc = await createOrCalculateDistributionPeriod(jadeViewer, {
      periodStart,
      periodEnd,
      currency: "usd",
      notes: "E2E waterfall test period",
    });
    expect(calc.status).toBe("CALCULATED");
    expect(calc.waterfall.jadeAllocationMinor).toBeGreaterThan(0);
    expect(calc.waterfall.jadeAllocationMinor).toBe(calc.waterfall.kaelAllocationMinor);

    const rec = await reconcileDistributionPeriod(jadeViewer, calc.periodId);
    expect(rec.status).toBe("AWAITING_APPROVAL");

    // 3. Single-owner approval by Jade results in PARTIALLY_APPROVED
    const jadeDecision = await submitDistributionDecision(jadeViewer, {
      periodId: calc.periodId,
      decision: "APPROVED",
      mfaCode: await nextJadeCode(),
      note: "Approved by Jade",
    });
    expect(jadeDecision.status).toBe("PARTIALLY_APPROVED");
    expect(jadeDecision.approvedOwners).toEqual(["OWNER_001"]);

    // 4. Jade cannot approve twice or trigger payout while only partially approved
    await expect(
      submitDistributionDecision(jadeViewer, {
        periodId: calc.periodId,
        decision: "APPROVED",
        mfaCode: await nextJadeCode(),
      }),
    ).rejects.toMatchObject({ code: "conflict" });

    await expect(
      simulateOwnerPayouts(jadeViewer, {
        periodId: calc.periodId,
        idempotencyKey: "premature-sim",
      }),
    ).rejects.toMatchObject({ code: "conflict" });

    // 5. Kael Veyre approves from Kael's own session -> transitions to READY_FOR_PAYOUT
    const kaelDecision = await submitDistributionDecision(kaelViewer, {
      periodId: calc.periodId,
      decision: "APPROVED",
      mfaCode: await nextKaelCode(),
      note: "Approved by Kael Veyre",
    });
    expect(kaelDecision.status).toBe("READY_FOR_PAYOUT");
    expect(kaelDecision.approvedOwners).toEqual(["OWNER_001", "OWNER_002"]);

    // 6. Live settlement mode PAID is refused
    await expect(
      simulateOwnerPayouts(jadeViewer, {
        periodId: calc.periodId,
        idempotencyKey: "live-attempt",
        requestedSettlementMode: "PAID",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });

    // 7. Simulated payout creates separate payout records for Account A (OWNER_001) and Account B (OWNER_002)
    const sim = await simulateOwnerPayouts(kaelViewer, {
      periodId: calc.periodId,
      idempotencyKey: "sim-batch-001",
    });
    expect(sim.idempotentReplay).toBe(false);
    expect(sim.periodStatus).toBe("SIMULATED");
    expect(sim.payouts).toHaveLength(2);
    expect(sim.payouts[0]).toMatchObject({
      ownerId: "OWNER_001",
      amountMinor: calc.waterfall.jadeAllocationMinor,
      status: "SIMULATED",
    });
    expect(sim.payouts[1]).toMatchObject({
      ownerId: "OWNER_002",
      amountMinor: calc.waterfall.kaelAllocationMinor,
      status: "SIMULATED",
    });

    // 8. Retrying with the same idempotencyKey returns the existing records without creating duplicates
    const retry = await simulateOwnerPayouts(jadeViewer, {
      periodId: calc.periodId,
      idempotencyKey: "sim-batch-001",
    });
    expect(retry.idempotentReplay).toBe(true);
    expect(retry.payouts).toHaveLength(2);

    const totalPayoutRows = await system((q) =>
      q.one<{ n: number }>(`select count(*)::int as n from app.owner_payouts`),
    );
    expect(totalPayoutRows!.n).toBe(2);

    // 9. Verify each owner sees ONLY their own payout statement under RLS
    const jadeDash = await getOwnerDashboardData(jadeViewer);
    const kaelDash = await getOwnerDashboardData(kaelViewer);
    expect(jadeDash.myPayouts).toHaveLength(1);
    expect(jadeDash.myPayouts[0].ownerId).toBe("OWNER_001");
    expect(jadeDash.myPayouts[0].accountCode).toBe("Account A");

    expect(kaelDash.myPayouts).toHaveLength(1);
    expect(kaelDash.myPayouts[0].ownerId).toBe("OWNER_002");
    expect(kaelDash.myPayouts[0].accountCode).toBe("Account B");
  });

  it("invalidates pending approvals when a calculation is rerun or a payout destination is changed, and returns rejected distributions to review", async () => {
    const jadeViewer = await viewer(s.jadeUserId);
    const kaelViewer = await viewer(s.kaelUserId);

    const periodStart = new Date(Date.now() - 7200_000);
    const periodEnd = new Date(Date.now() + 3600_000);

    const calc = await createOrCalculateDistributionPeriod(jadeViewer, {
      periodStart,
      periodEnd,
      currency: "usd",
      overrideWaterfall: {
        grossSettledFanCollectionsMinor: 200_000,
        applicableTaxesMinor: 0,
        transactionReversalsMinor: 0,
        processingAndSettlementCostsMinor: 0,
        approvedOperatingExpensesMinor: 0,
        reserveAllocationsMinor: 0,
      },
    });
    await reconcileDistributionPeriod(jadeViewer, calc.periodId);

    // Jade approves v1 -> PARTIALLY_APPROVED
    const p1 = await submitDistributionDecision(jadeViewer, {
      periodId: calc.periodId,
      decision: "APPROVED",
      mfaCode: await nextJadeCode(),
    });
    expect(p1.status).toBe("PARTIALLY_APPROVED");

    // Kael updates Account B destination -> invalidates pending approval, increments calculation_version to 2, resets status to AWAITING_APPROVAL
    await updateMyPayoutDestination(kaelViewer, {
      provider: "stripe_treasury",
      providerAccountReference: "acct_owner_002_kael_v2",
      maskedAccountLabel: "Account B •••• 7742",
      destinationType: "settlement_account",
      mfaCode: await nextKaelCode(),
    });

    const afterDestChange = await system((q) =>
      q.one<{ status: string; calculation_version: number }>(
        `select status, calculation_version from app.financial_distribution_periods where id = $1`,
        [calc.periodId],
      ),
    );
    expect(afterDestChange).toEqual({ status: "AWAITING_APPROVAL", calculation_version: 2 });

    // Kael rejects v2 -> status becomes REJECTED (returned to review)
    const rejected = await submitDistributionDecision(kaelViewer, {
      periodId: calc.periodId,
      decision: "REJECTED",
      mfaCode: await nextKaelCode(),
      note: "Recalculate after expense update",
    });
    expect(rejected.status).toBe("REJECTED");
  });

  it("never redirects money to the other owner when one owner's payout fails, and deduplicates retried payment webhooks", async () => {
    const jadeViewer = await viewer(s.jadeUserId);
    const kaelViewer = await viewer(s.kaelUserId);

    const calc = await createOrCalculateDistributionPeriod(jadeViewer, {
      periodStart: new Date(Date.now() - 3600_000),
      periodEnd: new Date(Date.now() + 3600_000),
      currency: "usd",
      overrideWaterfall: {
        grossSettledFanCollectionsMinor: 100_000,
        applicableTaxesMinor: 0,
        transactionReversalsMinor: 0,
        processingAndSettlementCostsMinor: 0,
        approvedOperatingExpensesMinor: 0,
        reserveAllocationsMinor: 0,
      },
    });
    await reconcileDistributionPeriod(jadeViewer, calc.periodId);
    await submitDistributionDecision(jadeViewer, {
      periodId: calc.periodId,
      decision: "APPROVED",
      mfaCode: await nextJadeCode(),
    });
    await submitDistributionDecision(kaelViewer, {
      periodId: calc.periodId,
      decision: "APPROVED",
      mfaCode: await nextKaelCode(),
    });

    // Simulate failure for OWNER_002 (Kael Veyre)
    const sim = await simulateOwnerPayouts(jadeViewer, {
      periodId: calc.periodId,
      idempotencyKey: "sim-fail-owner2",
      simulateFailureForOwnerId: "OWNER_002",
    });
    expect(sim.periodStatus).toBe("FAILED");
    const jadePayout = sim.payouts.find((p) => p.ownerId === "OWNER_001")!;
    const kaelPayout = sim.payouts.find((p) => p.ownerId === "OWNER_002")!;
    expect(jadePayout.status).toBe("SIMULATED");
    expect(jadePayout.amountMinor).toBe(7_500); // Exactly Jade's 50% share — never increased by Kael's failed payout
    expect(kaelPayout.status).toBe("FAILED");
    expect(kaelPayout.amountMinor).toBe(7_500);

    // Webhook retry deduplication check
    const post = await system((q) =>
      q.one<{ id: string }>(`select id from app.posts where creator_id = $1 and access = 'ppv' limit 1`, [
        s.creatorIds.isadora,
      ]),
    );
    const pay = await createPayment(
      {
        kind: "ppv",
        fanId: s.member2Id,
        creatorId: s.creatorIds.isadora,
        targetId: post!.id,
        amountCents: 5_000,
        currency: "USD",
        provider: "mock",
        idempotencyKey: "dup-webhook-check",
      },
      { testing: true, feeBps: PROVISIONAL_PLATFORM_FEE_BPS },
    );
    await attachProviderRef(pay.id, "mock_dup_ref_99", { testing: true });
    const ev = {
      eventId: "evt_dup_webhook_99",
      type: "payment.succeeded" as const,
      providerRef: "mock_dup_ref_99",
      amountCents: 5_000,
      currency: "USD",
    };
    const first = await applyEvent("mock", ev, "{}", { testing: true, feeBps: PROVISIONAL_PLATFORM_FEE_BPS });
    const second = await applyEvent("mock", ev, "{}", { testing: true, feeBps: PROVISIONAL_PLATFORM_FEE_BPS });
    expect(first).toBe("applied");
    expect(second).toBe("duplicate");

    const ledgerCount = await system((q) =>
      q.one<{ n: number }>(`select count(*)::int as n from app.ledger_entries where payment_id = $1`, [
        pay.id,
      ]),
    );
    expect(ledgerCount!.n).toBe(3); // provider_clearing (-5000), creator (+4250), platform_fees (+750) — never duplicated
  });
});
