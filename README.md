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

## Verify

```bash
pnpm lint           # TypeScript, strict
pnpm test           # 110 tests: UI (jsdom) and server security tests against real Postgres (TEST_DATABASE_URL)
NODE_ENV=production pnpm env:check   # validate a production configuration
pnpm build
# with a freshly seeded DB and a running server:
BASE=http://localhost:3000 node scripts/e2e-smoke.mjs     # Phase 1 interactions and axe
BASE=http://localhost:3000 node scripts/e2e-phase2.mjs    # Phase 2 flows and axe on every route
BASE=http://localhost:3000 DATABASE_URL=… node scripts/e2e-phase3.mjs   # recovery, MFA, safety, verification
```

CI (`.github/workflows/ci.yml`) runs all of the above on every push, against Postgres 16.

## Architecture

- **Phase 2 spec:** [`docs/phase-2-architecture.md`](docs/phase-2-architecture.md). It covers roles, flows, schema, RLS, routes, acceptance criteria and the **decisions that need approval**.
- **Design system:** [`docs/design-system.md`](docs/design-system.md). Live at `/design-system`.
- **Phase 3:** [`docs/phase-3-architecture.md`](docs/phase-3-architecture.md). Covers security, recovery, safety, verification, decisions and risks.
- **Deployment:** [`docs/deployment.md`](docs/deployment.md). Covers env rules, migrations, owner bootstrap and the go-live checklist.
- **Plans awaiting approval:** [`docs/supabase-auth-migration.md`](docs/supabase-auth-migration.md) and [`docs/verification-design.md`](docs/verification-design.md).
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
| 4–7 | Fan app and messaging, studio, storage, Supabase Auth switch, payments and ledger, release | Planned |

**Payments are not active.** No payment provider is registered, and checkout always returns an unavailable quote. **Nothing is deployed.**
