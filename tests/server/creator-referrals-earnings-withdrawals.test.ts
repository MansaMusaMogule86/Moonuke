import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "@/server/auth/crypto";
import type { Viewer } from "@/server/auth/permissions";
import {
  applyEvent,
  applyRefund,
  attachProviderRef,
  createPayment,
  creatorBalance,
  referralBalance,
} from "@/server/payments/engine";
import { splitPurchaseAllocation } from "@/server/payments/ledger";
import {
  evaluateCreatorCountryEligibility,
  listCountryPayoutCapabilities,
} from "@/server/payments/countryEligibility";
import {
  describePaymentIdentities,
  getPlatformFinancialConfig,
  updatePlatformFinancialConfig,
  validateStatementDescriptorCandidate,
} from "@/server/payments/descriptors";
import {
  adminReassignCreatorReferrer,
  applyCreatorPayoutWebhook,
  captureCreatorReferralAtSignup,
  confirmCreatorReferralOnboarding,
  getOrCreateCreatorRecruitmentLink,
  onboardCreatorPayoutAccount,
  requestCreatorWithdrawal,
  resolveRecruitmentCode,
  updateCreatorBankDestination,
} from "@/server/services/creatorReferralsAndWithdrawals";
import { myDetailedStudioEarnings } from "@/server/services/earnings";
import { calculateWaterfallPure, createOrCalculateDistributionPeriod } from "@/server/services/ownerFinance";
import type { SeedResult } from "@/server/seed";
import { closePool, resetDb, system, viewer } from "./helpers";

let s: SeedResult;

beforeEach(async () => {
  s = await resetDb();
});

afterAll(closePool);

async function createTestCreator(handle: string, creatorName: string, email: string, password = "TestPassword123!") {
  const pwHash = await hashPassword(password);
  return system(async (q) => {
    await q.query(`insert into app.creator_allowlist (email, source) values ($1, 'test_fixture') on conflict do nothing`, [
      email,
    ]);
    const u = await q.one<{ id: string }>(
      `insert into app.users (email, password_hash, role, status, alias, adult_attested_at, approved_at, email_verified_at)
       values ($1, $2, 'creator'::app.user_role, 'active'::app.user_status, $3, now(), now(), now())
       returning id`,
      [email, pwHash, `Diva ${creatorName}`],
    );
    await q.query(
      `insert into app.creators (user_id, handle, creator_name, display_name, discipline, category, tagline, bio, visibility)
       values ($1, $2, $3, $4, 'Fashion', 'couture', 'Headline', 'Bio', 'listed')`,
      [u!.id, handle, creatorName, `Diva ${creatorName}`],
    );
    await q.query(
      `insert into app.creator_verifications (
         user_id, status, checks, submitted_at, reviewed_at, review_note,
         age_attested_at, identity_attested_at, consent_records_attested_at, terms_accepted_at
       )
       values (
         $1, 'verified', '{"identity":true,"age":true,"consent_records":true}',
         now(), now(), 'Test seed', now(), now(), now(), now()
       )
       on conflict (user_id) do update set status = 'verified', reviewed_at = now()`,
      [u!.id],
    );
    return { id: u!.id, handle, creatorName, password };
  });
}

