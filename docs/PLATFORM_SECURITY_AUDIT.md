# Platform security audit (2026-11-15, branch `security-audit-20261115`)

Working tree at audit time: prior session changes for REQ1–11 plus this
audit's fixes below. No deploys, charges, payouts, blasts, or live messages.
All verification local; Postgres 18 test cluster on port 54329.

## Baseline (observed, not claimed)

- Branch `security-audit-20261115`, cut from `claude/cool-noether-uvf5h7`
  (4 commits ahead of origin). `.git` is unreadable from the sandbox;
  git used only through an escalated shell.
- Entry points: Next.js App Router (~80 pages, 6 layouts), 5 API routes
  (health, age callback, media, messages, payments webhook inert),
  server actions, CLI workers (`blasts:run`, `email:drain`,
  `maintenance`, `security:run`).
- Auth: custom session-cookie provider, scrypt passwords, TOTP MFA,
  RLS through `mk_app` with per-transaction `app.user_id`/`app.aal`.
- Baseline failures at audit start: `tsc --noEmit` failed only in
  `tests/server/workspace-separation.test.ts` (stale `SeedResult`
  fields and call shapes), and its 5 tests failed at runtime for the
  same drift. Both fixed during this audit (see item 4 above).

## Trust boundaries and sensitive data flows

- Browser → server actions/API → `requireViewer`/`can()` → RLS (`mk_app`).
  Service role (`system()`) reserved for sessions, sign-in lookup,
  invitations, notifications, payouts, monitoring.
- Money: sandbox checkout → verified HMAC events → ledger postings →
  entitlements → notifications → refunds. Webhook route inert (404)
  until a provider is approved.
- Media: private uploads → magic-byte validation → scan → clean-only
  serve through triple-gated signed URLs (HMAC + session + entitlement).
- PII: emails/password hashes/MFA secrets reachable only by system role;
  fan aliases explicit; earnings/analytics carry no emails.

## Fixes applied in this audit

1. Removed the hardcoded sandbox webhook fallback secret
   (`SESSION_SECRET ?? "divafans-sandbox-..."`, never a real env name).
   The signing key is now derived from the required `APP_SECRET`
   (`src/server/services/checkout.ts`). Sandbox checkout still refuses
   production. No rotation needed: the old value never left the repo
   and was sandbox-only.
2. Fixed dead links that 404'd: `/apply?recruit=...` on the creator
   recruitment landing page (no such route; replaced with an honest
   house-invitation explanation plus working links) and `/rules`,
   `/terms`, `/privacy` on the account security page (removed; legal
   texts are house-provided, not invented here).
3. Fixed a production authorization bug the repaired tests exposed:
   `app.set_my_fan_alias` (and the users identity guard) cast to
   unqualified `citext` under a pinned `search_path = app, pg_temp`,
   so every fan-alias update failed with `type "citext" does not
   exist`. The RPC now resolves `public.citext`
   (`20261126000001`).
4. Repaired `tests/server/workspace-separation.test.ts` to the current
   APIs without changing its assertions (seed-field names, creator
   handles, `createSession` shape, verification-status enum value,
   allowlist fixture for the test creator, valid `app.tiers` /
   `app.subscriptions` shapes). This also clears the repo's `tsc`
   gate, which was red only because of this file.

## Verification

- `tsc --noEmit`: fully clean (the repaired test file cleared the gate).
- UI suite: 26 passed (observed earlier this session).
- Cross-account probes (local test DB, 8 checks): fan B sees none of
  fan A's conversations, purchases, media, or notifications; fans get
  no earnings or payout data; creator B cannot edit creator A's post;
  AAL1 cannot disable MFA. All denied as required.
- Full server suite, final: 44 files, 418 tests passed (observed
  2026-11-15/16, local Postgres 18), including the new
  `creator-recruitment` (5) and repaired `workspace-separation` (5)
  suites.
- Production build: unblocked by self-hosting Bodoni Moda + Jost
  (`src/app/fonts/*.woff2`, OFL, via `next/font/local`); `next build`
  passes with the full route table.
- `pnpm audit --prod`: no known vulnerabilities found.
- Backup restore drill (`scripts/backup-drill.mjs` on a disposable
  scratch DB): 90 tables, 320 rows, 163 policies, 108 definers
  functions, 45 triggers matched; scratch DB dropped afterwards.
- Migration upgrade path verified on a scratch DB for the citext
  search_path fix: fresh install applies all files; simulated
  pre-fix state reproduces `type "citext" does not exist`; forward
  migration `20261127000003` applies on top and resolves it; repeat
  migrate is a no-op; scratch DB dropped. Persistent environments
  that applied the old `20261126000001` are covered by the forward
  file, not by history edits.
- Referral journey (new `creator-recruitment.test.ts`, 5 passed):
  resolve-only-live-codes, capture with self/duplicate/cycle guards,
  confirm-requires-terms, own-attribution isolation, $100 sandbox sale
  after confirmation funds exactly $1.50 and nothing before.
- Money-path suites re-run focused: 6 files, 47 tests passed
  (payments, payouts-refunds, earnings, creator-referral,
  creator-referrals-earnings-withdrawals, two-owner-financials).
- Creator recruitment redemption is wired end to end behind existing
  approvals: `/recruit/[code]` remembers a validated code in the
  `mk_recruit` cookie; the creator ApplyForm accepts it and captures
  attribution at signup (no privileges granted); Studio Referrals
  confirms with explicit terms; commissions accrue only on confirmed
  attribution.
- Mobile emulation (Edge, 390x844, touch): 34/34 guest/fan/creator
  routes correct (2 intentional 404s render the not-found page with
  no errors); 17/17 key pages show zero overflow, landmarks, and
  skip links; plus 39/39 owner/admin/invite routes correct
  (invite token renders the apply form; dynamic [id] misses and the
  flag-gated /verify-age render clean 404s by design). No physical
  device or visual design review.
- Provider sandbox readiness: `env-check` passes for development;
  the sandbox checkout path is exercised by tests (mock HMAC,
  idempotent replays, ledger balance, refund reversal,
  $100 → $85/$15/$1.50); `FEATURE_PAYMENTS` stays off with production
  refusal until an approved processor exists. No live credentials,
  charges, payouts, or messages were created.
