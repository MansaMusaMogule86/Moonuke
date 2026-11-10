# Security event schema

Migration: `supabase/migrations/20261118000001_security_monitoring.sql`. All timestamps are UTC (`timestamptz`); the console and the digest display Asia/Dubai.

## `app.security_events` (append-only for the app)

| Column | Notes |
|---|---|
| `id` bigserial | |
| `event_type` | `auth.login.success`, `auth.login.failed`, `auth.login.blocked`, `auth.mfa.failed`, `auth.registration.completed`, `creator.application.submitted` (CHECK) |
| `severity` | `low` / `medium` / `high` / `critical` (renamed from info/warning by migration `20261118000002`) |
| `actor_user_id` | Internal user id, or null for attempts against unknown accounts. The email is referenced through `app.users`, never copied |
| `account_ref` | HMAC-SHA256 (`APP_SECRET`) of the submitted email, lower-cased: correlates attempts without storing the address |
| `ip_hash` | The existing keyed IP hash used by rate limiting (no raw IP) |
| `ip_prefix` cidr | /24 (IPv4) or /48 (IPv6), so a network can be recognised but not a household |
| `ip_country`, `ip_region` | From the trusted proxy's headers only; approximate; validated format |
| `device_category`, `browser_family`, `os_family` | Coarse families from the user agent (`src/server/security/ua.ts`); no versions, no raw string |
| `device_key`, `new_device` | Keyed hash of user + device, browser and OS family: "is this a new kind of device for this account?" Not a fingerprint and not a cross-site identifier |
| `session_ref` uuid | The session's public id, never the token or its hash |
| `correlation_id` uuid | Per request; links events and the alerts they raise |
| `dedupe_key` unique | e.g. `login:<session>`, `registration:<user>`, `creator_application:<application>` |
| `metadata` jsonb | Allowlisted per type with strict zod schemas (unknown keys rejected); at most 1 KB (CHECK) |
| `retention_class` | `routine` by default; events an alert points to are kept for the incident period |
| `occurred_at` | |

Metadata allowlist:

| Type | Keys |
|---|---|
| `auth.login.success` | `method` (`password`/`totp`/`recovery`/`enrolled`), `role` |
| `auth.login.failed` | `reason` (`bad_credentials`/`rate_limited`) |
| `auth.login.blocked` | `status` (`suspended`/`rejected`) |
| `auth.mfa.failed` | `method` (`totp`/`recovery`) |
| `auth.registration.completed` | `role`, `invitation_id` (row id, never the token), `outcome` (`pending_approval`) |
| `creator.application.submitted` | `application_id`, `review_status` (`pending`) |

Never stored: passwords, MFA secrets or codes, session tokens or cookies, invitation or reset tokens, raw IPs, raw user agents, submitted emails, identity documents.

## `app.security_alerts`

`alert_type` (CHECK list, including `admin_action` for security-sensitive administrative actions), `severity`, `status` (`open` → `acknowledged` → `resolved`), `summary` (≤300 chars, built from allowlisted values only), `source_event_id`, `subject_user_id`, `note` (≤1,000 chars), `notified_outbox_id` (the queued email, for delivery tracking), `acknowledged_*`, `resolved_*`. `unique (dedupe_key, dedupe_bucket)` enforces one alert per signal per cooldown window.

## `app.monitoring_settings` (single row)

Thresholds, window, cooldown, hourly email cap, immediate-email switches for registrations and creator applications, digest time and time zone, and retention (`retention_enabled` defaults to **false**, with 30 and 90 days proposed). The owner can edit thresholds and notification preferences; retention columns are deliberately not writable by the app role.

## Notification deliveries

Reuses `app.email_outbox`, which gains `dedupe_key` (unique idempotency key), `next_attempt_at` (backoff) and `provider_message_id` (the Resend message id). Status, attempts, last error and send time were already tracked there. Alerts point at their email with `notified_outbox_id`.

## `app.users.email_verified_at`

Set when the account holder confirms the address from the `account_created` email. Informational only: it doesn't change admission. Readable by the owner (`mk_app` column grant).

## RLS and grants

- RLS is enabled on all three new tables; PUBLIC has no privileges.
- `mk_app` may **select** events, alerts and settings, and may **update** only the alert-workflow columns and the threshold/notification columns, all behind policies `using (app.is_owner())`, which requires an active owner with an AAL2 session.
- `mk_app` cannot insert, update or delete events, and cannot create alerts. Only `system()` in `src/server/security/*` writes them.
- Creators, fans and moderators (staff grants) have no policy that matches, so they read zero rows. The tests check this at both the app layer and the database layer.