describe("DivaFans Creator Referral, Earnings, Country Eligibility & Withdrawal System", () => {
  it("1 & 2. $100 eligible purchase allocates $85 to creator, $15 platform fee, $1.50 to direct referrer (10% of fee), and $13.50 net to platform without reducing creator's $85", async () => {
    // Pure allocation check first
    const pureReferred = splitPurchaseAllocation({
      eligibleAmountCents: 10000, // $100.00
      platformFeeBps: 1500, // 15%
      referralFeeBpsOfPlatform: 1000, // 10% of platform fee = 1.5%
      hasEligibleReferrer: true,
      processorFeeCents: 320, // e.g. $3.20 Stripe fee
    });
    expect(pureReferred.creatorAllocationCents).toBe(8500); // $85.00
    expect(pureReferred.platformFeeCents).toBe(1500); // $15.00
    expect(pureReferred.referralCommissionCents).toBe(150); // $1.50
    expect(pureReferred.platformRemainderBeforeExpensesCents).toBe(1350); // $13.50
    expect(pureReferred.processorCostSupportedByPlatformRemainder).toBe(true);
    expect(pureReferred.platformNetAfterProcessingCents).toBe(1030); // $10.30

    // End-to-end DB & ledger verification: Miriam refers Britney
    const miriam = await createTestCreator("miriam", "Miriam", "miriam@divafans.test");
    const britney = await createTestCreator("britney", "Britney", "britney@divafans.test");

    const miriamViewer = await viewer(miriam.id);
    const britneyViewer = await viewer(britney.id);

    const link = await getOrCreateCreatorRecruitmentLink(miriamViewer);
    expect(link.recruitmentPath).toMatch(/^\/recruit\/diva-miriam-/);

    const preview = await resolveRecruitmentCode(link.recruitmentCode);
    expect(preview?.displayName).toBe("Diva Miriam");

    // Capture at signup & confirm at onboarding
    await captureCreatorReferralAtSignup({
      referredUserId: britney.id,
      recruitmentCode: link.recruitmentCode,
    });
    await confirmCreatorReferralOnboarding(britneyViewer, { acceptReferralTerms: true });

    // Registration alone creates ZERO financial balance
    expect(await referralBalance(miriam.id)).toEqual({ available: 0, onHold: 0 });

    // Fan makes a $100.00 (10000 cents) purchase from Diva Britney
    const pay = await createPayment(
      {
        kind: "tip",
        fanId: s.memberId,
        creatorId: britney.id,
        targetId: null,
        amountCents: 10000,
        currency: "USD",
        provider: "mock",
        idempotencyKey: "sale:britney:100",
      },
      { testing: true },
    );
    await attachProviderRef(pay.id, "ref_britney_100", { testing: true });
    const outcome = await applyEvent(
      "mock",
      {
        eventId: "ev_britney_100",
        type: "payment.succeeded",
        providerRef: "ref_britney_100",
        amountCents: 10000,
        currency: "USD",
      },
      "{}",
      { testing: true },
    );
    expect(outcome).toBe("applied");

    // Britney receives $85.00 (8500 cents) — never reduced by referral!
    expect(await creatorBalance(britney.id)).toEqual({ available: 8500, onHold: 0 });
    // Miriam receives $1.50 (150 cents) in referral balance
    expect(await referralBalance(miriam.id)).toEqual({ available: 150, onHold: 0 });

    // Platform fees ledger entry is $13.50 (1350 cents)
    const platRow = await system((q) =>
      q.one<{ amt: string }>(`select amount_cents as amt from app.ledger_entries where payment_id = $1 and account = 'platform_fees'`, [
        pay.id,
      ]),
    );
    expect(Number(platRow?.amt)).toBe(1350);
  });

  it("3. Enforces single-level referral only (Miriam -> Britney -> Jade: Miriam earns $0 on Jade's sales) and blocks self/circular referrals and silent replacement", async () => {
    const miriam = await createTestCreator("miriam2", "Miriam", "miriam2@divafans.test");
    const britney = await createTestCreator("britney2", "Britney", "britney2@divafans.test");
    const jadeCreator = await createTestCreator("jadecreator", "Jade", "jadecreator@divafans.test");

    const miriamViewer = await viewer(miriam.id);
    const britneyViewer = await viewer(britney.id);
    const jadeCreatorViewer = await viewer(jadeCreator.id);

    const miriamLink = await getOrCreateCreatorRecruitmentLink(miriamViewer);
    const britneyLink = await getOrCreateCreatorRecruitmentLink(britneyViewer);
    const jadeLink = await getOrCreateCreatorRecruitmentLink(jadeCreatorViewer);

    // Self-referral is blocked
    await expect(
      captureCreatorReferralAtSignup({
        referredUserId: miriam.id,
        recruitmentCode: miriamLink.recruitmentCode,
      }),
    ).rejects.toMatchObject({ code: "validation" });

    // Miriam -> Britney
    await captureCreatorReferralAtSignup({
      referredUserId: britney.id,
      recruitmentCode: miriamLink.recruitmentCode,
    });
    await confirmCreatorReferralOnboarding(britneyViewer, { acceptReferralTerms: true });

    // Britney -> Jade
    await captureCreatorReferralAtSignup({
      referredUserId: jadeCreator.id,
      recruitmentCode: britneyLink.recruitmentCode,
    });
    await confirmCreatorReferralOnboarding(jadeCreatorViewer, { acceptReferralTerms: true });

    // Circular referral (Jade -> Miriam when Miriam -> Britney -> Jade) is blocked!
    await expect(
      captureCreatorReferralAtSignup({
        referredUserId: miriam.id,
        recruitmentCode: jadeLink.recruitmentCode,
      }),
    ).rejects.toMatchObject({ code: "validation" });

    // Silent replacement of Britney's referrer to Jade is blocked!
    await expect(
      captureCreatorReferralAtSignup({
        referredUserId: britney.id,
        recruitmentCode: jadeLink.recruitmentCode,
      }),
    ).rejects.toMatchObject({ code: "conflict" });

    // Now Jade makes a $100.00 (10000 cents) sale:
    // - Jade earns $85.00 (8500 cents)
    // - Britney (direct referrer) earns $1.50 (150 cents)
    // - Miriam (2 levels up) earns $0.00 (0 cents)!
    const pay = await createPayment(
      {
        kind: "ppv",
        fanId: s.memberId,
        creatorId: jadeCreator.id,
        targetId: null,
        amountCents: 10000,
        currency: "USD",
        provider: "mock",
        idempotencyKey: "sale:jade:100",
      },
      { testing: true },
    );
    await attachProviderRef(pay.id, "ref_jade_100", { testing: true });
    await applyEvent(
      "mock",
      {
        eventId: "ev_jade_100",
        type: "payment.succeeded",
        providerRef: "ref_jade_100",
        amountCents: 10000,
        currency: "USD",
      },
      "{}",
      { testing: true },
    );

    expect(await creatorBalance(jadeCreator.id)).toEqual({ available: 8500, onHold: 0 });
    expect(await referralBalance(britney.id)).toEqual({ available: 150, onHold: 0 });
    expect(await referralBalance(miriam.id)).toEqual({ available: 0, onHold: 0 });

    // Authorized audited owner override works and logs audit event
    const ownerViewer = await viewer(s.jadeUserId);
    const reassigned = await adminReassignCreatorReferrer(ownerViewer, {
      referredCreatorId: jadeCreator.id,
      newReferrerCreatorId: miriam.id,
      reason: "Verified support ticket correction #402",
    });
    expect(reassigned.referrerCreatorId).toBe(miriam.id);
  });

  it("4. Unreferred sale creates no referral liability ($85 creator, $15 platform, $0 referral)", async () => {
    const solo = await createTestCreator("solodiva", "Solange", "solange@divafans.test");

    const pay = await createPayment(
      {
        kind: "tip",
        fanId: s.memberId,
        creatorId: solo.id,
        targetId: null,
        amountCents: 10000,
        currency: "USD",
        provider: "mock",
        idempotencyKey: "sale:solo:100",
      },
      { testing: true },
    );
    await attachProviderRef(pay.id, "ref_solo_100", { testing: true });
    await applyEvent(
      "mock",
      {
        eventId: "ev_solo_100",
        type: "payment.succeeded",
        providerRef: "ref_solo_100",
        amountCents: 10000,
        currency: "USD",
      },
      "{}",
      { testing: true },
    );

    expect(await creatorBalance(solo.id)).toEqual({ available: 8500, onHold: 0 });
    const commCount = await system((q) =>
      q.one<{ n: number }>(`select count(*)::int as n from app.referral_commissions where payment_id = $1`, [pay.id]),
    );
    expect(commCount?.n).toBe(0);

    const platRow = await system((q) =>
      q.one<{ amt: string }>(`select amount_cents as amt from app.ledger_entries where payment_id = $1 and account = 'platform_fees'`, [
        pay.id,
      ]),
    );
    expect(Number(platRow?.amt)).toBe(1500);
  });

  it("5 & 6. Full and partial refunds reverse exact creator, referral, and platform allocations proportionately, and duplicate webhooks do not duplicate money or commissions", async () => {
    const miriam = await createTestCreator("miriam_ref", "Miriam", "miriam_ref@divafans.test");
    const britney = await createTestCreator("britney_ref", "Britney", "britney_ref@divafans.test");

    const miriamViewer = await viewer(miriam.id);
    const britneyViewer = await viewer(britney.id);
    const link = await getOrCreateCreatorRecruitmentLink(miriamViewer);
    await captureCreatorReferralAtSignup({ referredUserId: britney.id, recruitmentCode: link.recruitmentCode });
    await confirmCreatorReferralOnboarding(britneyViewer, { acceptReferralTerms: true });

    const pay = await createPayment(
      {
        kind: "tip",
        fanId: s.memberId,
        creatorId: britney.id,
        targetId: null,
        amountCents: 10000,
        currency: "USD",
        provider: "mock",
        idempotencyKey: "sale:refund:100",
      },
      { testing: true },
    );
    await attachProviderRef(pay.id, "ref_refund_100", { testing: true });
    await applyEvent(
      "mock",
      {
        eventId: "ev_refund_succeed",
        type: "payment.succeeded",
        providerRef: "ref_refund_100",
        amountCents: 10000,
        currency: "USD",
      },
      "{}",
      { testing: true },
    );

    // Duplicate payment.succeeded webhook is ignored as duplicate
    const dupSucceed = await applyEvent(
      "mock",
      {
        eventId: "ev_refund_succeed",
        type: "payment.succeeded",
        providerRef: "ref_refund_100",
        amountCents: 10000,
        currency: "USD",
      },
      "{}",
      { testing: true },
    );
    expect(dupSucceed).toBe("duplicate");
    expect(await creatorBalance(britney.id)).toEqual({ available: 8500, onHold: 0 });
    expect(await referralBalance(miriam.id)).toEqual({ available: 150, onHold: 0 });

    // 40% Partial Refund ($40.00 = 4000 cents):
    // Reverses $34.00 (3400 cents) from Britney, $0.60 (60 cents) from Miriam, $5.40 (540 cents) from Platform
    const partial = await applyRefund(
      "mock",
      {
        eventId: "ev_partial_40",
        providerRef: "ref_refund_100",
        refundAmountCents: 4000,
        currency: "USD",
      },
      { testing: true },
    );
    expect(partial).toEqual({
      outcome: "applied",
      creatorReversedCents: 3400,
      referralReversedCents: 60,
      platformNetReversedCents: 540,
    });
    expect(await creatorBalance(britney.id)).toEqual({ available: 5100, onHold: 0 });
    expect(await referralBalance(miriam.id)).toEqual({ available: 90, onHold: 0 });

    // Duplicate partial refund webhook does not double-reverse
    const dupPartial = await applyRefund(
      "mock",
      {
        eventId: "ev_partial_40",
        providerRef: "ref_refund_100",
        refundAmountCents: 4000,
        currency: "USD",
      },
      { testing: true },
    );
    expect(dupPartial.outcome).toBe("duplicate");

    // Remaining 60% Refund ($60.00 = 6000 cents) brings all allocations to 0
    const rest = await applyRefund(
      "mock",
      {
        eventId: "ev_rest_60",
        providerRef: "ref_refund_100",
        refundAmountCents: 6000,
        currency: "USD",
      },
      { testing: true },
    );
    expect(rest).toEqual({
      outcome: "applied",
      creatorReversedCents: 5100,
      referralReversedCents: 90,
      platformNetReversedCents: 810,
    });
    expect(await creatorBalance(britney.id)).toEqual({ available: 0, onHold: 0 });
    expect(await referralBalance(miriam.id)).toEqual({ available: 0, onHold: 0 });

    // Ledger remains strictly balanced (sum = 0)
    const sum = await system((q) => q.one<{ n: string }>(`select coalesce(sum(amount_cents), 0) as n from app.ledger_entries`));
    expect(Number(sum?.n)).toBe(0);
  });

  it("7 & 8. Concurrent withdrawal requests cannot overspend available balance; initial request is processing (never paid immediately); failed payouts restore available balance", async () => {
    const creator = await createTestCreator("withdraw_diva", "Celine", "celine@divafans.test");
    const cViewer = await viewer(creator.id);

    // Onboard creator payout account in France (supported European Connect country)
    await onboardCreatorPayoutAccount(cViewer, {
      residenceCountry: "FR",
      entityType: "individual",
      currency: "EUR",
      bankName: "BNP Paribas",
      accountLast4: "4821",
      kycVerified: true,
    });

    // Credit $100.00 (10000 cents) sale -> $85.00 (8500 cents) creator earnings
    const pay = await createPayment(
      {
        kind: "tip",
        fanId: s.memberId,
        creatorId: creator.id,
        targetId: null,
        amountCents: 10000,
        currency: "USD",
        provider: "mock",
        idempotencyKey: "sale:celine:100",
      },
      { testing: true },
    );
    await attachProviderRef(pay.id, "ref_celine_100", { testing: true });
    await applyEvent(
      "mock",
      {
        eventId: "ev_celine_100",
        type: "payment.succeeded",
        providerRef: "ref_celine_100",
        amountCents: 10000,
        currency: "USD",
      },
      "{}",
      { testing: true },
    );

    // Set settlement hold days to 0 for immediate maturity testing (since app.ledger_entries is strictly append-only!)
    await updatePlatformFinancialConfig({ settlementHoldDays: 0 });

    // Below $50 minimum ($40.00 = 4000 cents) is rejected
    await expect(
      requestCreatorWithdrawal(
        cViewer,
        { amountCents: 4000, currency: "USD", idempotencyKey: "wd_below_min" },
        { testing: true },
      ),
    ).rejects.toMatchObject({ code: "validation" });

    // Launch TWO concurrent $60.00 (6000 cents) withdrawal requests against an $85.00 (8500 cents) available balance!
    // Exactly one must succeed and the other must be rejected with insufficient balance!
    const results = await Promise.allSettled([
      requestCreatorWithdrawal(
        cViewer,
        { amountCents: 6000, currency: "USD", idempotencyKey: "wd_concurrent_1" },
        { testing: true },
      ),
      requestCreatorWithdrawal(
        cViewer,
        { amountCents: 6000, currency: "USD", idempotencyKey: "wd_concurrent_2" },
        { testing: true },
      ),
    ]);

    const fulfilled = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof requestCreatorWithdrawal>>> => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const winPayout = fulfilled[0].value;
    // Initial withdrawal status is 'processing' (NEVER 'paid' before webhook confirmation!)
    expect(winPayout.status).toBe("processing");
    expect(winPayout.transferRef).toMatch(/^tr_sandbox_/);
    expect(winPayout.bankPayoutRef).toBeNull();

    // Available balance is now $25.00 (2500 cents)
    expect(await creatorBalance(creator.id)).toEqual({ available: 2500, onHold: 0 });

    // Simulate payout failure webhook -> restores $60.00 back to creator's available balance ($85.00 total)
    const failRes = await applyCreatorPayoutWebhook(
      {
        eventId: "ev_payout_fail_1",
        payoutId: winPayout.id,
        status: "failed",
        failureReason: "IBAN account closed",
      },
      { testing: true },
    );
    expect(failRes).toEqual({ outcome: "applied", status: "failed" });
    expect(await creatorBalance(creator.id)).toEqual({ available: 8500, onHold: 0 });

    // Duplicate failure webhook does not double-credit
    const dupFail = await applyCreatorPayoutWebhook(
      {
        eventId: "ev_payout_fail_1",
        payoutId: winPayout.id,
        status: "failed",
      },
      { testing: true },
    );
    expect(dupFail.outcome).toBe("duplicate");
    expect(await creatorBalance(creator.id)).toEqual({ available: 8500, onHold: 0 });

    // Now request a fresh $55.00 (5500 cents) withdrawal and settle it via 'paid' webhook
    const secondPayout = await requestCreatorWithdrawal(
      cViewer,
      { amountCents: 5500, currency: "USD", idempotencyKey: "wd_settle_ok" },
      { testing: true },
    );
    expect(secondPayout.status).toBe("processing");

    const paidRes = await applyCreatorPayoutWebhook(
      {
        eventId: "ev_payout_paid_1",
        payoutId: secondPayout.id,
        status: "paid",
        bankPayoutRef: "po_sandbox_settled_99",
      },
      { testing: true },
    );
    expect(paidRes).toEqual({ outcome: "applied", status: "paid" });
    expect(await creatorBalance(creator.id)).toEqual({ available: 3000, onHold: 0 });

    const detailed = await myDetailedStudioEarnings(cViewer);
    expect(detailed.detailedBalances[0]?.withdrawnCompletedCents).toBe(5500);
  });

  it("9 & 10. Country eligibility gates paid monetization (Europe supported; Morocco & GCC require Global Payouts/adapter waitlist); bank updates require password reauthentication, audit log & notification, and reject raw account numbers/IBANs", async () => {
    const caps = await listCountryPayoutCapabilities();
    expect(caps.length).toBeGreaterThanOrEqual(35);

    // Individual European countries are supported via US Stripe Connect Cross-Border Payouts
    const frEval = await evaluateCreatorCountryEligibility("FR", "individual");
    expect(frEval.eligibleForPaidMonetization).toBe(true);

    // Morocco (MA) requires Global Payouts / corridor adapter and blocks self-serve Connect monetization with waitlist
    const maEval = await evaluateCreatorCountryEligibility("MA", "individual");
    expect(maEval.eligibleForPaidMonetization).toBe(false);
    expect(maEval.canJoinWaitlist).toBe(true);
    expect(maEval.blockingReason).toContain("Morocco");

    // Individual GCC countries (AE, SA, QA, KW, BH, OM) evaluated individually
    for (const gcc of ["AE", "SA", "QA", "KW", "BH", "OM"]) {
      const gccEval = await evaluateCreatorCountryEligibility(gcc, "individual");
      expect(gccEval.eligibleForPaidMonetization).toBe(false);
      expect(gccEval.canJoinWaitlist).toBe(true);
    }

    // Attempting to onboard a creator in Morocco (MA) blocks paid monetization and records them on the waitlist
    const maCreator = await createTestCreator("amira_ma", "Amira", "amira@divafans.test", "CorrectHorseBattery1!");
    const maViewer = await viewer(maCreator.id);

    await expect(
      onboardCreatorPayoutAccount(maViewer, {
        residenceCountry: "MA",
        entityType: "individual",
        currency: "MAD",
        bankName: "Attijariwafa Bank",
        accountLast4: "1122",
      }),
    ).rejects.toMatchObject({ code: "validation" });

    const waitlistRow = await system((q) =>
      q.one<{ residence_country: string; status: string }>(
        `select residence_country::text, status from app.creator_monetization_waitlist where creator_id = $1`,
        [maCreator.id],
      ),
    );
    expect(waitlistRow).toEqual({ residence_country: "MA", status: "waitlisted" });

    // Onboard a creator in Germany (DE) and test bank destination update security
    const deCreator = await createTestCreator("klara_de", "Klara", "klara@divafans.test", "KlaraSecret99!");
    const deViewer = await viewer(deCreator.id);

    // Raw IBAN or full account number is rejected
    await expect(
      onboardCreatorPayoutAccount(deViewer, {
        residenceCountry: "DE",
        entityType: "individual",
        currency: "EUR",
        bankName: "Deutsche Bank DE89370400440532013000",
        accountLast4: "3000",
      }),
    ).rejects.toMatchObject({ code: "validation" });

    const onboarded = await onboardCreatorPayoutAccount(deViewer, {
      residenceCountry: "DE",
      entityType: "individual",
      currency: "EUR",
      bankName: "Deutsche Bank",
      accountLast4: "3000",
    });
    expect(onboarded.maskedAccount).toBe("•••• 3000");

    // Updating bank destination with wrong password fails
    await expect(
      updateCreatorBankDestination(deViewer, {
        password: "WrongPassword!",
        bankName: "Commerzbank",
        accountLast4: "9876",
        currency: "EUR",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });

    // Updating bank destination with correct password succeeds, writes audit log, and sends notification
    const updated = await updateCreatorBankDestination(deViewer, {
      password: "KlaraSecret99!",
      bankName: "Commerzbank",
      accountLast4: "9876",
      currency: "EUR",
    });
    expect(updated.bankName).toBe("Commerzbank");
    expect(updated.maskedAccount).toBe("•••• 9876");

    const auditRow = await system((q) =>
      q.one<{ action: string }>(
        `select action from app.audit_log where actor_id = $1 and action = 'creator.bank_destination_updated'`,
        [deCreator.id],
      ),
    );
    expect(auditRow?.action).toBe("creator.bank_destination_updated");

    const notifRow = await system((q) =>
      q.one<{ data: { title: string } }>(
        `select data from app.notifications where user_id = $1 order by available_at desc limit 1`,
        [deCreator.id],
      ),
    );
    expect(notifRow?.data.title).toContain("Commerzbank (•••• 9876)");
  });

  it("11 & 12. Owner distributions deduct both 85% creator and 1.5% referral liabilities before splitting 50/50 between Jade and Kael Veyre; historical transaction allocations remain unchanged after config updates", async () => {
    const miriam = await createTestCreator("miriam_hist", "Miriam", "miriam_hist@divafans.test");
    const britney = await createTestCreator("britney_hist", "Britney", "britney_hist@divafans.test");

    const miriamViewer = await viewer(miriam.id);
    const britneyViewer = await viewer(britney.id);
    const link = await getOrCreateCreatorRecruitmentLink(miriamViewer);
    await captureCreatorReferralAtSignup({ referredUserId: britney.id, recruitmentCode: link.recruitmentCode });
    await confirmCreatorReferralOnboarding(britneyViewer, { acceptReferralTerms: true });

    // 1. Process a $100.00 (10000 cents) sale at the default 15% platform fee / 10% of fee referral rate
    const pay1 = await createPayment(
      {
        kind: "tip",
        fanId: s.memberId,
        creatorId: britney.id,
        targetId: null,
        amountCents: 10000,
        currency: "USD",
        provider: "mock",
        idempotencyKey: "sale:hist:1",
      },
      { testing: true },
    );
    await attachProviderRef(pay1.id, "ref_hist_1", { testing: true });
    await applyEvent(
      "mock",
      {
        eventId: "ev_hist_1",
        type: "payment.succeeded",
        providerRef: "ref_hist_1",
        amountCents: 10000,
        currency: "USD",
      },
      "{}",
      { testing: true },
    );

    // 2. Verify owner waterfall deducts both $85.00 creator liability AND $1.50 referral liability before 50/50 split
    const wf = calculateWaterfallPure({
      grossSettledFanCollectionsMinor: 10000,
      applicableTaxesMinor: 0,
      transactionReversalsMinor: 0,
      creatorContractualEarningsMinor: 8500,
      referralLiabilitiesMinor: 150,
      processingAndSettlementCostsMinor: 150,
      approvedOperatingExpensesMinor: 100,
      reserveAllocationsMinor: 100,
    });
    expect(wf.platformRevenueBeforeCostsMinor).toBe(1350); // $13.50 after $85 creator + $1.50 referral
    expect(wf.netDistributableEarningsMinor).toBe(1000); // $10.00 after $3.50 costs/expenses/reserves
    expect(wf.jadeAllocationMinor).toBe(500); // $5.00 (50% OWNER_001 Jade)
    expect(wf.kaelAllocationMinor).toBe(500); // $5.00 (50% OWNER_002 Kael Veyre)

    // Also verify DB-backed distribution period calculation records referral_liabilities_minor
    const jadeOwnerViewer = await viewer(s.jadeUserId);
    const period = await createOrCalculateDistributionPeriod(jadeOwnerViewer, {
      periodStart: new Date(Date.now() - 3600_000),
      periodEnd: new Date(Date.now() + 3600_000),
      currency: "USD",
    });
    const periodRow = await system((q) =>
      q.one<{ creator_liabilities_minor: string; referral_liabilities_minor: string; platform_revenue_minor: string }>(
        `select creator_liabilities_minor, referral_liabilities_minor, platform_revenue_minor
           from app.financial_distribution_periods where id = $1`,
        [period.periodId],
      ),
    );
    expect(Number(periodRow?.creator_liabilities_minor)).toBe(8500);
    expect(Number(periodRow?.referral_liabilities_minor)).toBe(150);
    expect(Number(periodRow?.platform_revenue_minor)).toBe(1350);

    // 3. Update platform financial configuration (e.g. change platformFeeBps to 2000 and referralFeeBpsOfPlatform to 500)
    // and verify that historical payment `pay1` keeps its exact snapshot (1500 bps, $85.00, $1.50, $13.50)!
    await expect(() => validateStatementDescriptorCandidate("Creator Platform")).toThrow();
    await updatePlatformFinancialConfig({
      formationState: "WY",
      platformFeeBps: 2000,
      referralFeeBpsOfPlatform: 500,
      fanStatementDescriptor: "DIVAFANS CLUB",
    });

    const cfgAfter = await getPlatformFinancialConfig();
    expect(cfgAfter.formationState).toBe("WY");
    expect(cfgAfter.platformFeeBps).toBe(2000);
    expect(describePaymentIdentities(cfgAfter).fanCardStatement.checkoutNotice).toContain("DIVAFANS CLUB");

    const snap1 = await system((q) =>
      q.one<{
        fee_bps: number;
        creator_share_bps: number;
        referral_fee_bps_of_platform: number;
        creator_allocation_cents: number;
        platform_fee_cents: number;
        referral_commission_cents: number;
        platform_net_cents: number;
      }>(
        `select fee_bps, creator_share_bps, referral_fee_bps_of_platform,
                creator_allocation_cents, platform_fee_cents, referral_commission_cents, platform_net_cents
           from app.payments where id = $1`,
        [pay1.id],
      ),
    );
    expect(snap1).toEqual({
      fee_bps: 1500,
      creator_share_bps: 8500,
      referral_fee_bps_of_platform: 1000,
      creator_allocation_cents: 8500,
      platform_fee_cents: 1500,
      referral_commission_cents: 150,
      platform_net_cents: 1350,
    });

    // Refunding `pay1` AFTER the config change still reverses the historical snapshot ($85.00 / $1.50 / $13.50), NOT the new 20% fee!
    const refAfterConfigChange = await applyRefund(
      "mock",
      {
        eventId: "ev_hist_1_refund",
        providerRef: "ref_hist_1",
        refundAmountCents: 10000,
        currency: "USD",
      },
      { testing: true },
    );
    expect(refAfterConfigChange).toEqual({
      outcome: "applied",
      creatorReversedCents: 8500,
      referralReversedCents: 150,
      platformNetReversedCents: 1350,
    });
  });
});
