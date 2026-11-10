# Security email notification policy ("critical mode")

| What | When | Template |
|---|---|---|
| High or critical alerts: repeated failures over threshold, credential stuffing, distributed failures, MFA failures, owner sign-in from a new device type, owner sign-in from a new country, monitoring failures | Immediately (queued in the same transaction as the alert, delivered by the next `email:drain` / `security:run`) | `security_alert` |
| New registrations, new creator applications | In the daily digest by default; immediate if switched on in `/admin/security` | `security_alert` (info) |
| Routine successful sign-ins, warnings (new country for a non-owner, suspended account attempts) | Daily digest only, never one email per sign-in | `security_digest` |
| Daily digest | Once per Asia/Dubai day, the first `security:run` at or after the configured time (default 08:00) | `security_digest` |

The existing `owner_signin` security email (sent on every owner sign-in since Phase 3) is unchanged.

**Recipient.** The active owner account's email, read from the database at send time. There is no recipient environment variable and no hard-coded address.

**Content.** Alert emails carry only a summary built from allowlisted values (counts, window, browser, OS and device family, country code) and a link to `/admin/security`, which requires sign-in and the second factor. They never include passwords, codes, tokens, raw IPs, the submitted email, identity documents, messages or payment data. All dynamic text is HTML-escaped, which is tested.

**Reliability.**
- Every enqueue has an idempotency key (`security_alert:<alert id>`, `security_digest:<day>`), so a retried job never duplicates a message.
- Delivery retries with exponential backoff (1, 2, 4, 8… minutes, capped at 60) and gives up after 5 attempts (status `failed`).
- Delivery status is visible on the console's "Alert email delivery" panel and in `/admin/email`.
- Alert emails are capped per hour (default 20). Above the cap, alerts are still recorded and listed, and appear in the digest.
- Email is never the system of record for security logs; the database is.

**Transport.** The existing `EMAIL_TRANSPORT` (`smtp` with `SMTP_URL` and `EMAIL_FROM`, `dev`, or `disabled`). No new provider and no paid service. Production delivery needs an approved SMTP provider, which is already an open decision.

## Sending-domain authentication (for the approved provider)

Configure these on `divafans.io` DNS before production email is activated. They are DNS changes, so they need approval.

- **SPF:** a TXT record on the sending domain that includes the provider, e.g. `v=spf1 include:<provider-spf-domain> -all`.
- **DKIM:** publish the provider's selector public key(s) as TXT/CNAME records (`<selector>._domainkey.divafans.io`).
- **DMARC:** `_dmarc.divafans.io` TXT, starting with monitoring (`v=DMARC1; p=none; rua=mailto:<reports address>`) and moving to `p=quarantine`, then `p=reject`, once reports are clean.
- `EMAIL_FROM` must use an address on the authenticated domain.
