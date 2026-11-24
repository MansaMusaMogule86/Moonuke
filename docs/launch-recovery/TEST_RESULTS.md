# Verification & Test Results — DivaFans / Moonuke

**Execution date:** 2026-11-24  
**Branch:** `integration/divafans-launch-recovery-20261124` (base `e2062e6`)  
**Environment:** Local Windows workstation · Node.js v26.13.0 · pnpm · PostgreSQL 18.1 (local port `54329`, isolated `divafans_test` and `divafans_e2e` databases)  
**Note:** All runs below are **local verification runs, not GitHub Actions CI**.

---

## Verification Summary Table

| Category | Command | Scope | Result | Details |
|---|---|---|---|---|
| **Static Typecheck** | `pnpm lint` (`tsc --noEmit`) | Entire TypeScript codebase (strict) | **PASS** | 0 errors |
| **Dependency Audit** | `pnpm audit --prod` | Production dependencies | **PASS** | 0 known vulnerabilities |
| **Full Unit + PostgreSQL Security Suite** | `pnpm verify:quick` (`vitest run`) | All 46 test files against real Postgres 18 | **PASS** | **444 / 444 tests passed** (46 / 46 files, 839.7 s) |
| **Post-Fix Targeted Server Suite** | `pnpm vitest run tests/server/workspace-separation.test.ts tests/server/access.test.ts tests/server/two-owner-financials.test.ts` | Workspace separation, access/RLS, two-owner 50/50 financials | **PASS** | **41 / 41 tests passed** (3 / 3 files, 87.3 s) |
| **Production Build** | `pnpm build` (`next build`) | Full Next.js 16.4.5 Turbopack production build | **PASS** | Compiled in 3.5 s, TypeScript 4.5 s, all routes built cleanly |
| **Browser E2E: Smoke, Responsive & Accessibility** | `node scripts/e2e-smoke.mjs` | 320–1920px layout, 390/768/1440px overflow, touch targets ≥ 44px, keyboard a11y, SEO, axe WCAG 2.1 AA | **PASS** | **44 / 44 checks passed** |
| **Browser E2E: Release Hardening & Security Headers** | `node scripts/e2e-hardening.mjs` | Branded 404, missing vs forbidden 404 parity, CSP nonce, HSTS/headers, `/api/health`, forged server action, axe WCAG 2.1 AA @ 1440 & 390px | **PASS** | **21 / 21 checks passed** |
| **Browser E2E: Two-Owner Dashboard & 50/50 Split** | `node scripts/e2e-owners.mjs` | Fan/creator denial on `/owner`, Jade & Kael Veyre MFA sign-in, Account A/B isolation, dual-owner approval (`PARTIALLY_APPROVED` -> `READY_FOR_PAYOUT`) | **PARTIAL** | Passed Steps 1–4 + dual-owner MFA approval; timed out on Step 5 UI banner (`Simulated payout run completed`) after `revalidatePath("/owner")` re-rendered the period into `SIMULATED` state. Backend simulation verified 17/17 in `two-owner-financials.test.ts`. |
| **PostgreSQL Backup & Restore Drill** | `node scripts/backup-drill.mjs` | `pg_dump` -> `pg_restore` -> schema/row/policy/trigger parity check | **PASS** | **90 tables, 323 rows, 163 RLS policies, 108 SECURITY DEFINER functions, 45 triggers matched** (dump 635 KB, 2.7 s) |

---

## Tests Not Executed & Why

- **GitHub Actions CI (`ci/github-actions.disabled.yml`)**: Intentionally paused per owner directive A10/A11; requires owner approval and account Actions billing verification before re-enabling.
- **Live payment, live payout, live upload/CSAM scan, and live email delivery**: Intentionally disabled behind server-enforced feature flags (`FEATURE_PAYMENTS=off`, `FEATURE_UPLOADS=off`, `EMAIL_TRANSPORT=dev`) because no external providers are approved or contracted yet.
- **Remaining legacy E2E scripts (`e2e-phase2`..`e2e-phase7`, `e2e-safety`, `e2e-notices`, `e2e-access`, `e2e-staff`, `e2e-security`)**: Note that their `signIn()` helpers still contain pre-workspace-separation `waitForURL(/\/(discover|...)/)` regexes without `home`; updating them like `e2e-hardening.mjs` and `e2e-owners.mjs` is tracked as a low-risk follow-up.
