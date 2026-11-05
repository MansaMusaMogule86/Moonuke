# Master PRD (confirmed requirements only)

**Sources:** the owner's written briefs for Phases 1–4, plus the approved decisions in `docs/DECISIONS.md`. **The original "MOONUKE PRD" referenced in the first brief was never supplied to the repository.** Anything it may contain is unknown.

**Status key:**
- **Done**: built and tested.
- **Partial**: some of it exists.
- **Planned**: confirmed but not started.
- **UNKNOWN**: the requirement isn't specified; ask before building.

## 1. Product principles (confirmed)
- A luxury, editorial, black-and-gold identity. Not generic SaaS. Mobile-first; WCAG 2.1 AA; respects reduced motion. **Done**: `docs/design-system.md`.
- Design tokens are fixed:

  | Token | Value |
  |---|---|
  | Background | `#050505` |
  | Secondary background | `#101010` |
  | Elevated surface | `#171717` |
  | Gold | `#D6B56D` |
  | Soft gold | `#E8CC91` |
  | Muted gold | `#A88B45` |
  | Primary text | `#F6F0E6` |
  | Secondary text | `#AAA39A` |

  No purple, neon or cheap gold textures. **Done.**
- The working name must be easy to change. **Done**: `src/config/brand.ts`.

## 2. Access model (confirmed)

| Requirement | Status |
|---|---|
| Invitation-only; no unrestricted registration | Done |
| Single owner controls invitations, approvals, permissions, suspensions | Done |
| Invitations support expiry, revocation, use limits and secure tokens | Done |
| An invitation does not grant access; owner approval does | Done |
| Members and creators can request invitations; only the owner decides | Done |
| Discovery only for authenticated, approved members; public sees marketing only | Done |
| Mandatory owner MFA | Done |

## 3. Fan features (from the Phase 1 brief)

| Feature | Status |
|---|---|
| Discovery, search, filters, categories | Done |
| Creator profiles; follow / unfollow | Done |
| Subscription tiers, VIP, locked posts, pay-per-view (UI and entitlements) | Done (no real payment) |
| Private profiles and access controls | Done |
| Reporting and blocking | Done |
| Account security settings, session management | Done |
| Private content vault | **Done** (Phase 6): unlocked posts and signed media, checked by the database |
| Paid messages | Planned |
| Tips and gifting | Planned |
| Notifications | **Done** (Phase 6): in-app centre with read/unread; new posts and proposals; ready for Messaging and Blasts. No email or push |
| Purchase history | **Done** (Phase 6): live entitlement states; no amounts until payments exist |
| Subscription management | **Done** (Phase 6): status, period end, cancel at period end and keep. No billing or renewal |

## 4. Creator features (from the Phase 1 brief)

| Feature | Status |
|---|---|
| Creator onboarding; white-glove onboarding | Done (Phase 4) |
| Profile customisation (copy fields) | Partial: no images, cover or theme |
| Verification and approval workflow | Done (manual; no vendor) |
| Social profile connections (proof-code verification) | Done |
| AI-assisted profile preparation | Done (local template; Claude adapter opt-in, untested live) |
| Profile imports | **Done**: paste or export file, platform-agnostic; name, tagline, bio, links; always a proposal. Avatars deferred (needs storage) |
| Content publishing, media management, scheduled posts | **Partial** (Phase 5a): compose, draft, schedule, publish, edit, delete. No uploads (placeholder media) |
| Tier and VIP management, locked content, exclusive drops | **Partial** (Phase 5b): tiers editor, locked/VIP/PPV posts. Exclusive drops UNKNOWN |
| Blasts campaigns, fan messaging, audience segmentation, top fans | Planned |
| Referrals | Partial: invitation referrals exist; creator referral programme UNKNOWN |
| Earnings dashboard, revenue analytics, payout requests, transaction history | **Partial** (Phase 5c): audience and post analytics from existing data. Earnings blocked (payments inactive) |
| Creator security, content protection controls | Partial: MFA, sessions, signed media; watermarking and geo-blocking UNKNOWN |

## 5. Payments (confirmed constraints; none active)
- **Planned:**
  - A provider-independent system with adapters for Stripe, Apple Pay, Google Pay, CCBill, Segpay, Verotel and a compliant crypto provider.
  - Credential placeholders only. Never invent API contracts.
  - A capability registry, checkout abstraction, webhook signature verification and idempotency.
  - A payment state machine, refunds and disputes.
  - A double-entry ledger, balances, platform fees, payout eligibility and reconciliation.
  - Audit and currency handling.
- **Done:** the `PaymentProvider` interface with an **empty** registry, and server-quoted prices.
- **Crypto:** WalletConnect-style wallet auth, a supported-chain configuration, and a clear split between connecting a wallet and settling a payment. No custody of keys. Handle confirmations, fees, under- and over-payment, refunds and FX. **Planned. Not active until legal approval.**
- Enable a method **only after** the provider approves the business, the content category, the jurisdiction and the account. **UNKNOWN:** fee percentages, payout schedule, currencies, jurisdictions.

## 6. Security and compliance (confirmed)
- **Done:**
  - 18+ only, with marketing kept separate from age-restricted content.
  - RLS and server-side authorisation.
  - No permanent public media URLs.
  - Audit logs, rate limiting, CSP and security headers.
  - Moderation and escalation.
  - Consent and record-keeping attestations.
- **UNKNOWN** (needs counsel):
  - The jurisdictions served.
  - Record-keeping legal standards.
  - Mandatory-reporting process.
  - Age-assurance requirements for fans.
  - Retention periods.

## 7. Infrastructure (confirmed)
- Next.js, React, TypeScript, Tailwind, Motion, PostgreSQL (Supabase-compatible). **Done.**
- Supabase Auth is the *target*; migrate only after the plan is tested and approved. **Planned:** `docs/supabase-auth-migration.md`.
- Transactional email for invitations, recovery, approvals and security notices, with manual links still available. **Done.**
- An age and identity verification vendor: design it, but don't select one. **Done (design only).**
- No GitHub-hosted CI for now; all verification is local (`pnpm verify`). **Done.**

## 8. Original delivery order (from the Phase 1 brief)
Each phase's scope as delivered:

| Phase | Scope | Status |
|---|---|---|
| 1 | Identity, design system, homepage | Done |
| 2 | Discovery, profiles, VIP, locked UI, plus the invitation-only model | Done |
| 3 | Re-scoped by the owner to security, recovery, MFA, safety, verification, CI | Done |
| 4 | Re-scoped to white-glove onboarding | Done |
| 5 | Re-scoped by the owner to the creator studio (5a posts, 5b tiers done) | In progress |
| 6 | Payments, crypto and ledger | Remaining |
| 7 | End-to-end, hardening, release | Remaining |

**UNKNOWN:** whether the original Phase 3 (fan app, vault, messaging) and Phase 4 (creator dashboard, Blasts, analytics, earnings) are still wanted next, and in what order.
