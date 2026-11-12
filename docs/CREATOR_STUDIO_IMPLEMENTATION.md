# Creator Studio — implementation audit and roadmap

Status: living document. Written after reading the code, migrations and tests
(not from memory). Where an older document disagrees with the code, the code
wins and this file records the correction.

## 0. How to read this

Each capability is marked **Working**, **Incomplete** or **Missing**, with the
implementation evidence (file paths) and the required change. The roadmap at
the end lists what this phase implemented and what remains.

Brand: **DivaFans** (formerly MOONUKE). Interface name in the product is
**Studio**, route prefix `/studio`.

## 1. Capability audit

### Creator roles and onboarding — Working
- Roles `owner | creator | member` and the permission matrix: `src/server/auth/permissions.ts`.
- Invitation-only onboarding: invitation → pending account → owner approval →
  profile draft → verification → publish. Evidence: `src/server/services/accounts.ts`,
  `src/server/services/creatorOnboarding.ts`, `src/app/(club)/studio/page.tsx`.
- Guard: `requireViewer()` redirects to MFA setup for creators; creators need
  AAL2 **and** a verified email for every permission (`permissions.ts` `can()`).
- Required change: none to the rules. The Studio chrome is being made cohesive.

### Studio routing and navigation — Incomplete
- Routes exist: `/studio`, `/studio/posts`(+`/new`,`/[id]`), `/studio/tiers`,
  `/studio/analytics`, `/studio/messaging`, `/studio/blasts`(+`/lists`),
  `/studio/participants`, `/studio/notices`.
- Evidence: `src/app/(club)/studio/**`.
- Gap: each page re-declares its own guard, back-link and oversized heading;
  there is no persistent section navigation. **This phase** adds a Studio
  layout (`layout.tsx` + `StudioShell`) with a desktop sidebar and a mobile
  tab bar, and centralises the `role === "creator"` guard.

### Posts and publication access — Working (single-asset)
- Drafts, scheduling, publishing; access `preview | members | vip | ppv`.
- Evidence: `src/server/services/studio.ts` (`normalizePost`, `myPosts`),
  migration `20261109000001_phase5_creator_posts.sql`.
- Gap: media is placeholder (server-derived study, no real files); no
  audience/charging split, no attachments, no likes/comments. Deferred.

### Media uploads and storage — Incomplete (inert)
- `app.media_uploads` exists with a status lifecycle and quarantine states.
- Evidence: migration `20261113000002_phase8_payments_media.sql`.
- Gated by `FEATURE_UPLOADS=off` **and** a non-`none` storage/scan provider
  (`src/server/flags.ts`). No storage provider is approved. Deferred; the
  Studio shows accurate availability rather than a fake uploader.

### Membership tiers — Incomplete
- `app.tiers` with `kind member | vip`, price, perks, seat limit, active, sort.
- Evidence: `src/server/services/studio.ts` (`myTiers`, `createTier`,
  `updateTier`, `deleteTier`), migration `20261109000002_phase5_creator_tiers.sql`.
- Gap: two kinds only; no three-tier model, no tier benefits / welcome message.
  Deferred (schema change).

### Messages and paid attachments — Incomplete
- Free text DMs with moderation, restrictions, held messages, polling.
- Evidence: `src/server/services/messaging.ts`, `src/app/(club)/messages/**`.
- Gap: no attachments, no paid locks, no unlock receipts. Deferred.

### Blasts and existing workers — Working (text)
- Compose, custom lists, templates, scheduling, delivery worker, history with
  delivered/skipped/failed/read/replied counters, cancel.
- Evidence: `src/server/services/blasts.ts`, migration
  `20261112000001_phase7_blasts_appeals.sql`, `scripts/blasts-run.ts`.
- Gap: no attachments, no paid access, no per-recipient detail page, no
  attributed revenue. Deferred; extend, never replace.

### Notifications — Working (fan-side)
- `myNotifications`, `unreadCount`, `markRead`, `deliverNotification`.
- Evidence: `src/server/services/notifications.ts`, migration
  `20261110000001_phase6_fan_app.sql`.
- Gap: no creator-event notifications. Deferred.

### Payment and entitlement services — Working but inert
- Provider interface (empty registry), state machine, double-entry ledger,
  HMAC webhook contract, policy.
- Evidence: `src/server/payments/**`.
- `FEATURE_PAYMENTS=off`; production refuses `on` until a provider is approved.
- The engine is exercised only by tests with `{ testing: true }` + the mock
  provider. **Preserved unchanged.**

### Earnings and payouts — Incomplete (no UI, no creator read path)
- Backend: `app.payments`, `app.payouts`, `app.ledger_entries`, `app.my_balances()`
  (creator aggregate), `payoutEligibility()`, `creatorBalance()`.
- Evidence: migration `20261113000002_phase8_payments_media.sql`,
  `src/server/payments/engine.ts`.
- Gap: `mk_app` cannot read `payments`/`payouts`/`ledger_entries` (no grants),
  and there was no creator-facing page. **This phase** adds creator-scoped
  SECURITY DEFINER readers (`app.my_payments()`, `app.my_payouts()`), an
  `earnings` service and a read-only `/studio/earnings` page that is explicit
  that payments are off.

### Analytics — Working (aggregates)
- Members/followers/tiers/posts/unlocks, 8 weekly buckets. Aggregates only,
  no fan identities, no view tracking, no money.
- Evidence: `src/server/services/studio.ts` (`myAnalytics`),
  `src/app/(club)/studio/analytics/page.tsx`.
- Gap: no date-range selection, no revenue. Revenue stays absent while
  payments are off (showing it would be fiction).

### Scheduling — Working (per feature)
- Posts via `posts.published_at`; Blasts via `blasts.scheduled_at` + worker.
- Evidence: `src/server/services/studio.ts`, `src/server/services/blasts.ts`,
  `scripts/blasts-run.ts`.
- Gap: no unified calendar view. Deferred.

### Database authorization — Working
- `asViewer()` runs as `mk_app` under RLS; `system()` is the privileged path.
  Evidence: `src/server/db/index.ts`.
- Every creator-scoped table is protected by RLS + SECURITY DEFINER helpers.
  The new earnings readers follow the same pattern.

## 2. Correction to stale documentation
`docs/CURRENT_STATUS.md` said *"Studio: no uploads, Blasts or earnings yet"*.
**Blasts are implemented** (service + worker + history). This phase updates that
line to distinguish uploads (inert), Blasts (working), and earnings (read-only
interface added, payments still off).

## 3. What this phase implements
1. Studio layout + persistent navigation (desktop sidebar, mobile tab bar),
   centralised creator guard.
2. Studio **Overview** rebuilt on real scoped data (audience, content,
   scheduling, messages, earnings availability, onboarding progress).
3. **Earnings** read layer (migration) + service + read-only `/studio/earnings`.
4. Compact page headers across Studio (removes oversized headings and the
   per-page back-links the sidebar replaces).
5. Docs + a server test for the earnings readers.

## 4. Roadmap (not in this phase)
- Three-tier memberships with benefits and welcome messages (schema).
- Media Vault + real uploads (needs an approved storage + scan provider).
- Post engagement: likes, comments, saves, tips (schema + moderation).
- Messaging attachments and paid unlocks with receipts.
- Blast attachments, paid access, per-recipient detail, attributed revenue.
- Unified scheduling calendar; creator-event notifications; Fans workspace;
  optional privacy-controlled presence.
- Paid live streaming (separate phase; no non-functional Go Live button).

Each deferred item is blocked by either an unapproved external provider
(storage/scan, payment processor) or is a schema change beyond this phase's
scope; none are simulated.
