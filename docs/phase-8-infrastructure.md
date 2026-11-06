# Phase 8: provider-independent infrastructure (inert)

Everything in this document is **off by default**, enforced on the server, and **refused in production** by `productionProblems()` in `src/server/env.ts` until a provider is approved.

## Feature flags (`src/server/flags.ts`)

| Variable | Default | Production |
|---|---|---|
| `FEATURE_PAYMENTS` | `off` | `on` is refused (no approved provider) |
| `FEATURE_UPLOADS` | `off` | `on` is refused (no approved storage and scanning) |
| `STORAGE_PROVIDER`, `SCAN_PROVIDER` | `none` | `mock` is refused (test only) |
| `AUTH_PROVIDER` | `own` | `supabase` is refused (not approved, A3) |

Every entry point calls `requireFeature()`. Tests reach the engines through an explicit `{ testing: true }` option, which has no effect when `NODE_ENV=production`.

## Payments (`src/server/payments/`)

| Piece | File |
|---|---|
| State machine: created → pending → succeeded / failed / canceled; succeeded → refunded / disputed; disputed → succeeded / charged_back | `state.ts` |
| Double-entry postings: gross, fee and net; refunds; dispute holds; chargebacks. Every posting balances | `ledger.ts` |
| Webhook contract: HMAC over the raw body, constant-time compare, 5-minute replay window | `webhook.ts` |
| Engine: idempotent creation, exactly-once events (`payment_events` unique on provider and event id), amount and currency match, illegal transitions ignored and recorded, PPV entitlement granted on success, balances, payout eligibility, reconciliation | `engine.ts` |
| Webhook route: a bare 404 while disabled | `src/app/api/payments/webhook/[provider]/route.ts` |

**Database** (`20261113000002`):
- Tables: `payments`, `payment_events`, `ledger_entries` and `payouts`.
- No `mk_app` grants: only the engine (system role) touches them.
- The ledger is **append-only** (a trigger blocks update and delete) and each transaction must **balance**, enforced by a deferred constraint trigger.
- Creators read their own totals through `my_balances()` (SECURITY DEFINER, aggregate only).

**Payout hold and refund policy** (roadmap item 5, built 2026-11-06; payments still disabled):
- `payoutEligibility()` takes `holdDays` explicitly (`null` = not decided = never eligible).
  - Only **matured** funds count towards the minimum: credits older than the hold, minus every debit whatever its age, so a refund or chargeback is never deferred.
  - It reports `available`, `matured` and `holding`.
  - The owner's proposed 14 days (B-3) is recorded as `PROPOSED_PAYOUT_HOLD_DAYS` but **not applied**.
- `src/server/payments/policy.ts` → `PAYMENT_POLICY.refundRevokesAccess = false`, which **keeps PAY2**.
  - When switched (an owner decision overriding PAY2, B-5), a refund or chargeback of a pay-per-view payment removes the purchase, but never while another successful payment covers it.
  - The removal is audited (`purchase.revoked`).
  - Tests use an override that's ignored in production.
- Tests: `tests/server/payouts-refunds.test.ts` (7 tests).
- Processor reserves would apply on top of this hold (REPORTED).

**Not decided, so there are no defaults:**
- The platform fee: `feeBps` is required and the engine throws without it.
- The payout minimum and hold period: `null` means never eligible. Proposed: $50 and 14 days (B-2, B-3).
- Whether a refund or chargeback revokes a purchase. The switch exists and is off (PAY2); turning it on is B-5.

**No provider is assumed to accept adult creator content.** The registry stays empty, and an adapter is added only after a processor approves the business (A10).

## Media uploads (`src/server/media/upload/`)

| Piece | File |
|---|---|
| Magic-byte sniffing (JPEG, PNG, GIF, WebP, MP4, MOV, WebM, Ogg, MP3, M4A, WAV), matched against the declared MIME type; HEIC refused; per-kind size limits | `signature.ts` |
| `StorageAdapter` (private put, short-lived signed read, delete) and `SafetyScanner` (hash-match) interfaces | `types.ts` |
| Pipeline: authorize by role and purpose → validate the bytes → store privately → scan → **clean**, **quarantined** (match: kept as evidence, never served, audited) or **uploaded** (scanner error, retry). Owner-only 5-minute preview. Abandoned uploads cleaned after 24 hours (also in `pnpm maintenance`) | `service.ts` |
| Test-only `MemoryStorage` and `MockScanner`, which refuse to construct in production | `mock.ts` |

**Database:** the `media_uploads` table. Owners can read their own rows; every state change goes through the service (system role). Nothing attaches media to posts or messages yet; a future step may use only `clean` uploads.

## Authentication seam (`src/server/auth/provider.ts`)
- `AuthProvider` has `resolve`, `create`, `revoke` and `revokeAll`. Only `own` is implemented; the `supabase` stub refuses.
- Authorization (`can()`, RLS through `asViewer`) depends only on the resolved `Viewer`, so switching providers doesn't touch it.
- The regression suite (`tests/server/auth-regression.test.ts`) covers:
  - valid sessions, logout, expiry and revoke-all;
  - garbage tokens;
  - suspension taking effect mid-session;
  - AAL2 owner guards and denials for pending accounts and members.
- Rollback: `AUTH_PROVIDER=own` restores the current behaviour; see `docs/supabase-auth-migration.md` §9.

## Moderation and retention (design; not active)
- `src/server/auth/staff.ts`: the moderator capabilities and the owner-only powers. The role is now built and switched off (Phase 11, `docs/phase-11-moderators.md`).
- `src/server/ops/retention.ts`: every retention period is `null` ("keep"), because it's a legal decision. The queries only measure what a candidate policy would remove; nothing deletes.

## Defaults (confirmed by the owner, 2026-11-05)

| # | Default |
|---|---|
| U1 | Upload size limits: images 25 MB, video 2 GB, audio 50 MB. At most 10 uploads in progress per user. Abandoned after 24 hours |
| U2 | Quarantined media is kept, never served, until a retention period is decided |
| PAY1 | The fee is rounded down in the creator's favour |
| PAY2 | A purchase stays after a refund or chargeback until the business decides otherwise |
