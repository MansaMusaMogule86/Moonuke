/**
 * Payment state machine (pure). Provider webhooks map to these events; an
 * event that isn't a legal transition from the current state is ignored and
 * recorded, never applied.
 */
export type PaymentStatus = "created" | "pending" | "succeeded" | "failed" | "canceled" | "refunded" | "disputed" | "charged_back";
export type PaymentEvent = "authorized" | "succeeded" | "failed" | "canceled" | "refunded" | "dispute_opened" | "dispute_won" | "dispute_lost";

const T: Record<PaymentStatus, Partial<Record<PaymentEvent, PaymentStatus>>> = {
  created: { authorized: "pending", succeeded: "succeeded", failed: "failed", canceled: "canceled" },
  pending: { succeeded: "succeeded", failed: "failed", canceled: "canceled" },
  succeeded: { refunded: "refunded", dispute_opened: "disputed" },
  disputed: { dispute_won: "succeeded", dispute_lost: "charged_back" },
  failed: {},
  canceled: {},
  refunded: {},
  charged_back: {},
};

export function transition(from: PaymentStatus, ev: PaymentEvent): PaymentStatus | null {
  return T[from][ev] ?? null;
}

export const TERMINAL: PaymentStatus[] = ["failed", "canceled", "refunded", "charged_back"];
