"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Sheet } from "@/components/ui/Sheet";
import { quoteAction } from "@/server/actions/club";
import type { Quote } from "@/server/services/club";

/**
 * Opens a bottom sheet with a SERVER-quoted price. The client sends only the
 * tier or post id. With no approved payment provider, checkout is disabled.
 */
export function CheckoutButton({
  target,
  children,
  variant = "gold",
  size = "md",
  className,
}: {
  target: { kind: "tier" | "post"; id: string };
  children: React.ReactNode;
  variant?: "gold" | "outline";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const openSheet = () => {
    setOpen(true);
    setQuote(null);
    setError(null);
    start(async () => {
      const r = await quoteAction(target);
      if (r.ok) setQuote(r.quote);
      else setError(r.message);
    });
  };

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={openSheet} aria-haspopup="dialog">
        {children}
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title={target.kind === "tier" ? "Join" : "Unlock"} description={quote?.subtitle ?? "Confirming the price with the house…"}>
        <div className="pb-4" aria-busy={pending}>
          {pending && (
            <div className="space-y-3 py-2">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-10 w-1/3" />
            </div>
          )}
          {error && <p role="alert" className="rounded-[var(--radius-md)] border border-danger/40 bg-danger/[0.06] p-4 text-[14px] text-danger">{error}</p>}
          {quote && (
            <>
              <p className="text-[15px] text-ivory">{quote.title}</p>
              <p className="mt-3 font-display text-[44px] leading-none text-ivory">
                {quote.amountLabel}
                {quote.cadence && <span className="ml-2 align-middle font-sans text-[13px] uppercase tracking-[0.18em] text-ash">{quote.cadence}</span>}
              </p>
              <dl className="mt-6 space-y-3 border-t border-line pt-5 text-[14px]">
                <div className="flex justify-between gap-4"><dt className="text-stone">Shown to the creator as</dt><dd className="text-ivory">Your alias</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-stone">Price confirmed by</dt><dd className="text-ivory">The house, at checkout</dd></div>
              </dl>
              <p role="note" className="mt-6 rounded-[var(--radius-md)] border border-gold/30 bg-gold/[0.06] p-4 text-[13px] leading-relaxed text-gold-soft">
                {quote.reason} No card is charged and nothing is unlocked.
              </p>
              <Button className="mt-6 w-full" size="lg" disabled>
                Checkout unavailable
              </Button>
            </>
          )}
        </div>
      </Sheet>
    </>
  );
}
