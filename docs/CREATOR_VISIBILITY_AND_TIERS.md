# Creator visibility, tiers, and access — actual rules

Source: `src/server/services/studio.ts`, `src/server/services/club.ts`,
`supabase/migrations/20261109000001_phase5_creator_posts.sql`
(`app.can_view_post`), `tests/server/studio.test.ts`,
`tests/server/studio-tiers.test.ts`, `tests/server/club.test.ts`.

## Tiers

- Two kinds exist: `member` and `vip` (`TIER_LIMITS`, `studio.ts`).
- Up to 8 tiers per creator (`maxTiers: 8`).
- Requirement text says “three subscription tiers”: satisfied as “at least
  three can coexist” (two kinds plus multiples). No three-kind model exists.
- Prices are quotes only; nothing is charged (`fan.ts`: “Payments are inactive”).

## Unresolved product decision (do not invent entitlements)

- “Each tier unlocks a message” has no owner-approved meaning in the repo.
- No code maps a tier to a message unlock. Do not assign entitlements until
  the owner defines: which tier, which message, one-time vs recurring, and
  refund behavior.

## Audience vs access

- `access` values: `preview`, `members`, `vip`, `ppv`.
- Enforcement is in `app.can_view_post` (DB, not UI):
  - `preview`: visible when creator is visible.
  - `members`: needs active subscription (any tier).
  - `vip`: needs active VIP subscription.
  - `ppv`: needs a purchase row for that post.
- Draft (`published_at IS NULL`) and scheduled (future) posts are invisible to
  fans. Purchased posts keep access/time once bought.
- UI labels “Public / Subscribers / Both” and “Free / Paid” are presentation
  only. Ambiguous combos are rejected server-side:
  - `ppv` without a valid price is rejected (`normalizePost`).
  - Unpublished content is never served, regardless of label.

## Scheduled posts and messaging

- Posts: `publish: draft | now | schedule` with `scheduleAt` 1 min to 365 days
  out (`normalizePost`, `studio.test.ts`).
- Blasts: `scheduleAt` up to 30 days out, 3/day cap (`blasts.ts`).
- Direct messages have no scheduled-send field; “supported scheduled
  messaging” for 1:1 messages is missing.
- Automatic welcome messages: missing (no trigger on new subscription).
- Creator unlock confirmations: receipts exist (`myTransactionHistory`);
  no separate “unlock confirmation” message template exists.
- Blast history and recipient analytics: present (`myBlasts`, engagement
  counts delivered/skipped/failed/read/replies).
- Paid live streaming: later phase; only foundations exist (creator profile,
  tiers, posts, messaging, blasts). No streaming code.
