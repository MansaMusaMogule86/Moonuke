"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Sheet } from "@/components/ui/Sheet";
import { completeCheckoutAction, quoteAction } from "@/server/actions/club";
import type { CheckoutResult } from "@/server/services/checkout";
import type { Quote, QuoteTarget } from "@/server/services/club";

/**
 * Opens a focused checkout sheet with a SERVER-quoted price.
 * The client sends only the tier, post, or message id — never an amount.
 * Access is granted only after the server verifies the payment event.
 */
export function CheckoutButton({
  target,
  children,
  variant = "gold",
  size = "md",
  className,
  onUnlocked,
}: {
  target: QuoteTarget;
  children: React.ReactNode;
  variant?: "gold" | "outline";
  size?: "sm" | "md" | "lg";
  className?: string;
  onUnlocked?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<CheckoutResult | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>("");
  const [pending, start] = useTransition();
  const [paying, startPay] = useTransition();

  const makeKey = () =>
    `chk_${target.kind}_${target.id.replace(/[^A-Za-z0-9]/g, "").slice(0, 16)}_${Date.now().toString(36)}`;

  const openSheet = () => {
    setOpen(true);
    setQuote(null);
    setError(null);
    setReceipt(null);
    setIdempotencyKey(makeKey());
    start(async () => {
      const r = await quoteAction(target);
      if (r.ok) setQuote(r.quote);
      else setError(r.message);
    });
  };

  const handlePay = () => {
    if (!quote || paying) return;
    setError(null);
    const key = idempotencyKey || makeKey();
    startPay(async () => {
      const r = await completeCheckoutAction({
        kind: target.kind,
        id: target.id,
        idempotencyKey: key,
        outcome: "succeeded",
      });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setReceipt(r.result);
      router.refresh();
      onUnlocked?.();
    });
  };

  const sheetTitle =
    receipt?.status === "succeeded"
      ? "Purchase Confirmed"
      : target.kind === "tier"
        ? "Subscribe to Creator"
        : target.kind === "message"
          ? "Unlock Exclusive Message"
          : "Unlock Paid Post";

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={openSheet} aria-haspopup="dialog">
        {children}
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={sheetTitle}
        description={quote?.subtitle ?? "Confirming the price with the house…"}
      >
        <div className="pb-[max(1rem,env(safe-area-inset-bottom))]" aria-busy={pending || paying}>
          {pending && (
            <div className="space-y-3 py-2">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-10 w-1/3" />
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="mb-4 rounded-[var(--radius-md)] border border-danger/40 bg-danger/[0.06] p-4 text-[14px] text-danger"
            >
              {error}
            </p>
          )}

          {receipt && receipt.status === "succeeded" && quote && (
            <div className="space-y-5">
              <div className="rounded-[var(--radius-md)] border border-emerald-500/40 bg-emerald-500/[0.08] p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-300">Payment Verified</p>
                <p className="mt-1 font-display text-[24px] text-ivory">
                  {target.kind === "tier"
                    ? `You are now subscribed to ${quote.creatorName}`
                    : target.kind === "message"
                      ? "Exclusive message unlocked"
                      : "Post unlocked"}
                </p>
                <p className="mt-1 text-[13px] text-stone">
                  Your access has been granted immediately and added to <strong className="text-ivory">My Access</strong>.
                </p>
              </div>

              <dl className="space-y-2.5 rounded-[var(--radius-md)] border border-line bg-obsidian/60 p-4 text-[13px]">
                <div className="flex justify-between gap-4">
                  <dt className="text-stone">Creator</dt>
                  <dd className="font-medium text-ivory">{quote.creatorName}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-stone">Item</dt>
                  <dd className="text-right text-ivory">{quote.title}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-stone">Amount paid</dt>
                  <dd className="font-medium text-gold-soft">
                    {quote.totalLabel} ({quote.currency})
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-stone">Receipt ID</dt>
                  <dd className="font-mono text-[12px] text-ash">{receipt.paymentId.slice(0, 12)}</dd>
                </div>
              </dl>

              <div className="flex flex-wrap gap-3">
                <Button variant="gold" className="flex-1" onClick={() => setOpen(false)}>
                  View content now
                </Button>
                <Link
                  href="/library?tab=history"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-line-strong px-5 text-[13px] text-ivory hover:border-gold/50"
                >
                  View in My Access
                </Link>
              </div>
            </div>
          )}

          {quote && !receipt && (
            <>
              <div className="rounded-[var(--radius-md)] border border-line bg-obsidian/50 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-gold-soft">{quote.creatorName}</p>
                <p className="mt-1 text-[15px] font-medium text-ivory">{quote.title}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-stone">{quote.itemDescription}</p>
              </div>

              <div className="mt-5 flex items-baseline justify-between border-b border-line pb-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-ash">
                    {quote.cadence ? "Recurring price" : "One-time price"}
                  </p>
                  <p className="mt-1 font-display text-[40px] leading-none text-ivory">
                    {quote.amountLabel}
                    {quote.cadence && (
                      <span className="ml-2 align-middle font-sans text-[12px] uppercase tracking-[0.18em] text-ash">
                        {quote.cadence}
                      </span>
                    )}
                  </p>
                </div>
                <span className="rounded-full border border-line px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-stone">
                  {quote.currency}
                </span>
              </div>

              <dl className="mt-4 space-y-2.5 text-[13px]">
                <div className="flex justify-between gap-4">
                  <dt className="text-stone">Subtotal</dt>
                  <dd className="text-ivory">{quote.amountLabel}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-stone">Platform processing fee</dt>
                  <dd className="text-ivory">{quote.feeLabel}</dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-line pt-2.5 text-[14px] font-medium">
                  <dt className="text-ivory">Total due today</dt>
                  <dd className="text-gold-soft">
                    {quote.totalLabel} {quote.currency}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 rounded-[var(--radius-md)] border border-line bg-obsidian/40 p-3.5 text-[12px] text-stone">
                <p className="font-medium text-ivory">Payment method & terms</p>
                <p className="mt-1">
                  {quote.supportedMethods.length > 0
                    ? quote.supportedMethods[0]
                    : "No active payment method configured"}
                </p>
                <p className="mt-1 text-ash">{quote.accessTerms}</p>
              </div>

              {quote.sandboxAvailable ? (
                <div className="mt-5 space-y-3">
                  <Button
                    variant="gold"
                    className="w-full"
                    size="lg"
                    disabled={paying}
                    onClick={handlePay}
                  >
                    {paying
                      ? "Verifying payment…"
                      : target.kind === "tier"
                        ? `Subscribe · ${quote.totalLabel}/mo`
                        : `Pay ${quote.totalLabel} & Unlock`}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full"
                    size="sm"
                    disabled={paying}
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  <p
                    role="note"
                    className="mt-5 rounded-[var(--radius-md)] border border-gold/30 bg-gold/[0.06] p-4 text-[13px] leading-relaxed text-gold-soft"
                  >
                    {quote.reason} No card is charged and nothing is unlocked.
                  </p>
                  <Button className="mt-4 w-full" size="lg" disabled>
                    Checkout unavailable
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </Sheet>
    </>
  );
}
