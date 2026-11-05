# MOONUKE

An invitation-only private creator club, styled in black and gold.

## Run locally

Requirements: Node 20 or later, pnpm, and PostgreSQL 15 or later (Supabase-compatible).

```bash
pnpm install
cp .env.example .env.local      # set DATABASE_URL and APP_SECRET
pnpm db:seed                    # DEV ONLY: resets schema `app`, migrates, loads fictional data
pnpm dev                        # http://localhost:3000
```

`pnpm db:seed` prints every dev account and two invitation links. Every seeded account uses the password `moonuke-dev-password`:

| Account | Email | State |
|---|---|---|
| Owner | `owner@moonuke.test` | The House. Two-step sign-in is required; the seed prints a dev-only TOTP secret |
| Member | `nocturne@moonuke.test` | VIP of Isadora, member of Zara and Orsolya, one PPV purchase |
| Member | `velvet@moonuke.test` | No memberships |
| Pending | `satellite@moonuke.test` | Awaiting approval |
| Creator (unverified) | `rhea@moonuke.test` | Draft profile awaiting verification |
| Creator | `<handle>@moonuke.test` | e.g. `isadora@…` |

For a real database, run `pnpm db:migrate` and then create the single owner:

```bash
OWNER_EMAIL=… OWNER_ALIAS="The House" OWNER_PASSWORD=… pnpm owner:create
```

## Verify (local — GitHub-hosted CI is paused)

```bash
pnpm verify          # the complete suite, one command, with a pass/fail report
pnpm verify:quick    # typecheck + unit + PostgreSQL security tests only
```

`pnpm verify` runs these steps in order:
1. Preflight.
2. TypeScript (strict).
3. Unit tests and PostgreSQL security tests.
4. Production build.
5. Production env-safety check.
6. Start a production server.
7. Reseed the database and run every Playwright browser suite with axe WCAG 2.1 AA checks (Phases 1–5 plus hardening).
8. Backup and restore drill.

A dependency audit (`pnpm audit --prod`) also runs. It is reported as skipped when the registry is unreachable.

It writes `reports/verify-report.md`, plus logs and screenshots in `reports/`. The report is labelled as a **local run, not GitHub CI**.

Browser suites reset their database, so `verify` uses a dedicated `<db>_e2e` database and `<db>_test` for server tests. Your dev database is never touched. Remote database hosts are refused.

The disabled workflow is kept at `ci/github-actions.disabled.yml`. To re-enable it, `git mv` it back to `.github/workflows/`.

## Documentation

**Start here (short handoff docs):** [`CLAUDE.md`](CLAUDE.md), then the docs below.

| Doc | What it covers |
|---|---|
| [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md) | What the product is, in one page |
| [`docs/CURRENT_STATUS.md`](docs/CURRENT_STATUS.md) | Completed phases, commits, tests, known issues |
| [`docs/NEXT_PHASE.md`](docs/NEXT_PHASE.md) | What to build next |
| [`docs/MASTER_PRD.md`](docs/MASTER_PRD.md) | Confirmed requirements, with unknowns marked |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System overview |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Approved decisions, defaults and open questions |
| [`docs/runbook.md`](docs/runbook.md) | Operations: health, logs, jobs, backups, incidents |
| [`docs/release-hardening.md`](docs/release-hardening.md) | Hardening checks and what remains |

Detailed references are linked below.

## Architecture

- **Phase 2 spec:** [`docs/phase-2-architecture.md`](docs/phase-2-architecture.md). It covers roles, flows, schema, RLS, routes, acceptance criteria and the **decisions that need approval**.
- **Design system:** [`docs/design-system.md`](docs/design-system.md). Live at `/design-system`.
- **Phase 3:** [`docs/phase-3-architecture.md`](docs/phase-3-architecture.md). Covers security, recovery, safety, verification, decisions and risks.
- **Deployment:** [`docs/deployment.md`](docs/deployment.md). Covers env rules, migrations, owner bootstrap and the go-live checklist.
- **Plans awaiting approval:** [`docs/supabase-auth-migration.md`](docs/supabase-auth-migration.md) and [`docs/verification-design.md`](docs/verification-design.md).
- **Phase 4:** [`docs/phase-4-architecture.md`](docs/phase-4-architecture.md). Covers white-glove onboarding, proposals, socials, imports and the profile assistant.
- **Phase 5:** [`docs/phase-5-architecture.md`](docs/phase-5-architecture.md). Covers the creator studio: posts and tiers.
- **Branding:** "Moonuke" is a working name. Everything brand-specific lives in `src/config/brand.ts`.

```
supabase/migrations/    SQL schema, RLS policies, SECURITY DEFINER entitlement helpers
src/server/
  db/                   asViewer() (RLS as mk_app) and system() (privileged, few call sites)
  auth/                 scrypt, tokens and HMAC, permission matrix, session cookie and guards
  services/             accounts, admin, referrals, club, sessions, rateLimit, audit
  actions/              server actions: zod-validated, permission-checked
  payments/             provider interface and an EMPTY approved-provider registry
  media/                signed short-lived media URLs and the placeholder renderer
src/app/
  /                     public marketing (no age-restricted media)
  /signin  /invite/[token]  /pending
  (club)/discover  (club)/c/[handle]  (club)/refer
  admin/…               owner console: applications, invitations, referrals, members, audit
  api/media/[postId]/[index]
```

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Identity, design system, homepage, navigation | Done |
| 2 | Invitation-only access, owner console, discovery, profiles, locked content, payment-ready UI | **Done** (see limitations in the Phase 2 doc) |
| 3 | Security, recovery, owner MFA, blocking/reporting/moderation, creator verification, CSP, CI | **Done** |
| 4 | White-glove onboarding, profile proposals, social connections, AI-assisted profile prep, approval pipeline | **Done** |
| 5 | Creator studio: posts (drafts, scheduling), tiers and analytics done; Blasts and earnings pending decisions | **In progress** |
| 6–7 | Fan app and messaging, storage, Supabase Auth switch, payments and ledger, release | Planned |

**Payments are not active.** No payment provider is registered, and checkout always returns an unavailable quote. **Nothing is deployed.**
