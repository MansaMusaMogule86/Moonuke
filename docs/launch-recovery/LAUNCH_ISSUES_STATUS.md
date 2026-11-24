# Launch Issues Status — DivaFans / Moonuke (Issues #1–#10)

**Audit date:** 2026-11-24  
**Repository:** `https://github.com/MansaMusaMogule86/Moonuke`  
**Integration branch:** `integration/divafans-launch-recovery-20261124`

> **Note on GitHub API access:** `gh` CLI is not installed in this local environment and unauthenticated requests to `api.github.com` returned empty (private repository). No GitHub issues were closed or modified remotely; each issue below is mapped against the repository implementation, automated tests, and documented external dependencies.

---

## Summary Table

| # | Issue | Priority | Technical Status | Overall Launch Status | Primary Blocker(s) |
|---|---|---|---|---|---|
| #1 | Core functionality | P0 | **Complete & Verified** | Ready for Staging | Live payments/uploads remain disabled by policy |
| #2 | Creator and fan dashboards | P0 | **Complete & Verified** | Ready for Staging | None for staging |
| #3 | Messaging, subscriptions & referrals | P0 | **Complete & Verified** | Ready for Staging | Live payment settlement disabled (sandbox only) |
| #4 | GitHub CI & production build | P1 | **Local Verify & Build PASS** | Blocked (Owner Approval) | GitHub Actions paused (`ci/github-actions.disabled.yml`); requires owner approval & account Actions check |
| #5 | Mobile, desktop & accessibility | P1 | **Verified (390/768/1440px + axe)** | Ready for Staging | None for staging |
| #6 | Security, MFA & owner financial isolation | P0 | **Complete & Verified** | Ready for Staging | External pentest & log drain prior to public prod |
| #7 | US LLC registration | P0 (Prod) | **Configurable Scaffolding Ready** | **Blocked (External/Legal)** | LLC formation (WY/DE), EIN, legal entity name, bank account not yet completed |
| #8 | Adult-compatible payment processing | P0 (Prod) | **Provider-Agnostic Interface Ready** | **Blocked (External/Commercial)** | No approved adult-compatible payment processor yet; live payments kept disabled |
| #9 | Infrastructure & safety providers | P0 (Prod) | **Workflows Built; Flags OFF** | **Blocked (External/Compliance)** | Managed Postgres, object storage, CSAM/NCII scan vendor, age-assurance vendor, verified email domain |
| #10 | Staging & launch readiness | P0 | **Staging Ready / Prod NO-GO** | **Staging GO / Prod NO-GO** | External approvals for Issues #7, #8, #9 + staging migration & env check |

---

## Detailed Issue Breakdown

### Issue #1 — Core functionality
- **Status:** Complete locally (sandbox/simulation mode).
- **Files:** `src/app/(club)/*`, `src/app/admin/*`, `src/app/invite/[token]/*`, `src/app/owner/page.tsx`, `src/app/(club)/studio/page.tsx`, `src/server/services/{accounts,club,creatorOnboarding,studio,fan,notifications,referrals}.ts`, `supabase/migrations/20261105000001`–`20261127000003`.
- **Fixes in this pass:** Unified active redirect handling in `src/app/pending/page.tsx` and `src/app/signup/page.tsx` via `resolvePostLoginDestination(viewer)`; restored unread moderation notices CTA (`Notices (N new)`) on `/studio`; added persisted `SIMULATED` confirmation banner on `/owner`.
- **Evidence:** 46/46 Vitest files (**444/444 tests**), **14/14 Playwright + axe E2E suites (533/533 checks)**, production build, and PostgreSQL backup-restore drill all passing.
- **Remaining blockers:** Live payments and media uploads remain intentionally disabled behind feature flags.

### Issue #2 — Creator and fan dashboards
- **Status:** Complete locally.
- **Files:** `src/components/layout/{ClubShell,ClubNav}.tsx`, `src/components/studio/StudioShell.tsx`, `src/components/owner/OwnerShell.tsx`, `src/server/services/workspace.ts`, `src/server/actions/workspace.ts`, `src/app/(club)/discover/page.tsx`.
- **Fixes in this pass:** Fixed Fan View identity display on `/discover` (replaced `viewer.alias` with `resolveWorkspaceIdentity(viewer, "fan").displayName`); hardened `switchWorkspaceAction` with `isAppError` handling.
- **Evidence:** `tests/server/workspace-separation.test.ts`, `tests/server/fan-dashboard.test.ts`, `tests/server/two-owner-financials.test.ts`.
- **Remaining blockers:** None for staging.

