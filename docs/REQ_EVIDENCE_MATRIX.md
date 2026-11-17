# Requirement evidence matrix (2026-11-15 changes)

Priorities: payment integrity and authorization first, then broken journeys,
then missing features. Placeholders are not completion.

## Verification (observed 2026-11-15, Postgres 18 on port 54329)

- Migrations apply clean: 34 files, including `20261126000001` guard fix
  (`search_path` includes `public`, `::public.citext`), `20261127000001`
  engagement (likes/comments/tips/folders/attachments + tips update policy),
  `20261127000002` notifications (new kinds, dedupe, column grants).
- `engagement.test.ts` 8 passed. `notifications.test.ts` 3 passed.
  `fan-dashboard.test.ts` 7 passed (updated for new preference fields).
  `mfa.test.ts` 15 passed, including recent-reauth disable with creator
  preservation (stale rejected, recovery-code challenge, fresh TOTP disable).
  Combined run: 4 files, 33 tests passed (observed 2026-11-15).
- UI suite: 26 passed. Types: clean for all touched files.

- REQ1 Creator identity — Done. `src/lib/creatorName.ts`, `studio/settings`,
  `creatorOnboarding.ts`, migration `20261126000001`, tests
  `creator-diva-naming`, `workspace-separation`, `onboarding`. Missing: none
  in code; production approval outside code. Verify: tsc clean for touched
  files; server tests need DB (unavailable here).
- REQ2 Fan experience — Mostly done. `club.ts`, `fan.ts`, media route
  HMAC+RLS, tests `club`, `fan`, `fan-dashboard`. Missing: real media bytes
  (placeholder study). Verify: UI suite 26 passed; server tests need DB.
- REQ3 Fees/referrals — Code done, settlement blocked. `ledger.ts`,
  `engine.ts`, `creatorReferralsAndWithdrawals.ts`, migration
  `20261125000001`, tests `payouts-refunds`, `two-owner-financials`.
  Missing: FX oracle, production enablement (A10). Verify: tsc clean; DB
  tests not run here.
- REQ4 Owner allocation — Code done, payout blocked. `ownerFinance.ts`,
  migration `20261122000001`, `owner/revenue` page, tests
  `two-owner-financials`. Missing: KYB/entity settlement. Verify: as above.
- REQ5 Payments/withdrawals — Partial. Integrity built, no live provider.
  See `docs/PAYMENTS_AND_WITHDRAWALS_STATUS.md`. Missing: Stripe adapter,
  KYB, webhook secrets, per-country written approvals. Verify: webhook route
  inert; `approvedProviders=[]` confirmed.
- REQ6 Creator tools — Partial. Tiers/posts/blasts working; likes, comments,
  tips (quoted), folders, attachments added this turn (`engagement.ts`,
  migrations `20261127000001`, tests `engagement.test.ts`). Media bytes and
  storage/scan providers still blocked (`FEATURE_UPLOADS` off). Tier-message
  meaning unresolved — see `docs/CREATOR_VISIBILITY_AND_TIERS.md`. Verify:
  tsc clean; DB tests not run here.
- REQ7 This matrix — Done (this file). Missing: none. Verify: content matches
  files cited; no simulated success claimed.
- REQ8 Notifications — Partial. Centre, unread, history, filters, prefs,
  secure deep links, dedupe, and tip wiring added
  (`notifications.ts`, `notifications/page.tsx`, `PreferencesForm.tsx`,
  migrations `20261127000002`). Email via existing outbox; push has no
  channel (blocked). Earnings read from ledger-backed pages, never
  fabricated. Verify: tsc clean; DB tests not run here.
- REQ9 Languages/privacy/age — Partial. EN/FR/AR chrome plus new
  notification strings, `ar` RTL, fan alias separation, mock-only age seam.
  See `docs/AGE_ASSURANCE_YOTI_EVALUATION.md`. Missing: full-page/date
  localization, approved age vendor. Verify: UI suite passed; age tests need
  DB.
- REQ10 Authenticator — Done. TOTP preserved; UI shows Set up / Enabled /
  Disable; disable needs recent AAL2 plus current code, revokes codes,
  audits, notifies, and keeps creator role (`mfa.ts`, `SecurityForms.tsx`,
  `account/security/page.tsx`, tests `mfa.test.ts`). No conflicting creator
  MFA requirement found. Verify: tsc clean; DB tests not run here.
- REQ11 Workspaces — Done. `workspace.ts`, migration `20261126000001`,
  layouts, actions, tests `workspace-separation`. Missing: none in code.
  Verify: prior suite cited; DB tests not run here.

## Verification this turn

- `npx tsc --noEmit`: no errors in touched files; pre-existing errors remain
  in `tests/server/workspace-separation.test.ts` (untouched).
- `npx vitest run --project ui`: 2 files, 26 tests passed.
- Server suites (`engagement`, `mfa`, `fan-dashboard`, schema lint) were
  added/updated but not run: no Postgres at `localhost:54329` in this
  environment. Run `pnpm db:migrate` then `pnpm test:server` where DB exists.
- No deploys, charges, payouts, blasts, or security changes were made live.
