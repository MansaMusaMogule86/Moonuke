# Security monitoring: architecture

Status: implemented on the development branch, **not deployed**. Production migration, email activation and retention all need approval (see "Approval gates").

## Audit of what existed (reused, not duplicated)

| Need | Existing piece reused |
|---|---|
| Client IP behind a proxy | `src/server/net/ip.ts` `clientIp()`: reads only the header the configured `TRUSTED_PROXY` guarantees (`none`, `vercel`, `cloudflare`, `hops:N`); never trusts a raw `X-Forwarded-For` |
| Approximate country | Proxy headers (`x-vercel-ip-country` / `cf-ipcountry`), the same source as the regional-rules gate. No third-party lookup, nothing synchronous added to sign-in |
| Correlating IPs and emails without storing them | Keyed HMAC with `APP_SECRET` (`hashIp`, plus a new `accountRef`) |
| Brute-force limits | `app.rate_limits` (`signinIp`, `signinEmail`, `mfaChallenge`…), unchanged. Tripping them is now also recorded as a failed attempt |
| Admin audit trail | `app.audit_log` (append-only) records every console view of an event, account search, alert change and settings change |
| Email | `app.email_outbox` + `deliverPending()`: added idempotency keys and exponential backoff instead of a second email system |
| Workers | Script-based jobs (`email:drain`, `blasts:run`, `maintenance`); added `security:run` alongside them |
| Authorization | `requireViewer(permission)`, the owner-only permission matrix, `asViewer()` under RLS, and `app.is_owner()` (requires an AAL2 session) |
| Admin UI | `/admin` console, `AdminTabs`, shared UI components |

**Missing before, so built:** structured security events, detection thresholds, deduplicated alerts, immediate and digest notifications, retention for this data, and the `/admin/security` console. There was no product analytics or tracking to separate from, and none was added.

## Flow

```
sign-in / MFA / invitation (server actions → services)
        │  requestMeta(): trusted IP → keyed hash + /24|/48 prefix, proxy country/region, UA families, correlation id
        ▼
src/server/security/monitor.ts   (system() — the only writer)
  recordLoginSuccess / recordLoginFailure / recordBlockedAttempt / recordMfaFailure / recordRegistration
        │  insert app.security_events (allowlisted metadata, dedupe key)
        │  detection in the same transaction → app.security_alerts (dedupe key + cooldown bucket)
        │  high/critical → app.email_outbox (idempotency key, hourly cap)
        ▼
pnpm email:drain / pnpm security:run (digest at Asia/Dubai time, retention when approved, flush email)
        ▼
/admin/security (owner, AAL2) → services/securityMonitor.ts via asViewer() under RLS, every action audited
```

## Where events are recorded (trusted server code only)

| Event | Call site | Rule |
|---|---|---|
| `auth.login.success` | `signIn()` when no second factor is needed; `verifyChallenge()` on success; `confirmEnrollment()` for an owner's first setup | Only after sign-in is complete. One per session (`dedupe_key = login:<session public id>`), so refreshes, retries and repeat callbacks add nothing |
| `auth.login.failed` | `signIn()` wrong password or unknown account; `signInAction` when the rate limit trips | Same record and same response for both cases: no account enumeration |
| `auth.login.blocked` | `signIn()` correct password on a suspended or rejected account | The account stays blocked |
| `auth.mfa.failed` | `verifyChallenge()` wrong code (recorded outside the rolled-back transaction) | |
| `auth.registration.completed` | `redeemInvitation()` after the account commits | Never on an invalid invitation or on merely opening a link |
| `creator.application.submitted` | Same, when the invitation's role is `creator`; references the `app.applications` row | The owner approval workflow is unchanged |

Recording never throws. A failure is logged as `security.monitor_failed` and, when the database is reachable, raised as a `monitoring_failure` alert. Sign-in continues either way, so a logging fault or an email outage can't lock people out.

## Detection (configurable in the console)

| Signal | Default | Severity | Email |
|---|---|---|---|
| Failures for one account (by keyed hash, so unknown accounts count too) in the window | 5 in 15 min | high (critical at 3×) | immediate |
| Failures from one network (IP hash) | 20 in 15 min | high | immediate |
| Distinct accounts tried from one network (credential stuffing) | 10 in 15 min | critical | immediate |
| Failures site-wide (distributed attack) | 100 in 15 min | critical | immediate |
| Failed second factors after a correct password | 5 in 15 min | high | immediate |
| Owner sign-in from a new device type (browser, OS and device family) | — | high | immediate |
| Sign-in from a country new for that account | — | warning (owner: high) | digest (owner: immediate) |
| Suspended or rejected account used its correct password | — | warning | digest |
| Monitoring could not record an event | — | high | immediate |

Alerts are deduplicated per signal per cooldown window (default 60 min, enforced by a unique key in the database), and alert emails are capped per hour (default 20). Geolocation never blocks anyone: country signals only raise alerts.

## Approval gates

Not done, and needing your explicit approval:
- applying `supabase/migrations/20261118000001_security_monitoring.sql` to production;
- scheduling `pnpm security:run` in production;
- switching retention on, which needs a migration because the console can't do it;
- publishing the privacy-notice text.

Email uses the existing transport, so no new provider or paid service is involved.
