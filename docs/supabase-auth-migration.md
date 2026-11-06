# Plan: migrating authentication to Supabase Auth

**Status:** plan only. Nothing has been switched.

> **2026-11-06:** the owner supplied a Supabase project and asked for the client packages.
> - **Installed:** `@supabase/supabase-js` and `@supabase/ssr`.
> - **Configured:** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, validated in `src/server/env.ts`. The values are in `.env.local` only, which isn't committed.
> - **Server client:** `src/server/supabase/server.ts`. It **refuses to run while `AUTH_PROVIDER=own`**, and there is deliberately no browser client.
> - **Nothing else changed:** no data, schema or users were sent to Supabase, and the app still uses its own sign-in and Postgres.
> - **Still open:**
>   - A3 approval of the switch;
>   - the §10 questions;
>   - Supabase's acceptable-use position on adult content, in writing (DECISION_REGISTER P-6);
>   - the plan (staging, Free-tier pausing) for this project. Per decision D1 (Phase 3), the switch happens only after this plan is **tested on a staging copy and approved**.

## 1. What exists today

| Concern | Current implementation | Where |
|---|---|---|
| Identity | `app.users` (uuid `id`, citext `email`, `role`, `status`, `alias`) | migration `20261105000001` |
| Passwords | scrypt (N=2¹⁵, r=8, p=1), format `scrypt$N$r$p$salt$hash` | `src/server/auth/crypto.ts` |
| Sessions | Opaque 256-bit cookie token. The DB stores its SHA-256 in `app.sessions` and also holds `mfa_verified_at` and `public_id` | `services/sessions.ts` |
| MFA | TOTP in `app.mfa_factors` (AES-GCM encrypted) plus hashed recovery codes | `auth/totp.ts`, `services/mfa.ts` |
| Recovery | `app.password_resets` with hashed single-use tokens and email through the outbox | `services/recovery.ts` |
| Invitation-only gate | Invitation redemption creates a **pending** user. The owner approves | `services/accounts.ts`, `services/admin.ts` |
| RLS identity | `app.uid()` reads `current_setting('app.user_id')`, and `app.aal` is bound per transaction by `asViewer()` | `db/index.ts`, migrations |

## 2. Target

- Supabase Auth (GoTrue) owns credentials, sessions, password recovery email and TOTP MFA (`auth.mfa_factors`, JWT claim `aal`).
- `app.users` stays the source of truth for **role, status (pending/active/suspended/rejected), alias and invitation linkage**. Supabase Auth must never be able to make an account active on its own.
- Invitation-only stays: **public sign-up is disabled** in Supabase (`Disable signups` / `GOTRUE_DISABLE_SIGNUP=true`). Accounts are created server-side only, through the admin API during invitation redemption.

## 3. Identity mapping

| Item | Approach |
|---|---|
| User ids | Import every `app.users.id` as the **same** `auth.users.id`, so no foreign key changes. The admin create-user API accepts an `id` |
| Link column | Add `app.users.auth_user_id uuid unique references auth.users(id)`. It equals `id` for imported users and is kept for clarity |
| `app.uid()` | `coalesce(auth.uid(), nullif(current_setting('app.user_id', true), '')::uuid)`. This works for both paths during the transition |
| AAL | `app.is_owner()` checks `coalesce(auth.jwt()->>'aal', current_setting('app.aal', true)) = 'aal2'` (or `'2'`). The owner still requires AAL2 |
| Status gate | Unchanged. Helpers check `app.users.status = 'active'`, so a valid Supabase session for a pending or suspended account still sees nothing |
| Role claims | Optional custom access-token hook adding `app_role` and `app_status` for UX. **RLS must keep reading `app.users`**, never trusting claims for authorization |

## 4. Passwords

GoTrue can import some external hash formats (bcrypt is documented). **scrypt support must be confirmed against the Supabase version in use at migration time.** Do not assume it.

- **If scrypt import is supported:** import the hashes and users sign in unchanged.
- **If not (expected):** use *lazy migration*. Keep the current sign-in path for one release. On a successful scrypt verification, set the password in Supabase through the admin API and mark `migrated_at`. After the window, email the remaining users a reset link through Supabase recovery and disable the legacy path.
- Never export plaintext. Never send password hashes outside the database.

## 5. Sessions

- Existing `app.sessions` cookies stay valid until the cut-over release, then are revoked in bulk. Everyone signs in once more.
- After the cut-over, server actions use `@supabase/ssr` with `HttpOnly`, `Secure` and `SameSite=Lax` cookies. `asViewer()` sets `request.jwt.claims` / `role=authenticated` instead of `app.user_id`.
- The "list and revoke sessions" feature maps to Supabase's session admin APIs. **Confirm per-session revocation granularity before cut-over.** If it isn't available, keep `app.sessions` as a session registry keyed by the Supabase `session_id` claim.

## 6. MFA

- Owner TOTP secrets are encrypted with our key and **cannot be re-imported** into Supabase MFA. The owner (and any members with MFA) re-enrol through Supabase's TOTP enrolment during the cut-over. For the owner this is a supervised step.
- Mandatory-owner-MFA enforcement stays in the app (`requireViewer`) and in RLS (`aal` check).
- Recovery codes: Supabase does not issue recovery codes in the same way. **Decide before the switch:** keep our recovery-code table, or rely on multiple factors.

## 7. Invitations, approvals and recovery email

- `redeemInvitation()` keeps its transaction. It calls `auth.admin.createUser({ id, email, password, email_confirm: false })` and then inserts the pending `app.users` row. If either step fails, the other is compensated (delete the auth user).
- Owner approval is unchanged (`app.users.status`).
- Password recovery moves to Supabase's recovery flow. Templates are rebranded from `src/config/brand.ts`. Our `/forgot` and `/reset` pages are retired, or kept as a thin UI over Supabase.

## 8. Test plan (staging, before approval)

1. Restore a production snapshot into a Supabase staging project.
2. Run the import script in dry-run mode and diff the user counts and ids.
3. Run the full suite with the Supabase identity path: `pnpm test` plus all three browser suites, with an added fixture for Supabase sessions.
4. Run the authorization regression tests:
   - a pending user with a valid Supabase JWT sees nothing;
   - an AAL1 owner JWT has no owner powers;
   - a suspended user's tokens stop working within the JWT lifetime (set a short `jwt_expiry` and revoke refresh tokens on suspend).
5. Rehearse the owner's MFA re-enrolment and rollback.

## 8b. Prepared in Phase 8 (not active)
- The `AuthProvider` seam (`src/server/auth/provider.ts`): `own` is implemented; the `supabase` stub refuses. `AUTH_PROVIDER=supabase` is refused in production.
- The regression suite to run against both providers: `tests/server/auth-regression.test.ts`.
- Authorization (`can()`, RLS through `asViewer`) is unchanged by a provider switch.

## 9. Rollback

- Keep the legacy columns and tables (`password_hash`, `app.sessions`, `app.mfa_*`) read-only for one release.
- The dual-path `app.uid()` allows switching back by a feature flag: `AUTH_PROVIDER=legacy|supabase`.

## 10. Open questions for approval
- Can the Supabase version in use import scrypt hashes? This decides between direct import and lazy migration.
- How do we handle recovery codes (§6)?
- Do we need per-session revocation (§5), or is "sign out everywhere" enough?
- What JWT lifetime do we accept, given suspension latency?
