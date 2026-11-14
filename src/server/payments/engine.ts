import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { system } from "@/server/db";
import { AppError } from "@/server/errors";
import { requireFeature } from "@/server/flags";
import { log } from "@/server/log";
import { audit } from "@/server/services/audit";
import {
  DEFAULT_PLATFORM_FEE_BPS,
  DEFAULT_REFERRAL_FEE_BPS_OF_PLATFORM,
  postingsFor,
  postingsForProportionalRefund,
  splitPurchaseAllocation,
} from "./ledger";
import { PAYMENT_POLICY } from "./policy";
import { transition, type PaymentEvent, type PaymentStatus } from "./state";
import type { VerifiedEvent } from "./webhook";

/**
 * Payment engine (system role). Provider-independent: providers create
 * checkouts and deliver verified events; this engine owns idempotency, the
 * state machine, the double-entry ledger, direct single-level creator referral
 * commissions, and entitlements.
 *
 * Every public entry point calls requireFeature("payments") — OFF by default
 * and refused in production until a provider is approved. Tests exercise the
 * engine with the mock provider and an explicit `{ testing: true }` bypass
 * that only works outside production.
 */
export type Opts = {
  testing?: boolean;
  feeBps?: number | null;
  referralFeeBpsOfPlatform?: number | null;
  refundRevokesAccess?: boolean;
};

function gate(o: Opts) {
  if (o.testing && process.env.NODE_ENV !== "production") return;
  requireFeature("payments");
}

export type NewPayment = {
  kind: "subscription" | "ppv" | "tip" | "paid_message";
  fanId: string;
  creatorId: string;
  targetId: string | null;
  amountCents: number;
  eligibleAmountCents?: number;
  taxCents?: number;
  discountCents?: number;
  processorFeeCents?: number;
  currency: string;
  provider: string;
  idempotencyKey: string;
};

/** Create (or return the existing) payment for an idempotency key. */
export async function createPayment(
  p: NewPayment,
  o: Opts = {},
): Promise<{ id: string; status: PaymentStatus; created: boolean }> {
  gate(o);
  const taxCents = p.taxCents ?? 0;
  const discountCents = p.discountCents ?? 0;
  const eligibleAmountCents = p.eligibleAmountCents ?? p.amountCents - taxCents;
  const processorFeeCents = p.processorFeeCents ?? 0;

  if (eligibleAmountCents <= 0) {
    throw new AppError("validation", "Eligible purchase amount must be greater than zero.");
  }

  return system(async (q) => {
    const ins = await q.one<{ id: string; status: PaymentStatus }>(
      `insert into app.payments (
         kind, fan_id, creator_id, target_id, amount_cents,
         eligible_amount_cents, tax_cents, discount_cents, processor_fee_cents,
         currency, provider, idempotency_key
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       on conflict (idempotency_key) do nothing
       returning id, status`,
      [
        p.kind,
        p.fanId,
        p.creatorId,
        p.targetId,
        p.amountCents,
        eligibleAmountCents,
        taxCents,
        discountCents,
        processorFeeCents,
        p.currency,
        p.provider,
        p.idempotencyKey,
      ],
    );
    if (ins) return { ...ins, created: true };
    const ex = await q.one<{ id: string; status: PaymentStatus; amount_cents: number; fan_id: string }>(
      `select id, status, amount_cents, fan_id from app.payments where idempotency_key = $1`,
      [p.idempotencyKey],
    );
    if (!ex || ex.amount_cents !== p.amountCents || ex.fan_id !== p.fanId) {
      throw new AppError("conflict", "Idempotency key reused with different details.");
    }
    return { id: ex.id, status: ex.status, created: false };
  });
}

export async function attachProviderRef(paymentId: string, providerRef: string, o: Opts = {}) {
  gate(o);
  await system((q) =>
    q.query(`update app.payments set provider_ref = $2, updated_at = now() where id = $1 and provider_ref is null`, [
      paymentId,
      providerRef,
    ]),
  );
}

