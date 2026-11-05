# Release hardening

The owner chose release hardening after Phase 5c. Everything here is local and free: no services were bought and nothing was deployed.

| # | Item | Where | Checked by |
|---|---|---|---|
| H1 | Schema security lint (see below) | `tests/server/schema-lint.test.ts` | vitest (every `pnpm verify`) |
| H2 | Branded 404 and error pages. The 404 is identical for missing, forbidden and unpublished resources; error pages show only an opaque reference, never messages or stacks | `src/app/not-found.tsx`, `error.tsx`, `global-error.tsx`, in-shell `not-found.tsx` | `scripts/e2e-hardening.mjs` |
| H3 | `/api/health` (status only, no-store, 2-second database timeout) and redacted JSON error logs via `onRequestError` | `src/app/api/health/route.ts`, `src/server/log.ts`, `src/instrumentation.ts` | e2e-hardening; `tests/server/log.test.ts` |
| H4 | `pnpm maintenance`: deletes dead rate-limit windows, spent reset tokens and long-ended sessions | `src/server/ops/maintenance.ts` | `tests/server/maintenance.test.ts` |
| H5 | Backup and restore drill: dump, restore, then compare rows, RLS, policies, definers, triggers and grants | `scripts/backup-drill.mjs` | a `pnpm verify` step |
| H6 | Dependency audit (`pnpm audit --prod`): no known vulnerabilities at this commit | — | a `pnpm verify` step (skipped, not passed, when offline) |
| H7 | Code sweep. Only pre-auth actions lack `requireViewer` (sign-in, apply, sign-out, forgot, reset). The only raw HTML is the server-generated MFA QR SVG. Redirect targets are fixed. No SQL is built from input | — | manual, at `b08825e` |
| H8 | Operations runbook: health, logs, jobs, backups, restore, migrations, incidents | `docs/runbook.md` | — |

## What the schema lint checks
- Every table in schema `app` has RLS enabled.
- Every table that `mk_app` can read has at least one policy.
- Policies target `mk_app` only, never PUBLIC.
- PUBLIC has no privileges on any table.
- `mk_app` has no TRUNCATE, REFERENCES or TRIGGER privilege.
- `mk_app` can never write subscriptions or purchases, rewrite the audit log, or read password hashes, MFA material, reset tokens or sessions.
- Every SECURITY DEFINER function pins its `search_path` and is not executable by PUBLIC.
- Guard triggers are SECURITY INVOKER.
- `mk_app` is not a superuser, can't bypass RLS, and can't create objects in schema `app`.

The lint was checked against deliberate violations (a table without RLS and an unpinned, PUBLIC-executable definer function); both were caught.

## Defaults (confirmed by the owner, 2026-11-05)

| # | Default |
|---|---|
| R1 | Housekeeping windows: rate limits 2 days, reset tokens 7 days, ended sessions 30 days |
| R2 | No retention pruning of the audit log, outbox, accounts or content until the legal retention periods are decided |

## Not done (needs approval or decisions)
- An external log drain, error tracking or uptime monitoring service. All of these cost money or need an account.
- A penetration test or third-party security review.
- Load testing against production-like infrastructure.
- Legal retention periods and data export or deletion requests (DSAR). The legal questions are still open.
- Re-enabling CI (paused by A11).
