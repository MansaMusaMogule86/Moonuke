# Architecture (current system)

Detailed references:
- `docs/phase-2-architecture.md`: access model, RLS, routes.
- `docs/phase-3-architecture.md`: security, safety, verification.
- `docs/phase-4-architecture.md`: onboarding.
- `docs/deployment.md`: env and runbook.

## Stack
- **App:** Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict), Tailwind CSS 4, Motion, Vaul (bottom sheets).
- **Database:** PostgreSQL 15+, plain SQL, Supabase-compatible, accessed with `pg`. Migrations live in `supabase/migrations/` and are applied by `pnpm db:migrate` (or `supabase db push`).
- **Libraries:** zod (validation), nodemailer (optional SMTP), qrcode (MFA enrolment), @anthropic-ai/sdk (optional AI).
- **Tests:** Vitest (jsdom UI tests plus Node server tests against real Postgres) and Playwright scripts with axe-core.

## Application structure
```
src/config/brand.ts        all brand strings (working name)
src/styles/tokens.css      design tokens
src/proxy.ts               per-request CSP nonce (Next 16 "proxy")
src/instrumentation.ts     validates env at boot
src/app/                   routes: public, (club), account, admin, api/media
src/components/            ui/, brand/, layout/, club/, onboarding/, forms/, home/
src/server/
  env.ts                   zod-validated env; production refuses unsafe config
  db/                      asViewer() (mk_app + RLS) and system() (privileged)
  auth/                    crypto (scrypt, HMAC), totp, permissions, request guards
  services/                accounts, admin, club, referrals, sessions, mfa, account,
                           recovery, safety, creatorOnboarding, onboarding, rateLimit, audit
  actions/                 server actions (zod → requireViewer → rate limit → service)
  email/                   outbox + templates (dev | smtp | disabled)
  ai/                      profile assistant: template (default) | anthropic | disabled
  imports/                 profile import parser (local) + social link normalisation
  payments/                PaymentProvider interface, EMPTY registry
  verification/            VerificationProvider interface, EMPTY registry
  media/                   signed URL HMAC + placeholder SVG renderer
  net/                     trusted-proxy IP parsing, CSP and security headers
  seed/                    DEV-only fixtures
scripts/                   migrate, seed, create-owner, env-check, email-drain,
                           verify, e2e-smoke and e2e-phase2/3/4
```

## Authorization (two layers, both required)
1. **App layer.**
   - `requireViewer(permission)` checks the session, MFA state and account status. A missing permission returns 404.
   - `can()` reads the role matrix in `src/server/auth/permissions.ts`. The owner needs AAL2 for everything.
2. **Database layer.**
   - Viewer queries run as role `mk_app`, with `app.user_id` and `app.aal` bound per transaction. RLS is on for every table.
   - The policies rely on these `SECURITY DEFINER` helpers:
     - `app.uid()`, `is_active()` and `is_owner()` (requires `app.aal = '2'`).
     - `viewer_role()`.
     - `can_see_creator()` (status, published, visibility, blocks, subscription).
     - `can_view_post()` (preview, members, VIP, PPV, hidden).
     - `is_blocked_between()`, `creator_stats()`, `tier_seats_taken()`.
     - `my_blocks()`, `my_reports()`, `my_onboarding_case()`.
   - **Guard triggers (invoker):**
     - `creators_guard`: only the owner can publish or feature a profile.
     - `socials_guard`: only the owner can change verification status, and editing a link resets it.
     - The `audit_log` trigger makes the log append-only.

## Authentication (own implementation; Supabase Auth is the target)
- Passwords use scrypt (N=2¹⁵). Sign-in failures give one generic message.
- Sessions:
  - A 256-bit cookie token. The database stores only its SHA-256 in `app.sessions`.
  - The cookie is `HttpOnly` and `SameSite=Lax`, plus `__Host-` and `Secure` in production. Sessions last 14 days.
- MFA:
  - TOTP (RFC 6238) with the secret AES-256-GCM encrypted (HKDF from `APP_SECRET`) and replay protection.
  - 10 hashed recovery codes. Mandatory for the owner.
- Recovery: hashed, single-use reset tokens valid for 30 minutes. A reset revokes every session.

## Schema (by migration)

| Migration | Tables |
|---|---|
| `20261105000001_phase2_access` | users, invitations, applications, referral_requests, sessions, rate_limits, audit_log, categories, creators, tiers, posts, post_content, subscriptions, purchases, follows |
| `20261106000001_phase3_email_recovery` | email_outbox, password_resets |
| `20261106000002_phase3_mfa_sessions` | mfa_factors, mfa_recovery_codes (+ sessions.public_id, mfa_verified_at) |
| `20261106000003_phase3_safety` | blocks, reports, moderation_actions (+ posts.hidden_at) |
| `20261106000004_phase3_creator_verification` | creator_verifications (+ creators.published_at) |
| `20261107000001_phase4_onboarding` | onboarding_cases, profile_proposals, social_connections, ai_assist_usage |
| `20261108000001_phase4_profile_imports` | profile_proposals: `import` source, `import_hash` + unique index |

## Integrations

| Integration | Default | Opt-in | Notes |
|---|---|---|---|
| Email | `EMAIL_TRANSPORT=dev` (outbox only) | `smtp` (any provider) or `disabled` | Bodies are scrubbed after a real send |
| AI profile assistant | `AI_PROVIDER=template` (local) | `anthropic` + `ANTHROPIC_API_KEY`, `AI_MODEL` (default `claude-opus-5-5`) | Safety filter; usage metered without content |
| Payments | none | — | Empty registry. Quotes only |
| ID verification | manual owner checklist | — | Empty registry |
| Media | placeholder SVG through signed `/api/media` | object storage (planned) | Signed URLs last 5 minutes and are bound to the viewer |
| Client IP | `TRUSTED_PROXY=none` | `vercel`, `cloudflare`, `hops:N` | Required explicitly in production |

## Environment variables
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection |
| `APP_SECRET` | 32+ characters; legacy name `MOONUKE_SECRET` is still accepted |
| `APP_URL` | Public base URL |
| `TRUSTED_PROXY` | Which proxy header to trust for client IPs |
| `EMAIL_TRANSPORT`, `SMTP_URL`, `EMAIL_FROM` | Email delivery |
| `AI_PROVIDER`, `ANTHROPIC_API_KEY`, `AI_MODEL` | Profile assistant |
| `ALLOW_LOCAL_PRODUCTION` | Localhost QA only |
| `OWNER_*` | One-time owner bootstrap |

The template is `.env.example`.