const EVENT: Record<VerifiedEvent["type"], PaymentEvent> = {
  "payment.authorized": "authorized",
  "payment.succeeded": "succeeded",
  "payment.failed": "failed",
  "payment.canceled": "canceled",
  "payment.refunded": "refunded",
  "dispute.opened": "dispute_opened",
  "dispute.won": "dispute_won",
  "dispute.lost": "dispute_lost",
};

export type ApplyResult = "applied" | "duplicate" | "ignored" | "rejected";

/**
 * Apply one VERIFIED provider event, exactly once. Signature verification
 * happens before this (adapter + verifyHmac). Amount and currency must match
 * the payment; illegal transitions are recorded and ignored.
 */
export async function applyEvent(
  provider: string,
  ev: VerifiedEvent,
  rawBody: string,
  o: Opts = {},
): Promise<ApplyResult> {
  gate(o);
  return system(async (q) => {
    const hash = createHash("sha256").update(rawBody).digest("hex");
    const evRow = await q.one<{ id: number }>(
      `insert into app.payment_events (provider, event_id, type, payload_sha256) values ($1, $2, $3, $4)
       on conflict (provider, event_id) do nothing returning id`,
      [provider, ev.eventId, ev.type, hash],
    );
    if (!evRow) return "duplicate";

    const done = async (
      outcome: Exclude<ApplyResult, "duplicate">,
      note: string | null,
      paymentId: string | null = null,
    ) => {
      await q.query(`update app.payment_events set outcome = $2, note = $3, payment_id = $4 where id = $1`, [
        evRow.id,
        outcome,
        note,
        paymentId,
      ]);
      return outcome;
    };

    const pay = await q.one<{
      id: string;
      kind: NewPayment["kind"];
      status: PaymentStatus;
      amount_cents: number;
      eligible_amount_cents: number | null;
      tax_cents: number;
      discount_cents: number;
      processor_fee_cents: number;
      refunded_amount_cents: number;
      currency: string;
      fan_id: string;
      creator_id: string;
      target_id: string | null;
      fee_bps: number | null;
      referral_fee_bps_of_platform: number | null;
      referrer_creator_id: string | null;
      creator_allocation_cents: number | null;
      platform_fee_cents: number | null;
      referral_commission_cents: number;
      platform_net_cents: number | null;
    }>(
      `select id, kind, status, amount_cents, eligible_amount_cents, tax_cents, discount_cents,
              processor_fee_cents, refunded_amount_cents, currency, fan_id, creator_id, target_id,
              fee_bps, referral_fee_bps_of_platform, referrer_creator_id,
              creator_allocation_cents, platform_fee_cents, referral_commission_cents, platform_net_cents
         from app.payments
        where provider = $1 and provider_ref = $2
        for update`,
      [provider, ev.providerRef],
    );

    if (!pay) return done("rejected", "unknown payment");
    if (pay.amount_cents !== ev.amountCents || pay.currency !== ev.currency) {
      return done("rejected", "amount or currency mismatch", pay.id);
    }
    const next = transition(pay.status, EVENT[ev.type]);
    if (!next) return done("ignored", `illegal transition ${pay.status} → ${ev.type}`, pay.id);

    const money = ["succeeded", "refunded", "dispute_opened", "dispute_won", "dispute_lost"] as const;
    const e = EVENT[ev.type];

    if ((money as readonly string[]).includes(e)) {
      const cfg = await q.one<{
        platform_fee_bps: number;
        referral_fee_bps_of_platform: number;
        fan_statement_descriptor: string | null;
      }>(
        `select platform_fee_bps, referral_fee_bps_of_platform, fan_statement_descriptor
           from app.platform_financial_config
          where id = 1`,
      );

      const bps =
        e === "succeeded"
          ? o.feeBps !== undefined
            ? o.feeBps
            : (cfg?.platform_fee_bps ?? DEFAULT_PLATFORM_FEE_BPS)
          : pay.fee_bps;

      if (bps == null) {
        throw new AppError("validation", "Platform fee is not configured (commercial decision pending).");
      }

      const eligibleAmount = pay.eligible_amount_cents ?? pay.amount_cents - (pay.tax_cents ?? 0);

      // Single-level direct creator referral lookup ONLY at succeeded time; historical snapshot used thereafter.
      let referrerCreatorId: string | null = pay.referrer_creator_id;
      let refBpsOfPlatform: number =
        pay.referral_fee_bps_of_platform ??
        (o.referralFeeBpsOfPlatform !== undefined && o.referralFeeBpsOfPlatform !== null
          ? o.referralFeeBpsOfPlatform
          : (cfg?.referral_fee_bps_of_platform ?? DEFAULT_REFERRAL_FEE_BPS_OF_PLATFORM));

      if (e === "succeeded") {
        // Look up ONLY 1 direct level (referred_creator_id = pay.creator_id). Never recursive!
        const rec = await q.one<{ referrer_creator_id: string }>(
          `select r.referrer_creator_id
             from app.creator_recruitments r
             join app.users u on u.id = r.referrer_creator_id and u.status = 'active' and u.role = 'creator'
             join app.creators c on c.user_id = r.referrer_creator_id
            where r.referred_creator_id = $1
              and r.status = 'confirmed'
              and r.agreement_accepted_at is not null
              and r.referrer_creator_id <> $1`,
          [pay.creator_id],
        );
        referrerCreatorId = rec?.referrer_creator_id ?? null;
        if (!referrerCreatorId) {
          refBpsOfPlatform = 0;
        }
      }

      const txn = randomUUID();

      if (e === "refunded" && pay.refunded_amount_cents > 0) {
        // If partial refunds already occurred, only reverse the remaining unrefunded portion
        const remaining = eligibleAmount - pay.refunded_amount_cents;
        if (remaining > 0) {
          const prop = postingsForProportionalRefund({
            creatorId: pay.creator_id,
            referrerCreatorId,
            eligibleAmountCents: eligibleAmount,
            creatorAllocationCents: pay.creator_allocation_cents ?? eligibleAmount - Math.floor((eligibleAmount * bps) / 10000),
            referralCommissionCents: pay.referral_commission_cents ?? 0,
            platformNetCents: pay.platform_net_cents ?? Math.floor((eligibleAmount * bps) / 10000),
            alreadyRefundedAmountCents: pay.refunded_amount_cents,
            refundAmountCents: remaining,
          });
          for (const x of prop.postings) {
            await q.query(
              `insert into app.ledger_entries (txn_id, payment_id, account, amount_cents, currency, memo)
               values ($1, $2, $3, $4, $5, $6)`,
              [txn, pay.id, x.account, x.amountCents, pay.currency, x.memo],
            );
          }
        }
      } else {
        for (const x of postingsFor(e as (typeof money)[number], pay.creator_id, eligibleAmount, bps, {
          referrerCreatorId,
          referralFeeBpsOfPlatform: refBpsOfPlatform,
        })) {
          await q.query(
            `insert into app.ledger_entries (txn_id, payment_id, account, amount_cents, currency, memo)
             values ($1, $2, $3, $4, $5, $6)`,
            [txn, pay.id, x.account, x.amountCents, pay.currency, x.memo],
          );
        }
      }

      if (e === "succeeded") {
        const alloc = splitPurchaseAllocation({
          eligibleAmountCents: eligibleAmount,
          taxCents: pay.tax_cents ?? 0,
          discountCents: pay.discount_cents ?? 0,
          platformFeeBps: bps,
          referralFeeBpsOfPlatform: refBpsOfPlatform,
          hasEligibleReferrer: Boolean(referrerCreatorId),
          processorFeeCents: pay.processor_fee_cents ?? 0,
        });

        await q.query(
          `update app.payments
              set fee_bps = $2,
                  creator_share_bps = $3,
                  referral_fee_bps_of_platform = $4,
                  referrer_creator_id = $5,
                  eligible_amount_cents = $6,
                  creator_allocation_cents = $7,
                  platform_fee_cents = $8,
                  referral_commission_cents = $9,
                  platform_net_cents = $10,
                  statement_descriptor_snapshot = $11
            where id = $1`,
          [
            pay.id,
            alloc.platformFeeBps,
            alloc.creatorShareBps,
            alloc.referralFeeBpsOfPlatform,
            referrerCreatorId,
            alloc.eligibleAmountCents,
            alloc.creatorAllocationCents,
            alloc.platformFeeCents,
            alloc.referralCommissionCents,
            alloc.platformRemainderBeforeExpensesCents,
            cfg?.fan_statement_descriptor ?? "UNCONFIRMED_SANDBOX_DESCRIPTOR",
          ],
        );

        if (referrerCreatorId && alloc.referralCommissionCents > 0) {
          await q.query(
            `insert into app.referral_commissions (
               payment_id, referrer_creator_id, referred_creator_id, currency,
               eligible_purchase_cents, platform_fee_cents, referral_rate_bps_of_fee,
               commission_cents, status, ledger_txn_id
             )
             values ($1, $2, $3, $4, $5, $6, $7, $8, 'credited', $9)
             on conflict (payment_id) do nothing`,
            [
              pay.id,
              referrerCreatorId,
              pay.creator_id,
              pay.currency,
              alloc.eligibleAmountCents,
              alloc.platformFeeCents,
              alloc.referralFeeBpsOfPlatform,
              alloc.referralCommissionCents,
              txn,
            ],
          );
        }
      } else if (e === "refunded") {
        await q.query(
          `update app.payments set refunded_amount_cents = coalesce(eligible_amount_cents, amount_cents) where id = $1`,
          [pay.id],
        );
        await q.query(
          `update app.referral_commissions
              set refunded_commission_cents = commission_cents,
                  status = 'reversed',
                  updated_at = now()
            where payment_id = $1`,
          [pay.id],
        );
      } else if (e === "dispute_opened") {
        await q.query(
          `update app.referral_commissions set status = 'held', updated_at = now() where payment_id = $1`,
          [pay.id],
        );
      } else if (e === "dispute_won") {
        await q.query(
          `update app.referral_commissions set status = 'credited', updated_at = now() where payment_id = $1`,
          [pay.id],
        );
      } else if (e === "dispute_lost") {
        await q.query(
          `update app.referral_commissions
              set refunded_commission_cents = commission_cents,
                  status = 'reversed',
                  updated_at = now()
            where payment_id = $1`,
          [pay.id],
        );
      }
    }

    await q.query(`update app.payments set status = $2, updated_at = now() where id = $1`, [pay.id, next]);

    // Entitlements follow money: a successful payment grants the corresponding access.
    if (e === "succeeded" && pay.kind === "ppv" && pay.target_id) {
      await q.query(`insert into app.purchases (fan_id, post_id) values ($1, $2) on conflict do nothing`, [
        pay.fan_id,
        pay.target_id,
      ]);
    }
    if (e === "succeeded" && pay.kind === "paid_message" && pay.target_id) {
      await q.query(
        `insert into app.message_purchases (fan_id, message_id, payment_id) values ($1, $2, $3)
         on conflict (fan_id, message_id) do nothing`,
        [pay.fan_id, pay.target_id, pay.id],
      );
    }
    if (e === "succeeded" && pay.kind === "subscription" && pay.target_id) {
      const existingSub = await q.one<{ id: string }>(
        `select id from app.subscriptions where fan_id = $1 and creator_id = $2 order by current_period_end desc limit 1`,
        [pay.fan_id, pay.creator_id],
      );
      if (existingSub) {
        await q.query(
          `update app.subscriptions
              set tier_id = $2,
                  status = 'active',
                  cancel_at_period_end = false,
                  canceled_at = null,
                  current_period_end = greatest(current_period_end, now()) + interval '30 days'
            where id = $1`,
          [existingSub.id, pay.target_id],
        );
      } else {
        await q.query(
          `insert into app.subscriptions (fan_id, creator_id, tier_id, status, current_period_end)
           values ($1, $2, $3, 'active', now() + interval '30 days')`,
          [pay.fan_id, pay.creator_id, pay.target_id],
        );
      }
    }

    // Refund or chargeback: the purchase stays (PAY2) unless the policy says otherwise.
    const revoke =
      o.testing && process.env.NODE_ENV !== "production" && o.refundRevokesAccess !== undefined
        ? o.refundRevokesAccess
        : PAYMENT_POLICY.refundRevokesAccess;
    if (revoke && (next === "refunded" || next === "charged_back") && pay.kind === "ppv" && pay.target_id) {
      const gone = await q.one(
        `delete from app.purchases x where x.fan_id = $1 and x.post_id = $2
            and not exists (select 1 from app.payments p where p.fan_id = $1 and p.target_id = $2 and p.kind = 'ppv' and p.status = 'succeeded' and p.id <> $3)
          returning 1`,
        [pay.fan_id, pay.target_id, pay.id],
      );
      if (gone) {
        await audit(q, {
          actorId: null,
          action: "purchase.revoked",
          targetType: "post",
          targetId: pay.target_id,
          metadata: { payment: pay.id, reason: next },
        });
      }
    }
    await audit(q, {
      actorId: null,
      action: `payment.${next}`,
      targetType: "payment",
      targetId: pay.id,
      metadata: { provider, event: ev.type },
    });
    return done("applied", null, pay.id);
  });
}

