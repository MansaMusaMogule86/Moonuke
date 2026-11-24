# Security Review Report — DivaFans / Moonuke

**Review date:** 2026-11-24  
**Branch:** `integration/divafans-launch-recovery-20261124` (base `e2062e6`)  
**PostgreSQL version tested:** PostgreSQL 18.1 (local isolated test & e2e databases)

---

## 1. Security Architecture Verified

| Control Domain | Implementation | Verification Evidence | Status |
|---|---|---|---|
| **Authentication & Sessions** | Custom scrypt password hashing (`src/server/auth/crypto.ts`), SHA-256 hashed session tokens in `app.sessions`, `__Host-` `HttpOnly` `Secure` `SameSite=Lax` production cookies | `tests/server/access.test.ts`, `tests/server/sessions.test.ts` | **PASS** |
| **TOTP MFA & AAL2 Enforcement** | Encrypted TOTP secrets (`app.mfa_factors`), single-use recovery codes, mandatory AAL2 for owners in both app (`requireViewer`) and DB (`app.is_owner()` checks `app.aal = '2'`) | `tests/server/mfa.test.ts`, `tests/server/two-owner-financials.test.ts` | **PASS** |
| **PostgreSQL Row-Level Security (RLS)** | All viewer queries run via `asViewer()` as unprivileged `mk_app` role; `SECURITY DEFINER` helpers pin `search_path = app, pg_temp`; guard triggers are `SECURITY INVOKER` | `tests/server/schema-lint.test.ts`, `tests/server/rls-regression.test.ts` | **PASS** |
| **Two-Owner Financial Isolation** | Verified `OWNER_001` (`Jade`, 50%, `Account A`) and `OWNER_002` (`Kael Veyre`, 50%, `Account B`); immutable double-entry zero-sum ledger; dual-owner MFA approval required; live transfers disabled | `tests/server/two-owner-financials.test.ts` | **PASS** |
| **Creator & Fan Workspace Isolation** | Separate `fan_alias` vs `Diva [Name]` creator identity; scoped fan vs creator inbox & unread counts; ordinary fans blocked from Creator Studio routes/actions and creator referral nominations | `tests/server/workspace-separation.test.ts`, `discover/page.tsx` fix | **PASS** |
| **Media & Locked Content Protection** | Locked post/message content never leaves the server without DB entitlement; short-lived HMAC-signed URLs via `/api/media/[postId]/[index]` | `tests/server/access.test.ts`, `tests/server/fan-dashboard.test.ts` | **PASS** |
| **CSP & HTTP Security Headers** | Per-request cryptographic nonce CSP (`src/proxy.ts`, `src/server/net/csp.ts`), `X-Frame-Options: DENY`, `nosniff`, `COOP: same-origin`, HSTS when HTTPS | `tests/server/security-headers.test.ts` (and `e2e-phase3.mjs`) | **PASS** |
| **Rate Limiting & Audit Logging** | Keyed-hash rate limiting (`app.rate_limits`), immutable `app.audit_log`, redacted JSON error logging (`src/server/log.ts`) | `tests/server/security-monitoring.test.ts` | **PASS** |
| **Dependency Security** | `pnpm audit --prod` | 0 known production vulnerabilities | **PASS** |
| **Unsafe Production Config Guard** | `src/server/env.ts` + `src/instrumentation.ts` refuse unsafe production startup (missing `APP_SECRET`, HTTP `APP_URL`, `EMAIL_TRANSPORT=dev`, unapproved feature flags `FEATURE_PAYMENTS=on`, `FEATURE_UPLOADS=on`, etc.) | `pnpm env:check` negative test | **PASS** |

---

## 2. Findings Remediated in This Recovery Pass

| Severity | Finding | File(s) | Mitigation |
|---|---|---|---|
| **Low** | Creator public `Diva [Name]` rendered in `/discover` eyebrow instead of separate Fan View `fanAlias` | `src/app/(club)/discover/page.tsx` | Replaced `viewer.alias` with `resolveWorkspaceIdentity(viewer, "fan").displayName` |
| **Low** | Email verification token path `/verify-email/<token>` not redacted in `onRequestError` structured logs | `src/instrumentation.ts` | Added `.replace(/\/verify-email\/[^/]+/, "/verify-email/[token]")` |
| **Low** | `switchWorkspaceAction` did not catch `AppError`, allowing non-creator calls to surface generic error boundary | `src/server/actions/workspace.ts` | Added `isAppError` catch with safe role-appropriate redirect |
| **Low** | Idle `pg.Pool` error events lacked an error listener | `src/server/db/index.ts` | Added `pool.on("error")` redacted structured logger |

---

## 3. Remaining Security & Operational Risks (External / Pre-Launch)

1. **No external penetration test or load test yet** (scheduled prior to public launch).
2. **CSP allows `style-src 'unsafe-inline'`** (approved default `C1` for React/Motion inline styles; scripts remain strictly nonce-locked).
3. **Media uploads, CSAM/NCII scanning, and live payments remain intentionally disabled** behind server-enforced feature flags until licensed/approved third-party providers are contracted and integrated.
4. **Rate limits in production depend on `TRUSTED_PROXY`** matching the live edge proxy (`vercel` or `cloudflare`).
5. **No external log drain / SIEM or uptime alert sink configured yet** (structured JSON logs are emitted to stdout/stderr ready for drain attachment).
