# Phase 8 report: zero-cost production readiness

**Branch:** `claude/cool-noether-uvf5h7`. **Deployed:** no. **Paid services:** none. **Payments, uploads and Supabase Auth:** built and **disabled** (server flags, refused in production).

## 1. Completed implementations

**Security audit of Phase 7 (Blasts and appeals)**

| Area | Result |
|---|---|
| 3 per day and 5,000 recipients | Previously enforced only when the creator created a Blast. The **worker now re-checks** the daily cap in privileged code. The recipient cap is applied when deliveries are populated |
| Segments, per-recipient private delivery, opt-outs, blocks | Verified. Eligibility is re-checked per recipient at delivery |
| Concurrency | **Fixed.** A `sending` Blast could be re-claimed by a second worker at once; a lease (`lease_until`, renewed per batch) now prevents it. Idempotency is per Blast and fan, plus deterministic message keys |
| Creator ownership and authorization in the worker | **Hardened.** The worker re-checks creator role, status, published profile and messaging pause; refusals are cancelled and audited |
| `{name}` | **Fixed.** It used `replaceAll` with a string, so `$` patterns would be interpreted; it now uses a function replacement and a sanitised alias |
| Analytics identity disclosure | Verified: counts only; deliveries aren't readable by `mk_app` |
| Appeals | Verified: one per pause, owner-only decisions, overturn lifts the pause, audited. Concurrent decisions produce exactly one outcome (atomic `where status = 'open'`). **Fixed:** the owner couldn't previously be stopped from pausing (and so reviewing) their own account |
| RLS regression | A new suite asserts 0 rows touched **and** identical snapshots for unauthorized writes on 7 tables, and tests the authorized path too |

**Reliability and performance**
- Added indexes: `follows(creator_id)`; `subscriptions(creator_id, status, current_period_end)`; `subscriptions(tier_id)`; `purchases(post_id)`; `messages(blast_id)`; `reports(target_id)`; unread message notifications by conversation.
- Removed an N+1 query in Blast lists.
- Retries and dead-letter for Blast deliveries are covered by a fault-injection test.

**Provider-independent infrastructure, all OFF.** Details are in `docs/phase-8-infrastructure.md`.
- Server-enforced feature flags. Production refuses to boot with any enabled or with mock providers.
- **Payments:** state machine, HMAC webhook contract, idempotent engine, double-entry ledger (balance enforced by a deferred trigger, append-only), refunds, disputes, chargebacks, payout eligibility, reconciliation. Tested with a mock only.
- **Media:** magic-byte validation, size limits, storage and scanner interfaces, private-then-scan pipeline with quarantine, owner-only short-lived preview, abandoned-upload cleanup. Tested with mocks only.
- **Auth:** the `AuthProvider` seam (`own` implemented; `supabase` stub refuses) and an authentication regression suite.
- **Moderation:** staff capability design (inactive) and a retention configuration with every period `null`.

**CI:** the disabled workflow now runs `pnpm verify` and documents its cost. It remains disabled.

**Found and reverted:** route-level `loading.tsx` made `notFound()` return HTTP 200 because the response had already started streaming. That breaks the identical-404 guarantee, and the browser suites caught it. The skeleton component remains for client-side Suspense use only.

## 2. Files modified
- **Migrations (additive):** `20261113000001_phase8_hardening.sql`, `20261113000002_phase8_payments_media.sql`.
- **Server:**
  - `src/server/flags.ts`, `env.ts`;
  - `payments/{state,ledger,webhook,engine}.ts`;
  - `media/upload/{signature,types,mock,service}.ts`;
  - `auth/{provider,staff}.ts`;
  - `ops/{retention,maintenance}.ts`;
  - `messaging/blasts.ts`, `services/{blasts,messaging}.ts`.
- **Routes:** `src/app/api/payments/webhook/[provider]/route.ts` (404 while disabled).
- **UI:** `src/components/layout/PageLoading.tsx`.
- **Tests:** `security-regression`, `auth-regression`, `payments`, `media`, `flags` (new); `maintenance` and `net` (updated).
- **Config:** `.env.example`, `ci/github-actions.disabled.yml`.
- **Docs:** this report, `phase-8-infrastructure.md`, `security-testing.md`, `DECISIONS.md`, `NEXT_PHASE.md`, `ARCHITECTURE.md`, `deployment.md`, `supabase-auth-migration.md`, `CURRENT_STATUS.md`.

## 3. Security findings and fixes

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | Medium | The Blast worker could be run concurrently on the same Blast. Duplicates were already prevented, but the work was wasted and the counts raced | Lease column with expiry and per-batch renewal |
| 2 | Medium | The privileged worker trusted the Blast row: no in-worker re-check of the daily cap, creator status or pause | Re-checks with cancel and audit |
| 3 | Low | `{name}` used a string replacement (risk of `$&` interpretation) | Function replacement and alias sanitising |
| 4 | Low | The owner could pause their own account | Refused in the service |
| 5 | High (regression, caught before push) | `loading.tsx` turned 404s into 200s | Reverted; the hardening suite guards it |

No critical issue remains open that we know of.

## 4. Tests executed (local; **not** GitHub CI)
`pnpm verify` at the final commit, **PASS**:

| Step | Result |
|---|---|
| Typecheck | pass |
| Dependency audit | no known vulnerabilities |
| Vitest: UI and PostgreSQL security tests | **236 / 236** (26 files) |
| Build, env check | pass |
| Browser, Phases 1–4 | 17 / 17, 70 / 70, 66 / 66, 43 / 43 |
| Browser, Phases 5–7 | 39 / 39, 41 / 41, 44 / 44 |
| Browser, hardening | 21 / 21 |
| Backup and restore drill | 44 tables, 80 policies, 47 definers, 12 triggers matched |

- **Skipped:** none.
- **Blocked by missing services:**
  - real payment-provider, storage and scanner integrations (no adapters exist to test);
  - Supabase Auth against a real project;
  - email over real SMTP.
- **GitHub CI:** not run; Actions are paused (A11).

## 5. Remaining blockers
These are listed in `docs/NEXT_PHASE.md`:
- a payment provider and the commercial terms;
- storage and CSAM/NCII scanning providers;
- the Supabase project and the §10 answers;
- the ID-verification vendor;
- SMTP;
- hosting and deployment approval;
- legal retention periods and deletion policy;
- the moderator role;
- the visual-identity conflict.

## 6. Items requiring owner approval
- **Visual identity.** The brief asks for "distinct from black-and-gold", which conflicts with the approved identity. Nothing was changed.
- **Re-enabling CI.** It may use Actions minutes on a private repository.
- **Defaults:** U1, U2, PAY1, PAY2 (new), plus the earlier unconfirmed defaults.
- **Business policy:** fee basis points, payout minimum and hold period, and refund entitlement policy.
- Every provider selection.

## 7. External costs
None incurred. Paid services only become necessary once a provider is approved.

## 8. Recommended next engineering phase
Once the owner chooses providers:
1. Write the payment-processor adapter against `PaymentProvider` and `verifyHmac`.
2. Write the storage and scanning adapters against `StorageAdapter` and `SafetyScanner`.
3. Attach clean uploads to posts and messages.
4. Run a Supabase Auth staging trial with the regression suite.

Without providers, the next useful work is accessibility and UX polish within the approved identity, plus a load-test plan.

## 9. Commit and push
The work is in the commits listed in `git log 566cedf..HEAD`. The push status is recorded in `docs/CURRENT_STATUS.md` after the push.
