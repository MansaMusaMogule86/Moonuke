import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { system } from "@/server/db";
import { AppError } from "@/server/errors";
import { requireFeature } from "@/server/flags";
import { log } from "@/server/log";
import { audit } from "@/server/services/audit";
import { postingsFor } from "./ledger";
import { PAYMENT_POLICY } from "./policy";
import { transition, type PaymentEvent, type PaymentStatus } from "./state";
import type { VerifiedEvent } from "./webhook";

/**
 * Payment engine (system role). Provider-independent: providers create
 * checkouts and deliver verified events; this engine owns idempotency, the
 * state machine, the double-entry ledger and entitlements.
 *
 * Every public entry point calls requireFeature("payments") — OFF by default
 * and refused in production until a provider is approved. Tests exercise the
 * engine with the mock provider and an explicit `{ testing: true }` bypass
 * that only works outside production.
 */
/** `refundRevokesAccess` overrides the policy in tests only (ignored in production). */
type Opts = { testing?: boolean; feeBps?: number | null; refundRevokesAccess?: boolean };

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
  currency: string;
  provider: string;
  idempotencyKey: string;
};

/** Create (or return the existing) payment for an idempotency key. */
export async function createPayment(p: NewPayment, o: Opts = {}): Promise<{ id: string; status: PaymentStatus; created: boolean }> {
  gate(o);
  return system(async (q) => {
    const ins = await q.one<{ id: string; status: PaymentStatus }>(
      `insert into app.payments (kind, fan_id, creator_id, target_id, amount_cents, currency, provider, idempotency_key)
       values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (idempotency_key) do nothing returning id, status`,
      [p.kind, p.fanId, p.creatorId, p.targetId, p.amountCents, p.currency, p.provider, p.idempotencyKey],
    );
    if (ins) return { ...ins, created: true };
    const ex = await q.one<{ id: string; status: PaymentStatus; amount_cents: number; fan_id: string }>(
      `select id, status, amount_cents, fan_id from app.payments where idempotency_key = $1`,
      [p.idempotencyKey],
    );
    if (!ex || ex.amount_cents !== p.amountCents || ex.fan_id !== p.fanId) throw new AppError("conflict", "Idempotency key reused with different details.");
    return { id: ex.id, status: ex.status, created: false };
  });
}