### Issue #3 — Messaging, subscriptions & referrals
- **Status:** Complete locally (sandbox/simulation mode; payments disabled).
- **Files:** `src/server/services/{messaging,blasts,creatorReferralsAndWithdrawals,earnings,referrals}.ts`, `src/app/(club)/messages/*`, `src/app/(club)/studio/{messaging,blasts,referrals,earnings}/*`.
- **Evidence:** `tests/server/messaging.test.ts`, `tests/server/blasts.test.ts`, `tests/server/creator-referrals-earnings-withdrawals.test.ts`, `tests/server/workspace-separation.test.ts`.
- **Remaining blockers:** Live payment settlement and real payouts remain disabled until Issue #8 is approved.

### Issue #4 — GitHub CI & production build
- **Status:** Local build (`pnpm build`) and local verification (`pnpm verify:quick`, backup drill, Playwright E2E) verified. GitHub Actions remains paused at `ci/github-actions.disabled.yml` per policy A10/A11.
- **Root cause of earlier CI stall:** GitHub Actions runs never acquired a runner (repository/account Actions billing block); workflow was intentionally moved out of `.github/workflows/` to `ci/github-actions.disabled.yml`.
- **Remaining blockers:** Owner approval (A11) and GitHub account Actions billing/runner verification before moving `ci/github-actions.disabled.yml` back to `.github/workflows/ci.yml`.

### Issue #5 — Mobile, desktop & accessibility
- **Status:** Verified across 390px mobile, 768px tablet, and 1440px desktop viewports with Playwright + `axe-core` WCAG 2.1 AA checks.
- **Files:** `scripts/e2e-smoke.mjs`, `scripts/e2e-phase*.mjs`, `scripts/e2e-owners.mjs`, `src/components/layout/ClubNav.tsx`, `src/styles/tokens.css`.
- **Remaining blockers:** None for staging.

### Issue #6 — Security, MFA & owner financial isolation
- **Status:** Complete and verified in real PostgreSQL 18 with RLS denial tests.
- **Confirmed owner identities (platform display identities, not legal identities):** `OWNER_001` (`Jade`, 50%, `Account A`) and `OWNER_002` (`Kael Veyre`, 50%, `Account B`).
- **Fixes in this pass:** Added `/verify-email/[token]` redaction to `src/instrumentation.ts` and idle `pg.Pool` error logging to `src/server/db/index.ts`.
- **Evidence:** `tests/server/schema-lint.test.ts`, `tests/server/rls-regression.test.ts`, `tests/server/mfa.test.ts`, `tests/server/two-owner-financials.test.ts`, `pnpm audit --prod` (0 vulnerabilities).
- **Remaining blockers:** External penetration test and production log drain before public launch.

### Issue #7 — US LLC registration
- **Status:** Technical configuration layer complete (`src/server/payments/descriptors.ts`, `app.platform_financial_config`); zero invented company data.
- **External Checklist Required Before Production:**
  1. Final legal entity name & formation state (Wyoming or Delaware LLC).
  2. Articles of Organization / Certificate of Formation.
  3. IRS EIN confirmation letter (CP 575).
  4. Operating Agreement reflecting verified legal ownership structure.
  5. Verified US business bank account & beneficial ownership (BOI/KYC) documents.
  6. Statement descriptor approval matching DBA/domain (`www.divafans.io`).

### Issue #8 — Adult-compatible payment processing
- **Status:** Provider-agnostic payment interface (`src/server/payments/index.ts`, empty `approvedProviders` registry), double-entry zero-sum ledger, webhook idempotency, dispute/refund handling, country payout capability matrix (`src/server/payments/countryEligibility.ts`), and 15%/85%/1.5% referral accounting are implemented and tested in sandbox.
- **Compliance note:** Do NOT assume Stripe will approve adult creator monetization; evaluate adult-compatible processors (e.g., CCBill, Segpay, Verotel, Epoch, or explicitly approved high-risk merchant acquiring + payout corridor providers).
- **Remaining blockers:** Processor underwriting approval, merchant agreement, sandbox-to-production adapter integration, and explicit owner activation.

### Issue #9 — Infrastructure & safety providers
- **Status:** All database and UI safety workflows (takedowns `/takedown`, 48h clock, pre-publication review gate, encrypted participant consent records, safeguarding queue, age assurance & geo-restriction seams) are built in PostgreSQL and kept safely disabled where third-party providers are absent.
- **Remaining blockers (external contracts/provisioning):**
  1. Production PostgreSQL host (Supabase/RDS/Neon with `mk_app` role grant and automated encrypted backups).
  2. Private object storage (S3/R2) + licensed CSAM/NCII hash-matching & malware scanning provider before `FEATURE_UPLOADS=on`.
  3. Approved age-assurance vendor before `FEATURE_AGE_ASSURANCE=on`.
  4. Verified transactional email domain (SPF/DKIM/DMARC) with Resend/SMTP.

### Issue #10 — Staging & launch readiness
- **Status:** **Staging GO (access-controlled, payments/uploads OFF)** · **Production NO-GO**.
- **See:** `docs/launch-recovery/LAUNCH_GO_NO_GO.md` for the full checklist and required approvals.
