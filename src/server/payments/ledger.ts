/**
 * Double-entry postings (pure). Signed amounts; every posting sums to zero
 * per currency. The platform fee is a REQUIRED input (basis points) — it is a
 * commercial decision (open question #6) and has no default.
 */
export type Posting = { account: string; amountCents: number; memo: string };

export function splitFee(grossCents: number, feeBps: number): { fee: number; net: number } {
  if (!Number.isInteger(grossCents) || grossCents <= 0) throw new Error("gross must be a positive integer");
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10000) throw new Error("fee_bps must be 0..10000");
  const fee = Math.floor((grossCents * feeBps) / 10000); // round down in the creator's favour
  return { fee, net: grossCents - fee };
}

export function postingsFor(ev: "succeeded" | "refunded" | "dispute_opened" | "dispute_won" | "dispute_lost", creatorId: string, grossCents: number, feeBps: number): Posting[] {
  const { fee, net } = splitFee(grossCents, feeBps);
  const creator = `creator:${creatorId}`;
  const hold = `creator_hold:${creatorId}`;
  const p = (account: string, amountCents: number, memo: string): Posting => ({ account, amountCents, memo });
  const out: Posting[] =
    ev === "succeeded"
      ? [p("provider_clearing", -grossCents, "payment received"), p(creator, net, "creator earnings"), p("platform_fees", fee, "platform fee")]
      : ev === "refunded"
        ? [p("provider_clearing", grossCents, "refund"), p(creator, -net, "refund reverses earnings"), p("platform_fees", -fee, "refund reverses fee")]
        : ev === "dispute_opened"
          ? [p(creator, -net, "dispute hold"), p(hold, net, "dispute hold")]
          : ev === "dispute_won"
            ? [p(hold, -net, "dispute released"), p(creator, net, "dispute released")]
            : [p(hold, -net, "chargeback"), p("platform_fees", -fee, "chargeback reverses fee"), p("provider_clearing", grossCents, "chargeback")];
  const nonZero = out.filter((x) => x.amountCents !== 0);
  if (nonZero.reduce((n, x) => n + x.amountCents, 0) !== 0) throw new Error("postings must balance");
  return nonZero;
}
