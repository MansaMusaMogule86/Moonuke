# DivaFans — platform audit (creator studio + fan platform)

Evidence-based: written by reading the code, migrations and tests, and by
running the app. Nothing is marked PASS because a page merely exists. Where a
capability is blocked by an unapproved external provider it is marked
**BLOCKED**, never faked.

Legend: **PASS** working and verified · **PARTIAL** works but incomplete ·
**BLOCKED** needs an unapproved provider/decision · **NOT IMPLEMENTED**.

## 1. Access model

| Requirement | Status | Evidence |
|---|---|---|
| Creator registration is invitation-only | PASS | `app.invitations` (`intended_role`, `email`, `max_uses`, `expires_at`, `revoked_at`, `created_by`), owner-only `createInvitation`; `/invite/[token]` |
| Invitations are hashed, expiring, revocable, single-use (configurable), auditable | PASS | token stored as `sha256`; `max_uses 1..100`; `expires_at`; `revoked_at`; `audit_log` on create/revoke |
| A valid invitation never bypasses identity/onboarding | PASS | activation link + temporary password (`must_change_password`) → profile → owner verification → publish |
| No public creator registration | PASS | no `/signup`-style creator route; the allowlist (`app.creator_allowlist`) refuses non-approved creator addresses |
| Fan registration via a creator referral link | **NOT IMPLEMENTED** (this phase) | no `/join/<handle>` or `/signup`; fans join only through an owner-issued member invitation |
| Signup validates the creator referral server-side | **NOT IMPLEMENTED** (this phase) | n/a |
| Generic signup without a valid referral is refused | **NOT IMPLEMENTED** (this phase) | n/a |
| Existing fans sign in normally | PASS | `/signin` + sessions; no re-invitation |
| Existing fans discover other approved creators | PASS | `/discover` (real DB + RLS) |
| Existing roles preserved; owners not downgraded | PASS | no role-migration code; `users_single_owner` index |

## 2. Creator Studio — route matrix

All Studio routes share `src/app/(club)/studio/layout.tsx`, which calls
`requireViewer("club.discover")` and `notFound()` unless `role === "creator"`.
Every page also re-checks server-side.

| Route | Guard | Loads | Real data | Mobile | Tests | Status |
|---|---|---|---|---|---|---|
| `/studio` (Overview) | creator | PASS | PASS (analytics/posts/blasts/earnings) | PASS | studio/earnings | **PASS** |
| `/studio/posts` | creator | PASS | PASS (`myPosts`) | PASS | `studio.test.ts` | **PASS** |
| `/studio/posts/new` | creator | PASS | PASS | PASS | `studio.test.ts` | **PASS** |
| `/studio/posts/[id]` | creator | PASS | PASS | PASS | `studio.test.ts` | **PASS** |
| `/studio/tiers` | creator | PASS | PASS (`myTiers`) | PASS | `studio-tiers.test.ts` | **PASS** |
| `/studio/analytics` | creator | PASS | PASS (aggregates) | PASS | `studio-analytics.test.ts` | **PASS** |
| `/studio/messaging` | creator | PASS | PASS (`mySettings`) | PASS | `messaging.test.ts` | **PASS** |
| `/studio/blasts` | creator | PASS | PASS (`myBlasts`) | PASS | `blasts.test.ts` | **PASS** |
| `/studio/blasts/lists` | creator | PASS | PASS (`myLists`) | PASS | `blasts.test.ts` | **PASS** |
| `/studio/participants` | creator | PASS | PASS | PASS | `safety-compliance.test.ts` | **PASS** |
| `/studio/notices` | creator | PASS | PASS (`myNotices`) | PASS | `notices.test.ts` | **PASS** |
| `/studio/earnings` | creator | PASS | PASS (`my_payments`/`my_payouts`/`my_balances`) | PASS | `earnings.test.ts` | **PASS** (payments off → honest zero state) |
| `/studio/settings` | creator | PASS | PASS (profile/import/socials/verification) | PASS | `imports.test.ts` | **PASS** |
| Media Vault (upload) | creator | PARTIAL | `/studio` has no vault | — | `media.test.ts` (inert) | **BLOCKED** (no approved storage/scan provider; `FEATURE_UPLOADS=off`) |
| Creator referral link (share/QR) | creator | **NOT IMPLEMENTED** (this phase) | — | — | — | **NOT IMPLEMENTED** |

