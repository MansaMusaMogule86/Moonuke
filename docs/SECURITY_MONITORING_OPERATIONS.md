# Security monitoring: operations

## Environment variables

No new variables or secrets. It uses the existing ones:

| Variable | Role here |
|---|---|
| `TRUSTED_PROXY` | Which proxy header to trust for IP and country (`vercel` on Vercel, `cloudflare` behind Cloudflare, `hops:N` for a VPS behind N load balancers, `none` to trust nothing). Set it to match the real topology, or IP-based detection is skipped. **Hostinger VPS:** use `hops:1` behind a single reverse proxy that overwrites `X-Forwarded-For`, or `cloudflare` if fronted by Cloudflare |
| `APP_SECRET` | Keys the IP, account and device hashes. Rotating it breaks correlation with older events (acceptable) |
| `EMAIL_TRANSPORT`, `SMTP_URL`, `EMAIL_FROM` | Delivery of alerts and digests (existing transport) |
| `APP_URL` | Base of the console link in emails |

Country and region come from proxy headers: `x-vercel-ip-country(-region)` on Vercel, `cf-ipcountry` and `cf-region-code` on Cloudflare. Without them, location shows as unknown.

## Jobs

| Command | Schedule | Does |
|---|---|---|
| `pnpm email:drain` | every minute (existing) | Sends due email; failures back off |
| `pnpm security:run` | **every 15 minutes** (new) | Daily digest once per Asia/Dubai day at the configured time; retention when approved; flushes email |
| `pnpm maintenance` | daily (existing) | Unchanged |

Nothing schedules these yet. That's a deployment decision (cron on a VPS, or Vercel Cron calling a protected route), and it needs approval.

## Console

`/admin/security` is owner only, with the second factor required:
- **Overview:** 24-hour totals, creator applications awaiting review, open alerts with acknowledge, resolve and notes, countries, alert email delivery, recent events, and threshold settings.
- **Events (`/admin/security/events`):** server-side filters (type, severity, country, date range, account email) and pagination of 25 per page.
- **Event detail (`/admin/security/events/[id]`):** detail views and account searches are written to the audit log.

## Troubleshooting

| Symptom | Check |
|---|---|
| No IP prefix or country on events | `TRUSTED_PROXY` doesn't match the host, or the proxy doesn't send country headers |
| No alert emails | `EMAIL_TRANSPORT` (`disabled` suppresses everything), `/admin/email` for failed rows and their errors, and the hourly cap (`security.alert_email_capped` in logs) |
| `security.monitor_failed` in logs | An event couldn't be written; sign-in continued. A `monitoring_failure` alert is raised if the database was reachable |
| Digest didn't arrive | `security:run` isn't scheduled, or ran before the configured Dubai time; it's sent once per day (`security_digest:<day>` in `/admin/email`) |
| Too many alerts | Raise thresholds or the cooldown in the console; check for a real attack first |

## Performance

- Every detection query is indexed: by account ref, IP hash, type plus time, and actor.
- Each sign-in adds one short transaction. There's no synchronous network lookup, since geolocation comes from headers.
- The console paginates on the server, and digests aggregate in SQL.
- Security events are never sampled. Optional analytics don't exist, so there's nothing to sample.

## Rollback

1. Revert the application commit. The monitor calls disappear, and sign-in works exactly as before.
2. The schema is additive, so the tables can stay. To remove them:
   `drop table app.security_alerts, app.security_events, app.monitoring_settings; alter table app.email_outbox drop column dedupe_key, drop column next_attempt_at;`
   Then add a new migration recording the drop; never edit the original.

## Security limitations

- **Coarse device recognition.** A new browser, OS or device family counts as a new device type. Two identical laptops look the same, and a browser update doesn't trigger anything. This is deliberate, to avoid fingerprinting.
- **Location is approximate.** Location comes from the hosting network, so VPNs and mobile carriers can show the wrong country. It only alerts and never blocks.
- **No trusted proxy means no IP data.** With `TRUSTED_PROXY=none`, IP-based detection (per network, stuffing, distributed) has no IP data; per-account detection still works.
- **No auto-blocking.** Alerts don't block anyone automatically. The existing rate limits stay the enforcement layer.
- **Owner access.** The owner can read all security data. Every view of an event's detail and every search is audited, but list views are not.
