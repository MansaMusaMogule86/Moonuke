# Security monitoring and email: tests

All results below come from real local runs of `pnpm verify` (PostgreSQL 18, isolated `divafans_test` and `divafans_e2e` databases). It's not CI: GitHub Actions is paused. External email is always mocked, so no real email was sent.

## Latest full run (2026-11-11, baseline before the creator allowlist)

```
✓ Typecheck · ✓ Dependency audit (no known vulnerabilities)
✓ Unit + PostgreSQL security tests: 356 passed · 35 files
✓ Production build · ✓ Production env check rejects unsafe config
✓ Browser suites: homepage 44/44 · access 70/70 · security+safety 66/66 · onboarding 43/43 · studio 39/39
  fan app 41/41 · messaging 44/44 · hardening 21/21 · safety+compliance 52/52 · notices 22/22
  age/regional 13/13 · moderators 11/11 · security monitoring 34/34 (all with axe at 1440 and 390 px)
✓ Backup + restore drill
PASS
```

## What is covered

`tests/server/security-monitoring.test.ts` (real Postgres):
- Exactly one sign-in event per session; refreshes and retried callbacks add none.
- Wrong passwords and unknown accounts never count as sign-ins. They get the same error, and no email, password or IP is stored.
- MFA: the password step is not a sign-in; a wrong code is recorded; the right code completes the sign-in once.
- Suspended accounts stay blocked: no session, a blocked event and a medium alert.
- Routine sign-ins never email anyone.
- An owner sign-in from a new device type raises a high alert that is emailed and tracked.
- Thresholds: per account (raised once, then deduplicated), credential stuffing, distributed failures, MFA failures.
- Registration and creator-application events: only after a valid invitation; never duplicated; the optional immediate email links to the protected console only.
- Access: fans, creators and an owner at AAL1 read zero rows; nobody can insert, update or delete events through the app role; the services refuse non-owners; views, searches and changes are audited.
- Trusted request data: spoofed forwarding headers are ignored; IPv4 /24 and IPv6 /48 prefixes; coarse device families only.
- Notifications: HTML escaping; provider failures back off and then fail; the digest is sent once per Dubai day at the configured time.
- Retention: off by default and only reports; when enabled, it deletes only expired, unreferenced telemetry and never touches accounts.

`tests/server/email-resend.test.ts` (provider mocked):
- **Transport:** the Resend request carries the key server-side, the idempotency key, and both HTML and text. Invalid recipients are permanent failures; 429 and 5xx are retryable; the key never appears in errors.
- **Delivery and logs:** delivery stores the provider id and scrubs bodies; logs carry neither the key nor the address.
- **Configuration:** malformed keys, addresses and time zones are rejected; production refuses an incomplete Resend setup.
- **Routing:** senders are chosen by purpose, and platform alerts go to `SECURITY_EMAIL_TO`.
- **Live-alert switch:** with `SECURITY_ALERTS_ENABLED` unset, alerts are recorded but their email is held as suppressed; once enabled they queue.
- **Welcome emails:** the account-created email is sent only after a valid invitation commits, with a confirmation link and no invitation token; user text is escaped; the creator approval email carries the studio step.
- **Email confirmation:** valid links work and are idempotent; tampered, expired and wrong-account links are refused; confirmation is audited once.
- **Account notices:** failed-attempt notices go to the holder, once per window; new-device notices are capped at 5 per account per hour.
- **Admin actions:** they raise `admin_action` alerts.

`scripts/e2e-security.mjs` (browser):
- Failed sign-ins through the real form raise an alert, and the message doesn't reveal whether the account exists.
- The owner console (overview, explorer, detail) works: acknowledge with a note, and detail views are audited.
- `/verify-email`: opening the link changes nothing, the button confirms, and tampered links are refused.
- Creators and fans get a 404 on every console route.
- Axe passes at 1440 and 390 px, with no horizontal overflow.