## 3. Fan platform — route matrix

| Route | Guard | Loads | Real data | Mobile | Tests | Status |
|---|---|---|---|---|---|---|
| `/discover` | member/creator | PASS | PASS (real DB + RLS) | PASS | `club.test.ts` | **PASS** |
| `/c/[handle]` (profile) | member/creator | PASS | PASS (profile, socials, tiers, posts) | PASS | `club.test.ts` | **PASS** |
| `/library` | member/creator | PASS | PASS (subscriptions, purchases) | PASS | `fan.test.ts` | **PASS** |
| `/library/memberships` | member/creator | PASS | PASS | PASS | `fan.test.ts` | **PASS** |
| `/library/purchases` | member/creator | PASS | PASS | PASS | `fan.test.ts` | **PASS** |
| `/library/vault` | member/creator | PASS | PASS (unlocked posts) | PASS | `fan.test.ts` | **PASS** |
| `/notifications` | member/creator | PASS | PASS (`myNotifications`) | PASS | `fan.test.ts` | **PASS** |
| `/messages`, `/messages/[id]`, `/messages/new` | member/creator | PASS | PASS | PASS | `messaging.test.ts` | **PASS** |
| `/refer` (ask the house to invite) | member/creator | PASS | PASS (`referral_requests`) | PASS | `access.test.ts` | **PASS** |
| `/account/security` | any signed-in | PASS | PASS (MFA, sessions, password) | PASS | `mfa.test.ts` | **PASS** |
| `/account/privacy` | member/creator | PASS | PASS (blocks, reports) | PASS | `safety.test.ts` | **PASS** |
| Fan home (`/home`) | — | — | — | — | — | **NOT IMPLEMENTED** (the fan landing is `/discover`) |
| Fan signup (`/join/[handle]`, `/signup`) | — | — | — | — | — | **NOT IMPLEMENTED** (this phase) |
| Account deletion request | — | — | — | — | — | **NOT IMPLEMENTED** |


## 4. Subscription tiers and the fan checkout flow

| Requirement | Status | Evidence |
|---|---|---|
| Creator creates/edits/activates tiers with name, price, currency, benefits, seats | PASS | `app.tiers` (`kind`, `name`, `price_cents`, `currency`, `perks`, `seat_limit`, `active`, `sort`); `/studio/tiers` |
| Fan sees the same active tiers the creator saved | PASS | `/c/[handle]` reads `app.tiers where active`; `/studio/tiers` writes the same rows |
| No hardcoded/fake tiers | PASS | prices come only from the database (`quote()`) |
| Empty state when the creator has no tiers | PASS | `/c/[handle]` renders nothing to buy; `/studio/tiers` shows "No tiers yet" |
| Fan opens profile → views tiers → reviews price/terms | PASS | `/c/[handle]` |
| Fan completes checkout through a provider | **BLOCKED** | `providerFor()` registry is empty; `quote()` always returns `available:false`; `CheckoutButton` shows "Payments aren't active yet" |
| Access granted only after verified payment/entitlement | PASS (engine) / BLOCKED (live) | mock-provider engine + ledger + `applyEvent` (tests only); no live provider |
| Manage subscription, billing history, cancel per terms | PARTIAL | cancel-at-period-end + `/library/memberships` exist; no billing history (no payments) |
| No simulated success / client-side-only grants | PASS | `app.purchases` is written only by the payment engine (system role); viewers cannot insert |
| Tier changes are limited to the owner of the tier | PASS | RLS `tiers_*` policies + `tier_has_subscribers()` guard |

## 5. Referral and invitation system

