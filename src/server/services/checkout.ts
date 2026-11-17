import "server-only";
import { hmac } from "@/server/auth/crypto";
import { asViewer } from "@/server/db";
import type { Viewer } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { applyEvent, attachProviderRef, createPayment, type NewPayment } from "@/server/payments/engine";
import { PROVISIONAL_PLATFORM_FEE_BPS } from "@/server/payments/policy";
import type { PaymentStatus } from "@/server/payments/state";
import { signHmac, verifyHmac, type VerifiedEvent } from "@/server/payments/webhook";
import { quote, type QuoteTarget } from "./club";
import { assertFan } from "./fan";

const SANDBOX_PROVIDER = "sandbox";
/**
 * Sandbox SIMULATOR signing key only. This is not a provider webhook secret:
 * it signs and verifies mock events inside `processSandboxCheckout`, which
 * refuses to run in production and only runs behind `testing: true`.
 * A real processor adapter MUST use the provider-issued endpoint signing
 * secret from server configuration (never this derivation, never a default)
 * and verify raw-body signatures before `applyEvent` grants anything.
 */
const sandboxWebhookSecret = () => hmac("webhook:sandbox-simulator");

export type CheckoutOutcome = "succeeded" | "failed" | "canceled";

export type CheckoutResult = {
  paymentId: string;
  status: PaymentStatus;
  duplicate: boolean;
  kind: QuoteTarget["kind"];
  targetId: string;
  creatorHandle: string;
  amountLabel: string;
};

/**
 * Executes a verified sandbox checkout through the double-entry payment engine.
 *
 * Security invariants:
 * - Refuses to run in production unless an approved live provider is configured.
 * - Never trusts client-supplied amounts, currencies, or creator IDs; resolves
 *   everything from PostgreSQL under the viewer's RLS session.
 * - Requires HMAC webhook signature verification before `applyEvent` grants any
 *   entitlement (`app.purchases`, `app.message_purchases`, `app.subscriptions`).
 * - Idempotent on `idempotencyKey`: replaying the same key returns the existing
 *   payment without creating duplicate entitlements or ledger postings.
 */
export async function processSandboxCheckout(
  viewer: Viewer,
  input: {
    kind: QuoteTarget["kind"];
    targetId: string;
    idempotencyKey: string;
    outcome?: CheckoutOutcome;
  },
): Promise<CheckoutResult> {
  assertFan(viewer);
  if (process.env.NODE_ENV === "production" || process.env.SANDBOX_CHECKOUT_ENABLED === "false") {
    throw new AppError(
      "forbidden",
      "Live card processing is not configured yet (requires FEATURE_PAYMENTS=on and an approved payment processor adapter).",
    );
  }
  if (!/^[A-Za-z0-9_:-]{8,120}$/.test(input.idempotencyKey)) {
    throw new AppError("validation", "Invalid checkout idempotency key.");
  }

  // Check if this exact idempotency key was already processed for this fan
  const existingReceipt = await asViewer(viewer, (q) =>
    q.one<{
      id: string;
      kind: string;
      creator_id: string;
      target_id: string;
      amount_cents: number;
      currency: string;
      status: PaymentStatus;
    }>(
      `select id, kind, creator_id, target_id, amount_cents, currency, status::text as status
         from app.my_payment_receipts()
        where provider = $1 and provider_ref = $2`,
      [SANDBOX_PROVIDER, `ref_${input.idempotencyKey}`],
    ),
  );
  if (existingReceipt) {
    return {
      paymentId: existingReceipt.id,
      status: existingReceipt.status,
      duplicate: true,
      kind: input.kind,
      targetId: input.targetId,
      creatorHandle: "",
      amountLabel: new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: existingReceipt.currency,
        minimumFractionDigits: existingReceipt.amount_cents % 100 ? 2 : 0,
      }).format(existingReceipt.amount_cents / 100),
    };
  }

  // Resolve price, currency, creator, and eligibility strictly from PostgreSQL
  const q = await quote(viewer, { kind: input.kind, id: input.targetId });

  const paymentKind: NewPayment["kind"] =
    input.kind === "tier" ? "subscription" : input.kind === "message" ? "paid_message" : "ppv";

  const created = await createPayment(
    {
      kind: paymentKind,
      fanId: viewer.id,
      creatorId: q.creatorId,
      targetId: q.targetId,
      amountCents: q.amountCents,
      currency: q.currency,
      provider: SANDBOX_PROVIDER,
      idempotencyKey: input.idempotencyKey,
    },
    { testing: true },
  );

  const providerRef = `ref_${input.idempotencyKey}`;
  await attachProviderRef(created.id, providerRef, { testing: true });

  const outcome: CheckoutOutcome = input.outcome ?? "succeeded";
  const nowSec = Math.floor(Date.now() / 1000);

  // Step 1: Authorize payment (created -> pending)
  const authEvent: VerifiedEvent = {
    eventId: `evt_auth_${input.idempotencyKey}`,
    type: "payment.authorized",
    providerRef,
    amountCents: q.amountCents,
    currency: q.currency,
  };
  const authRaw = JSON.stringify(authEvent);
  const authSig = signHmac(sandboxWebhookSecret(), authRaw, nowSec);
  if (!verifyHmac(sandboxWebhookSecret(), authRaw, authSig, 300, nowSec)) {
    throw new AppError("forbidden", "Webhook signature verification failed.");
  }
  await applyEvent(SANDBOX_PROVIDER, authEvent, authRaw, {
    testing: true,
    feeBps: PROVISIONAL_PLATFORM_FEE_BPS,
  });

  // Step 2: Finalize outcome (pending -> succeeded | failed | canceled)
  const finalType: VerifiedEvent["type"] =
    outcome === "succeeded"
      ? "payment.succeeded"
      : outcome === "failed"
        ? "payment.failed"
        : "payment.canceled";
  const finalEvent: VerifiedEvent = {
    eventId: `evt_${outcome}_${input.idempotencyKey}`,
    type: finalType,
    providerRef,
    amountCents: q.amountCents,
    currency: q.currency,
  };
  const finalRaw = JSON.stringify(finalEvent);
  const finalSig = signHmac(sandboxWebhookSecret(), finalRaw, nowSec);
  if (!verifyHmac(sandboxWebhookSecret(), finalRaw, finalSig, 300, nowSec)) {
    throw new AppError("forbidden", "Webhook signature verification failed.");
  }
  const applied = await applyEvent(SANDBOX_PROVIDER, finalEvent, finalRaw, {
    testing: true,
    feeBps: PROVISIONAL_PLATFORM_FEE_BPS,
  });

  return {
    paymentId: created.id,
    status: outcome,
    duplicate: !created.created || applied === "duplicate",
    kind: input.kind,
    targetId: input.targetId,
    creatorHandle: q.creatorHandle,
    amountLabel: q.totalLabel,
  };
}