export async function attachProviderRef(paymentId: string, providerRef: string, o: Opts = {}) {
  gate(o);
  await system((q) => q.query(`update app.payments set provider_ref = $2, updated_at = now() where id = $1 and provider_ref is null`, [paymentId, providerRef]));
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
export async function applyEvent(provider: string, ev: VerifiedEvent, rawBody: string, o: Opts = {}): Promise<ApplyResult> {
  gate(o);
  const feeBps = o.feeBps ?? null;
  return system(async (q) => {
    const hash = createHash("sha256").update(rawBody).digest("hex");
    const evRow = await q.one<{ id: number }>(
      `insert into app.payment_events (provider, event_id, type, payload_sha256) values ($1, $2, $3, $4)
       on conflict (provider, event_id) do nothing returning id`,
      [provider, ev.eventId, ev.type, hash],
    );
    if (!evRow) return "duplicate";
    const done = async (outcome: Exclude<ApplyResult, "duplicate">, note: string | null, paymentId: string | null = null) => {
      await q.query(`update app.payment_events set outcome = $2, note = $3, payment_id = $4 where id = $1`, [evRow.id, outcome, note, paymentId]);
      return outcome;
    };
    const pay = await q.one<{ id: string; kind: NewPayment["kind"]; status: PaymentStatus; amount_cents: number; currency: string; fan_id: string; creator_id: string; target_id: string | null; fee_bps: number | null }>(
      `select id, kind, status, amount_cents, currency, fan_id, creator_id, target_id, fee_bps from app.payments where provider = $1 and provider_ref = $2 for update`,
      [provider, ev.providerRef],
    );
    if (!pay) return done("rejected", "unknown payment");
    if (pay.amount_cents !== ev.amountCents || pay.currency !== ev.currency) return done("rejected", "amount or currency mismatch", pay.id);
    const next = transition(pay.status, EVENT[ev.type]);
    if (!next) return done("ignored", `illegal transition ${pay.status} → ${ev.type}`, pay.id);

    const money = ["succeeded", "refunded", "dispute_opened", "dispute_won", "dispute_lost"] as const;
    const e = EVENT[ev.type];
    if ((money as readonly string[]).includes(e)) {
      // The fee is fixed when the payment succeeds; later events reuse it.
      const bps = e === "succeeded" ? feeBps : pay.fee_bps;
      if (bps == null) throw new AppError("validation", "Platform fee is not configured (commercial decision pending).");
      const txn = randomUUID();
      for (const x of postingsFor(e as (typeof money)[number], pay.creator_id, pay.amount_cents, bps)) {
        await q.query(`insert into app.ledger_entries (txn_id, payment_id, account, amount_cents, currency, memo) values ($1, $2, $3, $4, $5, $6)`, [
          txn, pay.id, x.account, x.amountCents, pay.currency, x.memo,
        ]);
      }
      if (e === "succeeded") await q.query(`update app.payments set fee_bps = $2 where id = $1`, [pay.id, bps]);
    }
    await q.query(`update app.payments set status = $2, updated_at = now() where id = $1`, [pay.id, next]);
    // Entitlements follow money: a successful PPV payment grants the purchase.
    if (e === "succeeded" && pay.kind === "ppv" && pay.target_id) {
      await q.query(`insert into app.purchases (fan_id, post_id) values ($1, $2) on conflict do nothing`, [pay.fan_id, pay.target_id]);
    }
    // Refund or chargeback: the purchase stays (PAY2) unless the policy says
    // otherwise. Never revoked while another successful payment covers it.
    const revoke = o.testing && process.env.NODE_ENV !== "production" && o.refundRevokesAccess !== undefined ? o.refundRevokesAccess : PAYMENT_POLICY.refundRevokesAccess;
    if (revoke && (next === "refunded" || next === "charged_back") && pay.kind === "ppv" && pay.target_id) {
      const gone = await q.one(
        `delete from app.purchases x where x.fan_id = $1 and x.post_id = $2
            and not exists (select 1 from app.payments p where p.fan_id = $1 and p.target_id = $2 and p.kind = 'ppv' and p.status = 'succeeded' and p.id <> $3)
          returning 1`,
        [pay.fan_id, pay.target_id, pay.id],
      );
      if (gone) await audit(q, { actorId: null, action: "purchase.revoked", targetType: "post", targetId: pay.target_id, metadata: { payment: pay.id, reason: next } });
    }
    await audit(q, { actorId: null, action: `payment.${next}`, targetType: "payment", targetId: pay.id, metadata: { provider, event: ev.type } });
    return done("applied", null, pay.id);
  });
}

/** Creator balances from the ledger (system view). */
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

export type PayoutEligibility = { eligible: boolean; reasons: string[]; available: number; matured: number; holding: number };

/**
 * Funds that have cleared the hold: credits older than `holdDays`, minus every
 * debit (refunds, chargebacks, payouts) whatever its age, so a recent debit
 * is never deferred.
 */
async function maturedBalance(creatorId: string, currency: string, holdDays: number, asOf: Date | null): Promise<number> {
  const r = await system((q) =>
    q.one<{ m: string }>(
      `select coalesce(sum(amount_cents) filter (where amount_cents < 0 or created_at <= coalesce($4::timestamptz, now()) - make_interval(days => $3)), 0) as m
         from app.ledger_entries where account = 'creator:' || $1::text and currency = $2`,
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
export async function payoutEligibility(creatorId: string, policy: { minimumCents: number | null; holdDays: number | null; currency?: string; asOf?: Date }): Promise<PayoutEligibility> {
  const currency = policy.currency ?? "USD";
  const { available, onHold } = await creatorBalance(creatorId, currency);
  const reasons: string[] = [];
  if (policy.holdDays != null && (!Number.isInteger(policy.holdDays) || policy.holdDays < 0 || policy.holdDays > 365)) {
    throw new AppError("validation", "The hold period must be 0 to 365 days.");
  }
  const matured = policy.holdDays == null ? 0 : Math.min(available, await maturedBalance(creatorId, currency, policy.holdDays, policy.asOf ?? null));
  if (policy.holdDays == null) reasons.push("hold period not decided");
  if (policy.minimumCents == null) reasons.push("payout minimum not decided");
  else if (policy.holdDays != null && matured < policy.minimumCents) reasons.push(available >= policy.minimumCents ? "funds still in hold period" : "below minimum");
  if (onHold > 0) reasons.push("open dispute");
  const verified = await system((q) => q.one(`select 1 from app.creator_verifications where user_id = $1 and status = 'verified'`, [creatorId]));
  if (!verified) reasons.push("creator not verified");
  return { eligible: reasons.length === 0, reasons, available, matured, holding: Math.max(0, available - matured) };
}

/** Compare provider-reported states with ours; returns mismatches only. */
export async function reconcile(provider: string, rows: { providerRef: string; status: PaymentStatus; amountCents: number }[]) {
  const ours = await system((q) => q.query<{ provider_ref: string; status: PaymentStatus; amount_cents: number }>(`select provider_ref, status, amount_cents from app.payments where provider = $1 and provider_ref is not null`, [provider]));
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
