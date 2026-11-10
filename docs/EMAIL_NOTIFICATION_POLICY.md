# Email and security notification policy

All email goes through the existing outbox (`app.email_outbox`): it's queued in the same transaction as the event that caused it, delivered by `pnpm email:drain` and `pnpm security:run`, retried with backoff, and tracked per message. Resend is a transport (`EMAIL_TRANSPORT=resend`) under that outbox, not a second email system.

## Senders

| Purpose | From | Templates |
|---|---|---|
| Welcome and onboarding | `WELCOME_EMAIL_FROM` (DivaFans &lt;welcome@divafans.io&gt;) | `invitation`, `account_created`, `account_approved`, `creator_verified` |
| Security | `SECURITY_EMAIL_FROM` (DivaFans Security &lt;security@divafans.io&gt;) | every `security_*` template, `password_reset`, `critical_report`, `takedown_alert`, `safeguarding_alert` |
| Everything else | `EMAIL_FROM` (falls back to the welcome sender) | notices and other operational mail |

## Welcome workflow (invitation-only, unchanged rules)

| Step | Email | When it's sent |
|---|---|---|
| 1. Invitation received | `invitation` | The owner issues an invitation with an email address (existing) |
| 2–4. Account created + email confirmation | `account_created` | In the same transaction that creates the account from a valid invitation. It's never sent for an invalid invitation or for merely opening a link. It contains a 7-day confirmation link (`/verify-email/…`, HMAC-signed, no invitation token) |
| 5–6. Invitation approved / Welcome to DivaFans / creator onboarding | `account_approved` | Only when the owner approves. Creators get "Set up your studio" linking to `/studio`; members get "Sign in" |
| Creator live | `creator_verified` | When the owner verifies a creator's profile (existing) |

Email confirmation only records `email_verified_at`. It doesn't change who may join or when an account opens. The link opens a page, and only the page's button (a POST) confirms, so mail scanners that prefetch links can't confirm an address.

## Security notifications

**Account-specific** (to the affected user):

| Notice | Template | Status |
|---|---|---|
| Sign-in from a kind of device not seen before on the account | `security_new_device` | New; held until `SECURITY_ALERTS_ENABLED=true` |
| Repeated failed sign-ins on the account (once per alert cooldown) | `security_failed_attempts` | New; held until enabled |
| Password changed (including after a reset) | `security_password_changed` | Existing, sent today |
| Password reset requested | `password_reset` (the link itself) | Existing |
| Two-step sign-in enabled or disabled | `security_mfa_enabled`, `security_mfa_disabled` | Existing |
| Recovery code used | `security_recovery_code_used` | Existing |
| Other sessions signed out | `security_sessions_revoked` | Existing |
| Owner sign-in | `security_owner_signin` | Existing |
| Email address changed | — | **Not applicable:** the app has no email-change feature. If one is added, it must notify both the old and the new address |

Account notices are capped at **5 security emails per account per hour**, and each is deduplicated per event or alert.

**Platform alerts** (to `SECURITY_EMAIL_TO`, falling back to the owner's address): `security_alert` for high and critical alerts, plus the daily `security_digest`. These include:
- suspicious sign-in patterns (see `SECURITY_MONITORING_ARCHITECTURE.md`);
- owner sign-in from a new device or country;
- monitoring failures;
- **security-sensitive administrative actions** (`admin_action`):

| Action | Severity |
|---|---|
| Moderator capabilities granted | high |
| Moderator capabilities revoked | medium |
| Account suspended or reactivated | medium |
| Owner password changed or reset | high |
| Recovery code used to sign in to the owner account | high |
| Owner recovery codes regenerated | medium |

Medium and low alerts appear in the dashboard and the digest only. Immediate alert emails are capped per hour (default 20) and deduplicated per signal and cooldown window. Emails never trigger events, so notifications can't loop.

## Switch: `SECURITY_ALERTS_ENABLED`

`false` (the default, and the shipped value): `security_alert`, `security_digest`, `security_new_device` and `security_failed_attempts` are **recorded with status `suppressed`** and not delivered. Alerts are still recorded and shown in `/admin/security`. Existing account security notices and welcome email are unaffected. Set it to `true` only after the activation checklist in `SECURITY_MONITORING_OPERATIONS.md` passes.

## Content rules

- Never in email: passwords, MFA codes or secrets, session or reset tokens beyond the one-time link itself, invitation tokens beyond the invitation link, raw IPs, identity documents, messages or payment data.
- Alert emails carry a summary built from allowlisted values and a link to `/admin/security`, which requires sign-in and the second factor.
- Every dynamic value is HTML-escaped, and this is tested.
- Every message has a plain-text part.
- The layout is table-based with inline styles (Gmail, Apple Mail, Outlook), with a logo image that has alt text and a hidden preheader.

## Delivery and reliability (Resend)

- **Idempotency:** each outbox row's id is sent as Resend's `Idempotency-Key`, so a retried delivery is never sent twice. Enqueues use dedupe keys (`security_alert:<id>`, `security_digest:<day>`, `security_new_device:<event>`, …).
- **Retries:** retryable errors (network, 409, 429, 5xx) are retried with exponential backoff (1, 2, 4, 8… minutes, capped at 60), up to 5 attempts.
- **Permanent failures:** other 4xx responses, such as an invalid recipient or unverified sender, are marked `failed` at once.
- **Tracking:** the provider's message id is stored (`provider_message_id`). Status, attempts and the last error appear in `/admin/email` and on the security console.
- **Safe logging:** delivery failures log `email.delivery_failed` with the template, a permanent/retryable flag and `resend <status> <error name>`. The logger also redacts keys, tokens and email addresses.
- **Isolation:** the API key is read only on the server and is never sent to the browser.

## Sending-domain authentication

`divafans.io` must be added to Resend and verified before anything can send from `welcome@` or `security@`. As of 2026-11-11 the Resend account holds only `forward-focus-elevation.org` (status `not_started`); **`divafans.io` isn't on the account.** Resend then shows the exact records to add on `divafans.io` DNS:
- **SPF:** a TXT record on the `send` subdomain;
- **MX:** the bounce/return-path record;
- **DKIM:** a TXT record at `resend._domainkey`;
- **DMARC (recommended):** `_dmarc.divafans.io` TXT `v=DMARC1; p=none; rua=mailto:<reports address>`, moving to `quarantine` and then `reject` once reports are clean.

DNS changes need your approval.
