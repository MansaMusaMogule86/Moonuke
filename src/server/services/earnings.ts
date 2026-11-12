import "server-only";
import { asViewer } from "@/server/db";
import type { Viewer } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { featureEnabled } from "@/server/flags";

// =====================================================================
// Creator earnings (read-only). Backed by the payment ledger, which is
// written only by the payment engine. app.payments / app.payouts are not
// readable by mk_app, so we read the creator-scoped SECURITY DEFINER
// functions app.my_payments() / app.my_payouts() and the aggregate
// app.my_balances(). All money is integer minor units (cents) — never
// floating point. Nothing here moves money.
// =====================================================================

export type PaymentKind = "subscription" | "ppv" | "tip" | "paid_message";
export type PaymentRow = {
  id: string;
  kind: PaymentKind;
  targetId: string | null;
  amountCents: number;
  currency: string;
  status: string;
  feeBps: number | null;
  createdAt: string;
};
export type PayoutRow = {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};
export type BalanceRow = { currency: string; available: number; onHold: number };

export type Earnings = {
  /** Whether the payment feature flag is on. When false the UI must not imply live income. */
  paymentsEnabled: boolean;
  balances: BalanceRow[];
  payments: PaymentRow[];
  payouts: PayoutRow[];
};

function assertCreator(v: Viewer) {
  if (v.role !== "creator" || v.status !== "active") throw new AppError("forbidden", "Not allowed.");
}

type PaymentDb = { id: string; kind: PaymentKind; target_id: string | null; amount_cents: number; currency: string; status: string; fee_bps: number | null; created_at: Date };
type PayoutDb = { id: string; amount_cents: string | number; currency: string; status: string; created_at: Date; updated_at: Date };
type BalanceDb = { currency: string; available: string | number; on_hold: string | number };

export async function myEarnings(viewer: Viewer): Promise<Earnings> {
  assertCreator(viewer);
  return asViewer(viewer, async (q) => {
    const balances = await q.query<BalanceDb>(`select currency::text as currency, available, on_hold from app.my_balances()`);
    const payments = await q.query<PaymentDb>(
      `select id, kind, target_id, amount_cents, currency::text as currency, status, fee_bps, created_at from app.my_payments()`,
    );
    const payouts = await q.query<PayoutDb>(
      `select id, amount_cents, currency::text as currency, status, created_at, updated_at from app.my_payouts()`,
    );
    return {
      paymentsEnabled: featureEnabled("payments"),
      balances: balances.map((b) => ({ currency: b.currency, available: Number(b.available), onHold: Number(b.on_hold) })),
      payments: payments.map((p) => ({
        id: p.id,
        kind: p.kind,
        targetId: p.target_id,
        amountCents: p.amount_cents,
        currency: p.currency,
        status: p.status,
        feeBps: p.fee_bps,
        createdAt: new Date(p.created_at).toISOString(),
      })),
      payouts: payouts.map((o) => ({
        id: o.id,
        amountCents: Number(o.amount_cents),
        currency: o.currency,
        status: o.status,
        createdAt: new Date(o.created_at).toISOString(),
        updatedAt: new Date(o.updated_at).toISOString(),
      })),
    };
  });
}
