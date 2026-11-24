# Application Error Root Cause Analysis — Reference `713942793`

**Reported symptom:**  
Route error boundary (`src/app/error.tsx`) displayed:
> **SOMETHING WENT WRONG — A moment, please.**  
> *"We couldn't complete that. Nothing you entered was shared. Try again, or come back shortly."*  
> `Reference: 713942793`

---

## 1. Exact Error Boundary & Mechanism

- The exact copy and `Reference: <code>{error.digest}</code>` markup live in `src/app/error.tsx` (lines 16–18).
- In Next.js production builds (`next start` / Vercel), any uncaught server-side exception during a Server Component render or Server Action execution is redacted by Next.js and assigned a deterministic numeric `error.digest` (such as `713942793`), which is logged server-side by `src/instrumentation.ts` (`onRequestError` -> `request.error` redacted JSON line) and rendered to the user by `src/app/error.tsx`.
- Because `713942793` is a production digest from a remote deployment whose runtime logs are not present in this local workspace, we cannot inspect the remote Vercel log line directly. Instead, we systematically audited every Server Component, Server Action, DB connection path, and environment guard, and tested the full production build locally.

---

## 2. Verified Findings & Root Causes Addressed

### Confirmed Local Code Defects Fixed
1. **Unhandled `AppError` in `switchWorkspaceAction` (`src/server/actions/workspace.ts`)**
   - `switchWorkspaceAction` called `switchWorkspace(viewer, target)` without a `try/catch` for `AppError`. If an owner or non-eligible account triggered the action, `AppError("forbidden")` propagated uncaught into Next.js's `error.tsx` boundary (producing a numeric digest error screen instead of a clean redirect).
   - **Fix:** Wrapped `switchWorkspace` in `try/catch (isAppError)` with safe fallback redirects (`/owner` for owners, `/home` for fans), keeping `redirect()` outside the `try` block.
2. **Unhandled idle PostgreSQL pool errors (`src/server/db/index.ts`)**
   - `new Pool(...)` had no `pool.on("error", ...)` listener. When a remote/managed PostgreSQL server (e.g., Supabase pooler) terminates an idle backend connection, `pg.Pool` emits an unhandled `'error'` event that can crash the Node.js worker or break subsequent requests.
   - **Fix:** Attached a `pool.on("error", ...)` handler that writes a redacted structured log (`db.pool_error`) via `src/server/log.ts`.
3. **Token redaction gap in `onRequestError` (`src/instrumentation.ts`)**
   - `onRequestError` redacted `/invite/[token]` and `/reset/[token]`, but did not redact `/verify-email/[token]` from `request.path`.
   - **Fix:** Added `.replace(/\/verify-email\/[^/]+/, "/verify-email/[token]")`.
4. **Fan View identity leak & stale redirect targets (`discover/page.tsx`, `pending/page.tsx`, `signup/page.tsx`)**
   - `/discover` displayed `viewer.alias` (which is `Diva [Name]` for creators) instead of `resolveWorkspaceIdentity(viewer, "fan").displayName`.
   - `/pending` and `/signup` redirected active users to `/discover` instead of `resolvePostLoginDestination(viewer)`.
   - **Fix:** Updated all three routes to use `resolveWorkspaceIdentity` and `resolvePostLoginDestination`.

### Unresolved Remote Environment Hypotheses (Require Vercel / Staging Log Correlation)
Because the remote deployment's server logs for digest `713942793` are external to this workspace, verify the following in Vercel Runtime Logs by searching for `"digest":"713942793"`:
1. **Pending migrations on remote PostgreSQL:** Commit `e2062e6` adds migrations through `20261127000003_fix_citext_search_path.sql` (including `app.users.fan_alias` and `preferred_workspace` queried on every session lookup in `resolveSession()`). Running `e2062e6` against a database that has not executed `pnpm db:migrate` throws Postgres `42703` (`column u.fan_alias does not exist`) on every authenticated page, immediately triggering `src/app/error.tsx`.
2. **Production environment validation (`src/server/env.ts`):** On Vercel (`VERCEL=1`), missing `DATABASE_URL` or `APP_SECRET` (< 32 chars), or leaving `EMAIL_TRANSPORT=dev` / `ALLOW_LOCAL_PRODUCTION=true` set in Vercel env vars, causes `env()` to throw `Unsafe production configuration`, triggering `src/app/error.tsx`.
3. **Database role grant (`mk_app`):** Every `asViewer()` transaction executes `SET LOCAL ROLE mk_app`. If the remote `DATABASE_URL` role lacks `GRANT mk_app TO <db_user>`, Postgres throws `42501` (`permission denied to set role "mk_app"`).

---

## 3. Verification Evidence

- Local production build (`pnpm build`) and production server (`next start`) tested against a cleanly migrated and seeded PostgreSQL 18 database (`divafans_e2e`).
- All 46 Vitest test suites (444 tests) and Playwright browser E2E suites run without triggering `error.tsx` on any valid user journey.
- `scripts/e2e-hardening.mjs` verifies that genuine errors render the branded non-revealing error shell without leaking internal messages or stack traces.