/**
 * Apply a partial or full refund to a succeeded payment using its historical snapshot terms.
 * Guarantees idempotency via `eventId` and proportional reversal across creator (85%),
 * direct referrer (1.5%), and platform (13.5%).
 */
export async function applyRefund(
  provider: string,
  input: {
    eventId: string;
    providerRef: string;
    refundAmountCents: number;
    currency: string;
    reason?: string;
  },
  o: Opts = {},
): Promise<{
  outcome: ApplyResult;
  creatorReversedCents: number;
  referralReversedCents: number;
  platformNetReversedCents: number;
}> {
  gate(o);
  return system(async (q) => {
    const hash = createHash("sha256")
      .update(JSON.stringify({ provider, ...input }))
      .digest("hex");
    const evRow = await q.one<{ id: number }>(
      `insert into app.payment_events (provider, event_id, type, payload_sha256)
       values ($1, $2, 'payment.refunded', $3)
       on conflict (provider, event_id) do nothing returning id`,
      [provider, input.eventId, hash],
    );
    if (!evRow) {
      return {
        outcome: "duplicate",
        creatorReversedCents: 0,
        referralReversedCents: 0,
        platformNetReversedCents: 0,
      };
    }

    const pay = await q.one<{
      id: string;
      status: PaymentStatus;
      amount_cents: number;
      eligible_amount_cents: number | null;
      refunded_amount_cents: number;
      currency: string;
      creator_id: string;
      referrer_creator_id: string | null;
      fee_bps: number | null;
      creator_allocation_cents: number | null;
      referral_commission_cents: number;
      platform_net_cents: number | null;
    }>(
      `select id, status, amount_cents, eligible_amount_cents, refunded_amount_cents,
              currency, creator_id, referrer_creator_id, fee_bps,
              creator_allocation_cents, referral_commission_cents, platform_net_cents
         from app.payments
        where provider = $1 and provider_ref = $2
        for update`,
      [provider, input.providerRef],
    );

    if (!pay || pay.currency !== input.currency) {
      await q.query(`update app.payment_events set outcome = 'rejected', note = 'unknown or mismatched payment' where id = $1`, [
        evRow.id,
      ]);
      return { outcome: "rejected", creatorReversedCents: 0, referralReversedCents: 0, platformNetReversedCents: 0 };
    }
    if (pay.status !== "succeeded") {
      await q.query(
        `update app.payment_events set outcome = 'ignored', note = 'payment not in succeeded state', payment_id = $2 where id = $1`,
        [evRow.id, pay.id],
      );
      return { outcome: "ignored", creatorReversedCents: 0, referralReversedCents: 0, platformNetReversedCents: 0 };
    }

    const eligibleAmount = pay.eligible_amount_cents ?? pay.amount_cents;
    if (
      !Number.isInteger(input.refundAmountCents) ||
      input.refundAmountCents <= 0 ||
      pay.refunded_amount_cents + input.refundAmountCents > eligibleAmount
    ) {
      await q.query(
        `update app.payment_events set outcome = 'rejected', note = 'invalid refund amount', payment_id = $2 where id = $1`,
        [evRow.id, pay.id],
      );
      return { outcome: "rejected", creatorReversedCents: 0, referralReversedCents: 0, platformNetReversedCents: 0 };
    }

    const bps = pay.fee_bps ?? DEFAULT_PLATFORM_FEE_BPS;
    const creatorAlloc = pay.creator_allocation_cents ?? eligibleAmount - Math.floor((eligibleAmount * bps) / 10000);
    const referralAlloc = pay.referral_commission_cents ?? 0;
    const platformNetAlloc = pay.platform_net_cents ?? eligibleAmount - creatorAlloc - referralAlloc;

    const prop = postingsForProportionalRefund({
      creatorId: pay.creator_id,
      referrerCreatorId: pay.referrer_creator_id,
      eligibleAmountCents: eligibleAmount,
      creatorAllocationCents: creatorAlloc,
      referralCommissionCents: referralAlloc,
      platformNetCents: platformNetAlloc,
      alreadyRefundedAmountCents: pay.refunded_amount_cents,
      refundAmountCents: input.refundAmountCents,
    });

    const txn = randomUUID();
    for (const x of prop.postings) {
      await q.query(
        `insert into app.ledger_entries (txn_id, payment_id, account, amount_cents, currency, memo)
         values ($1, $2, $3, $4, $5, $6)`,
        [txn, pay.id, x.account, x.amountCents, pay.currency, x.memo],
      );
    }

    const newRefundedTotal = pay.refunded_amount_cents + input.refundAmountCents;
    const isFullyRefunded = newRefundedTotal >= eligibleAmount;

    await q.query(
      `update app.payments
          set refunded_amount_cents = $2,
              status = case when $3 then 'refunded' else status end,
              updated_at = now()
        where id = $1`,
      [pay.id, newRefundedTotal, isFullyRefunded],
    );

    if (pay.referrer_creator_id && prop.referralReversedCents > 0) {
      await q.query(
        `update app.referral_commissions
            set refunded_commission_cents = refunded_commission_cents + $2,
                status = case when refunded_commission_cents + $2 >= commission_cents then 'reversed' else 'partially_reversed' end,
                updated_at = now()
          where payment_id = $1`,
        [pay.id, prop.referralReversedCents],
      );
    }

    await q.query(`update app.payment_events set outcome = 'applied', payment_id = $2 where id = $1`, [evRow.id, pay.id]);
    await audit(q, {
      actorId: null,
      action: isFullyRefunded ? "payment.refunded" : "payment.partially_refunded",
      targetType: "payment",
      targetId: pay.id,
      metadata: {
        provider,
        refundAmountCents: input.refundAmountCents,
        creatorReversedCents: prop.creatorReversedCents,
        referralReversedCents: prop.referralReversedCents,
        platformNetReversedCents: prop.platformNetReversedCents,
      },
    });

    return {
      outcome: "applied",
      creatorReversedCents: prop.creatorReversedCents,
      referralReversedCents: prop.referralReversedCents,
      platformNetReversedCents: prop.platformNetReversedCents,
    };
  });
}