| Requirement | Status | Evidence |
|---|---|---|
| Stable per-creator sharing URL | **NOT IMPLEMENTED** (this phase) | — |
| Username (handle) reservation, unique | PASS | `app.creators.handle` unique, checked regex |
| Unique referral identifier | **NOT IMPLEMENTED** (this phase) | — |
| Copy link / QR / share | **NOT IMPLEMENTED** (this phase) | — |
| Referral attribution + conversion analytics | **NOT IMPLEMENTED** (this phase) | — |
| Link revocation / suspension | **NOT IMPLEMENTED** (this phase) | (the referral link will follow creator visibility/status) |
| Protection against manipulation | **NOT IMPLEMENTED** (this phase) | (validated server-side; no client trust) |
| Owner-issued invitations (member + creator) | PASS | `/admin/invitations`, `/invite/[token]` |
| Member asks the house to invite someone | PASS | `/refer` → `referral_requests` → owner approves → invitation |

## 6. Database and API

| Area | Status | Evidence |
|---|---|---|
| Users, roles, single owner | PASS | `app.users`, `users_single_owner` |
| Creator profiles | PASS | `app.creators` (handle, display name, category, visibility, cover, published_at) |
| Fan profiles | PASS (via users + follows/subscriptions) | no separate fan table by design |
| Invitations / referral requests | PASS | `app.invitations`, `app.referral_requests` |
| Tiers / subscriptions / payments / entitlements / ledger | PASS (inert where payments) | `app.tiers`, `app.subscriptions`, `app.purchases`, `app.payments`, `app.ledger_entries`, `app.payouts` |
| Posts / media / follows / notifications / reports / audit | PASS | migrations phase 5–9 |
| Ownership + permissions in DB and app layer | PASS | RLS on every table + `asViewer()`; app-layer `requireViewer`/`can()` |
| No private data via public endpoints | PASS | `/api/health` reveals nothing; media only via signed `/api/media` |
| Creator referral tables | **NOT IMPLEMENTED** (this phase) | — |

## 7. Trust, safety and policy

| Requirement | Status | Evidence |
|---|---|---|
| Content reporting, blocking, moderation, appeals | PASS | `/takedown`, `/account/privacy`, `/admin/moderation`, `/studio/notices`, `safety.test.ts`, `notices.test.ts` |
| Copyright complaints (NCII takedown, 48h) | PASS | `safety-compliance.test.ts` |
| Account security (MFA, sessions, recovery) | PASS | `/account/security`, `mfa.test.ts` |
| Public Terms / Privacy / Community / Refund / AUP pages | **NOT IMPLEMENTED** | only `/takedown` + inline copy; needs counsel (L-7) |
| Recorded policy acceptance with version + timestamp | PARTIAL | `adult`/`terms` attestations are required at apply/activate; no versioned policy store |
| Account deletion / data requests | **NOT IMPLEMENTED** | — |

## 8. Root causes of the gaps found
- **Fan signup via a creator link** does not exist: the only account-creation paths are the owner-issued member invitation and creator provisioning. The `handle` is public but is not wired to registration.
- **No public policy pages**: policy text was deferred to counsel (L-7), so only inline copy and the takedown form exist.
- **Vault/checkout** are blocked by unapproved providers (storage/scan, payments) — by design, not bugs.
- **Referral analytics** were never modelled; `referral_requests` is an owner-mediated ask, not a shareable link.

## 9. This phase implements
1. **Creator referral links + fan signup** (sections 1, 6, 7): a stable `/join/<handle>`
   landing that validates the creator server-side, a `/signup?creator=<handle>` form
   that cannot be bypassed, attribution stored for the creator, and a creator-facing
   copy/QR/share block. Gated behind `FEATURE_CREATOR_REFERRALS` so the default
   invitation-only behaviour is unchanged until the owner enables it.
2. Tests for the flow (valid, invalid, suspended, bypass attempts).
3. Docs updates.

## 10. Not implemented / blocked (explicit)
- Media Vault uploads (storage/scan not approved), live checkout (payments off),
  public policy pages (legal review), account deletion, a dedicated fan home.
- Camera/video capture and payment-provider flows are **not verified** here — no
  physical device or provider is available; they are not claimed as working.
