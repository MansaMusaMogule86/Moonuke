# Phase 3: Security, recovery, safety and verification

Built on `claude/cool-noether-uvf5h7`. Phase 1 and Phase 2 behaviour, tests and guarantees are preserved, and their suites still run green.

## Scope delivered

| Priority | Delivered |
|---|---|
| Secure auth & recovery | Hashed single-use reset tokens (30 min) and an enumeration-safe `/forgot`. A reset revokes all sessions and sends a notice. |
| Mandatory owner MFA | TOTP plus recovery codes. Owner powers need AAL2 in **both** layers: `can()` in the app, and `app.is_owner()` checking `app.aal` in the database. |
| Blocking & reporting | Blocks apply in both directions across profile, discovery and search, feeds, post content and media. Confidential reports. |
| Moderation & escalation | A severity-ordered queue. Hide, restore, suspend, dismiss, and escalate with an external reference. Critical post reports auto-hide the post and alert the owner. |
| Creator verification | Profile draft, four attestations, and an owner checklist. **Verify & publish** is required before members can see a profile. The schema is ready for a vendor; no vendor is connected. |
| Account security | Enrol, regenerate or disable MFA (the owner cannot disable it). Password change. List and revoke sessions. |
| CSP & headers | A per-request nonce with `'strict-dynamic'`, plus COOP, CORP, Permissions-Policy, and HSTS over https. |
| IP & rate limiting | `TRUSTED_PROXY` modes, validated IPs, and keyed-hash buckets (no plaintext emails or tokens). Limits on sign-in, MFA, recovery, reports and blocks. |
| CI | `.github/workflows/ci.yml`: Postgres 16, tests, build, and all three browser suites. |
| Stale admin UI | Rows own their status and update in place. **Done** refreshes the list. |
| Env & deployment | Zod-validated env, fail-fast production rules, `pnpm env:check`, and `docs/deployment.md`. |
| Branding | `src/config/brand.ts` holds the name, wordmark, sender, MFA issuer and cookie prefix. |

## Migrations (apply in order)
1. `20261106000001_phase3_email_recovery.sql`: email outbox and password resets.
2. `20261106000002_phase3_mfa_sessions.sql`: MFA factors and recovery codes, session `public_id` and `mfa_verified_at`. `is_owner()` now requires AAL2.
3. `20261106000003_phase3_safety.sql`: blocks, reports, moderation actions, hidden posts. Visibility functions are updated.
4. `20261106000004_phase3_creator_verification.sql`: creator verifications and `published_at`, plus the owner-only publish trigger.

## New routes

| Route | Access |
|---|---|
| `/forgot`, `/reset/[token]` | Public, rate-limited; the token is the credential |
| `/signin/verify` | A session awaiting its second factor |
| `/account/security` | Any signed-in account. It is the only area an un-enrolled owner can reach. |
| `/account/privacy` | Active members and creators |
| `/studio` | Active creators |
| `/admin/moderation`, `/admin/creators`, `/admin/email` | Owner at AAL2 (404 for everyone else) |

## Privileged (`system()`) additions
- Email delivery.
- Password reset issue and consume.
- MFA material (enrol, verify, disable, codes).
- Own-session listing and revocation (scoped to the viewer's id).
- After a critical report: auto-hiding the post and alerting the owner.
- Telling the owner that a creator submitted verification.

## Decisions taken (please confirm)

| # | Decision | Default |
|---|---|---|
| S1 | Critical post reports (possible minor, non-consensual, illegal) **hide the post immediately**, pending owner review | On. A malicious report can hide a post until the owner restores it. |
| S2 | Blocks are symmetric | Neither party sees the other |
| S3 | The owner cannot be blocked | — |
| S4 | Reporters see status only | They never see notes or escalation references |
| M1 | Owner MFA cannot be disabled; members may opt in or out | — |
| M2 | Password change keeps the current session and revokes all others | — |
| V1 | Phase 2 curated creators migrate as verified and published | — |
| V2 | The owner checklist is attested by the owner after out-of-band checks | Until a vendor is approved |
| E1 | Approval emails are sent; rejection emails are not | Avoids disclosing anything to a declined applicant |

## Remaining risks
- **Authentication is still our own.** The Supabase Auth switch is planned (docs/supabase-auth-migration.md) but not done. Re-importing scrypt hashes is unverified.
- **Manual verification only.** Age and identity checks depend on the owner's out-of-band process. Legal and record-keeping obligations need counsel.
- **Escalation is a record, not a pipeline.** There are no integrations with external reporting bodies. The owner must follow their jurisdiction's mandatory-reporting rules (for example, for suspected child sexual abuse material).
- **No media hashing or scanning.** CSAM/NCII hash-matching (e.g. PhotoDNA, StopNCII) is not integrated. It is a prerequisite before real uploads (Phase 4/5).
- **`style-src 'unsafe-inline'` remains.** React and Motion style attributes need it; scripts are nonce-locked.
- **Email deliverability is untested** against a real SMTP provider. None was purchased.
- **The first CI run did not start.** GitHub returned a failed job with no runner and no logs, which usually points to an Actions billing or permission setting on the repository. See the report.