/** Creator content balances from the ledger (system view — preserved for backward compatibility). */
export async function creatorBalance(creatorId: string, currency = "USD") {
  const r = await system((q) =>
    q.one<{ available: string; on_hold: string }>(
      `select coalesce(sum(amount_cents) filter (where account = 'creator:' || $1::text), 0) as available,
              coalesce(sum(amount_cents) filter (where account = 'creator_hold:' || $1::text), 0) as on_hold
         from app.ledger_entries where currency = $2 and account in ('creator:' || $1::text, 'creator_hold:' || $1::text)`,
      [creatorId, currency],
    ),
  );
  return { available: Number(r?.available ?? 0), onHold: Number(r?.on_hold ?? 0) };
}

/** Referrer commission balances from the ledger (system view). */
export async function referralBalance(creatorId: string, currency = "USD") {
  const r = await system((q) =>
    q.one<{ available: string; on_hold: string }>(
      `select coalesce(sum(amount_cents) filter (where account = 'referral:' || $1::text), 0) as available,
              coalesce(sum(amount_cents) filter (where account = 'referral_hold:' || $1::text), 0) as on_hold
         from app.ledger_entries where currency = $2 and account in ('referral:' || $1::text, 'referral_hold:' || $1::text)`,
      [creatorId, currency],
    ),
  );
  return { available: Number(r?.available ?? 0), onHold: Number(r?.on_hold ?? 0) };
}

