import "server-only";

/**
 * Provider-independent payment abstraction (Phase 2 surface only).
 * Phase 6 adds adapters (Stripe, CCBill, Segpay, Verotel, crypto), webhooks,
 * the state machine and the double-entry ledger behind this same interface.
 *
 * Nothing here can move money: the registry contains no approved provider.
 */
export type Money = { amountCents: number; currency: string };

export type CheckoutIntent =
  | { kind: "subscription"; tierId: string; creatorId: string; fanId: string; price: Money }
  | { kind: "ppv"; postId: string; creatorId: string; fanId: string; price: Money };

export type CheckoutSession = { providerId: string; redirectUrl: string; externalId: string };

export interface PaymentProvider {
  readonly id: string;
  /** Capabilities are declared per provider and verified at approval time. */
  readonly capabilities: ReadonlySet<"subscription" | "ppv" | "tip" | "refund">;
  createCheckout(intent: CheckoutIntent, idempotencyKey: string): Promise<CheckoutSession>;
}

/**
 * Providers become available only after the applicable processor approves
 * the business model, content category, jurisdiction and account — and the
 * owner explicitly enables them. Until then this list stays empty.
 */
const approvedProviders: PaymentProvider[] = [];

export function providerFor(kind: CheckoutIntent["kind"]): PaymentProvider | null {
  return approvedProviders.find((p) => p.capabilities.has(kind === "subscription" ? "subscription" : "ppv")) ?? null;
}

export function formatMoney({ amountCents, currency }: Money): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: amountCents % 100 ? 2 : 0 }).format(amountCents / 100);
}
