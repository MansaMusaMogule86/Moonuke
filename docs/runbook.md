# Operations runbook

For whoever runs the platform once deployment is approved. **Nothing is deployed today.** Commands assume the production environment variables are set (see `docs/deployment.md`).

## Health and logs
- **Health check:** `GET /api/health` returns `200 {"status":"ok"}` when the app can reach the database within 2 seconds. Otherwise it returns `503 {"status":"unavailable"}`. It reveals nothing else. Point the load balancer or uptime monitor at it.
- **Logs:** one JSON object per line on stdout/stderr (`src/server/log.ts`). The fields that matter:
  - `event`: for example `request.error`, `maintenance.done`.
  - `digest`: matches the "Reference" a user sees on the error page. Use it to find the line.
- **Redaction:** secret-looking keys, emails and long tokens are redacted, and query strings and invitation or reset tokens are stripped from paths. Do not add request bodies to logs.

## Scheduled jobs

| Command | Schedule | What it does |
|---|---|---|
| `pnpm email:drain` | every minute | Delivers queued email (safety net for in-request delivery) |
| `pnpm blasts:run` | every minute | Delivers due Blasts (idempotent; safe to overlap) |
| `pnpm maintenance` | daily | Deletes dead operational rows: rate-limit windows older than 2 days, expired or used reset tokens older than 7 days, sessions ended more than 30 days ago |

`pnpm maintenance` never touches the audit log, the email outbox, accounts or content. Their retention periods are a legal decision that is still open (`docs/DECISIONS.md` #5).

## Backups and restore
- **Backups:** use the database host's daily backups plus point-in-time recovery. Self-hosted, the minimum is:
  ```bash
  pg_dump --format=custom --file "moonuke-$(date +%F).dump" "$DATABASE_URL"
  ```
  Store dumps encrypted, off the database host. The audit log is append-only, so back it up and never prune it.
- **Restore** into a new database, never over the live one:
  ```bash
  createdb moonuke_restore
  pg_restore --exit-on-error --dbname "postgres://…/moonuke_restore" moonuke-YYYY-MM-DD.dump
  ```
  The role `mk_app` is cluster-level and **not** in a dump. Create it on a new cluster first, exactly as the first migration does (`supabase/migrations/20261105000001_phase2_access.sql`). Then point `DATABASE_URL` at the restored database and check `/api/health`.
- **Drill:** `pnpm verify` runs `scripts/backup-drill.mjs` against the local e2e database on every run. It dumps, restores into a scratch database, and checks row counts, RLS-enabled tables, policies, definer functions, triggers and `mk_app` grants. It then drops the scratch database. To drill a local copy by hand, run `node scripts/backup-drill.mjs postgres://localhost/…`. It refuses remote hosts. For production, drill with the host's restore tooling at least quarterly.

## Migrations
1. Back up first.
2. Run `pnpm db:migrate`. It applies each new file in `supabase/migrations/` once, in order.
3. Committed migration files are never edited; fixes are new migrations.
4. After migrating, `pnpm verify`'s schema lint (`tests/server/schema-lint.test.ts`) must still pass against a copy. It checks RLS on every table, policies limited to `mk_app`, no PUBLIC grants, pinned `search_path` on definer functions, and invoker guard triggers.

## Incidents

| Situation | Do this |
|---|---|
| A user's account is compromised | Suspend the user in Admin → Members, which ends access immediately. They recover through password reset, which revokes every session. |
| The owner lost their MFA device | Use a stored recovery code. If those are lost, an operator with database access must reset the owner's MFA. Record it in the audit log manually. |
| `APP_SECRET` leaked | Rotate it. This invalidates signed media URLs and rate-limit buckets. Stored MFA secrets can no longer be decrypted, so **every authenticator must be re-enrolled**: an operator clears `app.mfa_factors` and `app.mfa_recovery_codes`, and the owner is then held in mandatory enrolment. Test this path before go-live; it hasn't been exercised yet. Sessions survive, because they're random tokens stored as SHA-256, not signed. Revoke them if the database may also be exposed. |
| The database is exposed | Rotate the database credentials and `APP_SECRET`, revoke all sessions (`update app.sessions set revoked_at = now() where revoked_at is null`), and force password resets. Report it as required in each jurisdiction (open question #5). |
| A critical content report | Posts with critical reasons are hidden automatically on report. Review in Admin → Moderation and escalate as recorded (outside reporting is not wired yet). |
| A user sees an error | Ask for the "Reference" on the error page and search the logs for that `digest`. |

## Release checklist (in addition to `docs/deployment.md` §6)
- [ ] `pnpm verify` passes on the release commit. It's a local run: dependency audit, schema lint, backup drill and every browser suite.
- [ ] `pnpm env:check` passes with production values.
- [ ] Both scheduled jobs are configured, and `/api/health` is monitored.
- [ ] A log drain is set up. Spot-check that no emails or tokens appear in it.
- [ ] A production restore drill is done on the host's tooling.
