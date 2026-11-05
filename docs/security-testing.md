# Security testing

Every security rule is tested at **both** layers: the app layer (services and actions) and the database (direct RLS as `mk_app`). Everything runs with `pnpm verify`, which is a **local** run and not GitHub CI.

| Suite | What it proves |
|---|---|
| `tests/server/schema-lint.test.ts` | Every table has RLS; policies target `mk_app` only; PUBLIC has no grants; definer functions pin `search_path` and aren't executable by PUBLIC; guard triggers are SECURITY INVOKER; `mk_app` can't write entitlements or read credentials; `mk_app` isn't a superuser and can't bypass RLS |
| `tests/server/security-regression.test.ts` | Unauthorized UPDATE and DELETE on blasts, appeals, subscriptions, messages, notifications, posts and tiers touch **0 rows** and leave snapshots **identical**, while authorized updates still work. Blast worker re-checks, lease, concurrency (no double delivery), retries and dead-letter (fault injection), safe `{name}`, opt-out at delivery. Concurrent appeal decisions produce one outcome. The owner can't pause their own account |
| `tests/server/auth-regression.test.ts` | Session validity, logout, expiry, revoke-all, garbage tokens, suspension mid-session, role and AAL2 guards |
| `access`, `invitations`, `mfa`, `recovery`, `safety`, `verification` | Invitation-only access, approvals, MFA, recovery, blocking and reporting, verification (Phases 2–3) |
| `club`, `studio*`, `fan`, `messaging`, `blasts` | Entitlements, creator writes, vault and media, notifications, messaging permissions and moderation, Blasts and appeals |
| `payments.test.ts`, `media.test.ts`, `flags.test.ts` | Mock-only payment engine (idempotency, exactly-once, ledger balance and append-only, disputes, payouts, reconciliation, no viewer access); upload pipeline (signatures, quarantine, owner-only preview, cleanup); production refusal of every flag |
| Browser suites `e2e-*.mjs` | Real HTTP: identical 404s for missing and forbidden pages, signed-media binding, headers and CSP, no stack leaks, every role boundary; axe WCAG 2.1 AA at 1440 and 390 px |
| Backup and restore drill | A restored dump has the same tables, rows, RLS, policies, definers, triggers and grants |

## Rules for new tests
- Unauthorized writes: assert the **row count is 0** (or a `42501` error) **and** that a snapshot of the rows is unchanged. Also test the authorized path. A filtered update returning success isn't proof on its own.
- Privileged code (`system()`, workers) must re-check authorization itself. Tests must cover each refusal.
- Never weaken a policy, skip a check or loosen an assertion to make a test pass.

## Known gaps
- There is no third-party penetration test and no load test.
- GitHub CI is paused (A11), so these results come from local runs only.