export type PayoutEligibility = {
  eligible: boolean;
  reasons: string[];
  available: number;
  matured: number;
  holding: number;
};

/**
 * Funds that have cleared the hold: credits older than `holdDays`, minus every
 * debit (refunds, chargebacks, payouts) whatever its age, so a recent debit
 * is never deferred. Includes both content (`creator:<id>`) and referral (`referral:<id>`) earnings.
 */
async function maturedBalance(creatorId: string, currency: string, holdDays: number, asOf: Date | null): Promise<number> {
  const r = await system((q) =>
    q.one<{ m: string }>(
      `select coalesce(
                sum(amount_cents) filter (
                  where amount_cents < 0
                     or payment_id is null
                     or created_at <= coalesce($4::timestamptz, now()) - make_interval(days => $3)
                ),
                0
              ) as m
         from app.ledger_entries
        where account in ('creator:' || $1::text, 'referral:' || $1::text)
          and currency = $2`,
      [creatorId, currency, holdDays, asOf],
    ),
  );
  return Number(r?.m ?? 0);
}

/**
 * Payout eligibility. The minimum and the hold period are commercial decisions
 * (B-2, B-3): pass them explicitly; null means "not decided" → not eligible.
 * The minimum applies to matured funds (those past the hold).
 */
export async function payoutEligibility(
  creatorId: string,
  policy: { minimumCents: number | null; holdDays: number | null; currency?: string; asOf?: Date },
): Promise<PayoutEligibility> {
  const currency = policy.currency ?? "USD";
  const content = await creatorBalance(creatorId, currency);
  const referral = await referralBalance(creatorId, currency);
  const available = content.available + referral.available;
  const onHold = content.onHold + referral.onHold;

  const reasons: string[] = [];
  if (policy.holdDays != null && (!Number.isInteger(policy.holdDays) || policy.holdDays < 0 || policy.holdDays > 365)) {
    throw new AppError("validation", "The hold period must be 0 to 365 days.");
  }
  const matured =
    policy.holdDays == null
      ? 0
      : Math.min(available, await maturedBalance(creatorId, currency, policy.holdDays, policy.asOf ?? null));
  if (policy.holdDays == null) reasons.push("hold period not decided");
  if (policy.minimumCents == null) reasons.push("payout minimum not decided");
  else if (policy.holdDays != null && matured < policy.minimumCents) {
    reasons.push(available >= policy.minimumCents ? "funds still in hold period" : "below minimum");
  }
  if (onHold > 0) reasons.push("open dispute");
  const verified = await system((q) =>
    q.one(`select 1 from app.creator_verifications where user_id = $1 and status = 'verified'`, [creatorId]),
  );
  if (!verified) reasons.push("creator not verified");
  return { eligible: reasons.length === 0, reasons, available, matured, holding: Math.max(0, available - matured) };
}

/** Compare provider-reported states with ours; returns mismatches only. */
export async function reconcile(provider: string, rows: { providerRef: string; status: PaymentStatus; amountCents: number }[]) {
  const ours = await system((q) =>
    q.query<{ provider_ref: string; status: PaymentStatus; amount_cents: number }>(
      `select provider_ref, status, amount_cents from app.payments where provider = $1 and provider_ref is not null`,
      [provider],
    ),
  );
  const map = new Map(ours.map((r) => [r.provider_ref, r]));
  const out: { providerRef: string; issue: string }[] = [];
  for (const r of rows) {
    const m = map.get(r.providerRef);
    if (!m) out.push({ providerRef: r.providerRef, issue: "missing locally" });
    else if (m.status !== r.status) out.push({ providerRef: r.providerRef, issue: `status ${m.status} ≠ provider ${r.status}` });
    else if (m.amount_cents !== r.amountCents) out.push({ providerRef: r.providerRef, issue: "amount mismatch" });
    map.delete(r.providerRef);
  }
  for (const k of map.keys()) out.push({ providerRef: k, issue: "missing at provider" });
  if (out.length) log("warn", "payments.reconcile", { provider, mismatches: out.length });
  return out;
}
