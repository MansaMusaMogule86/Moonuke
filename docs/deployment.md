# Deployment and production configuration

**Nothing has been deployed.** This is the runbook for when deployment is approved. Payments stay disabled whatever the configuration (there is no approved provider).

## 1. Requirements
- Node 22 LTS and pnpm 10.
- PostgreSQL 15 or later. Supabase works; use the pooled connection string with a role that owns schema `app`.
- An HTTPS origin, behind a proxy you can name (Vercel, Cloudflare, or a load balancer you control).
- Optional: any SMTP provider for transactional email. None is pre-selected or purchased.

## 2. Environment
Everything is server-only and validated at boot (`src/server/env.ts`, `instrumentation.ts`). Check a configuration before deploying:

```bash
NODE_ENV=production pnpm env:check
```

| Variable | Production rule |
|---|---|
| `DATABASE_URL` | Required. Keep it in the host's secret manager. |
| `APP_SECRET` | Required, 32+ random characters. It signs media URLs, keys IP and rate-limit hashes, and derives the MFA encryption key. **Rotating it invalidates signed URLs and every enrolled authenticator** (owner re-enrols via mandatory setup). |
| `APP_URL` | Required. Must be `https://`. On Vercel it defaults to `https://$VERCEL_PROJECT_PRODUCTION_URL`; set it for a custom domain. |
| `TRUSTED_PROXY` | Required **explicitly**: `vercel`, `cloudflare`, `hops:N` or `none`. A wrong value allows spoofed IPs, or turns IP rate limits off (`none`). On Vercel (`VERCEL=1`) it defaults to `vercel`. |
| `EMAIL_TRANSPORT` | `smtp` or `disabled`. `dev` is refused. On Vercel it defaults to `disabled`. |
| `GOOGLE_SITE_VERIFICATION` | Optional. The `content` token from Search Console's HTML-tag method. Only the live site is indexable: Vercel previews (`VERCEL_ENV` ≠ `production`) and non-https builds serve `Disallow: /` and `noindex`. The sitemap lists the homepage only. |
| `SMTP_URL`, `EMAIL_FROM` | Required with `smtp`. |
| `ALLOW_LOCAL_PRODUCTION` | **Never set it in a deployment.** It is for localhost and CI only, and it is refused for non-localhost URLs. |

Choosing `TRUSTED_PROXY`:
- **Vercel:** `vercel`.
- **Cloudflare in front of anything:** `cloudflare`, and make sure the origin only accepts Cloudflare IPs.
- **One load balancer appending `X-Forwarded-For`:** `hops:1`.
- **Directly exposed:** `none`. IP-based limits are skipped; account-based limits still apply.

## 3. Database
```bash
pnpm db:migrate          # applies supabase/migrations/*.sql once each (or: supabase db push)
OWNER_EMAIL=… OWNER_ALIAS="The House" OWNER_PASSWORD=… pnpm owner:create
```
- Exactly one owner can ever exist; a unique index enforces it.
- On first sign-in the owner is confined to **mandatory TOTP enrolment**. Store the recovery codes offline.
- **Never run `pnpm db:seed` against production.** It refuses `NODE_ENV=production`, and it drops schema `app`.
- Enable point-in-time recovery and daily backups. The audit log is append-only by trigger, so back it up rather than pruning it.

## 4. Build and run
```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start            # behind your HTTPS proxy
```
Every HTML response carries a per-request CSP nonce (`src/proxy.ts`). The static security headers, including HSTS when `APP_URL` is https, come from `next.config.ts`.

## 5. Scheduled jobs
| Job | Schedule | Purpose |
|---|---|---|
| `pnpm email:drain` | every minute | Delivers queued email. This is a safety net; in-request delivery already runs via `after()`. |
| `pnpm blasts:run` | every minute | Delivers due Blasts. Idempotent. |
| `pnpm maintenance` | daily | Deletes dead rate-limit windows, spent reset tokens and long-ended sessions. Never touches the audit log, outbox or content. |

Health check: `GET /api/health`. Logs, backups, restore and incidents are covered in `docs/runbook.md`.

## 6. Before go-live checklist
These items, all from Phase 8, are code-complete and need an owner decision rather than engineering work:
- [ ] Feature flags are all off (`FEATURE_PAYMENTS`, `FEATURE_UPLOADS`, `AUTH_PROVIDER=own`, no mock providers). Production enforces this.
- [ ] Scheduled jobs: `email:drain`, `blasts:run`, `maintenance`.
- [ ] `/api/health` is monitored; the log drain is checked for redaction (`docs/runbook.md`).
- [ ] The visual identity question is resolved (`docs/DECISIONS.md`).

- [ ] Approval to deploy, and the legal/compliance review for an 18+ creator platform in each target jurisdiction.
- [ ] `pnpm env:check` passes with production values.
- [ ] The owner is created, MFA is enrolled and the recovery codes are stored offline.
- [ ] SMTP domain authentication is set up (SPF, DKIM, DMARC) if email is enabled.
- [ ] `pnpm verify` passes on the release commit (local), or CI if re-enabled with approval.
- [ ] Backups are configured and a production restore drill is done (`docs/runbook.md`). The local drill already runs in `pnpm verify`.
- [ ] Verification vendor decision (docs/verification-design.md). Until then, creator reviews are manual.
- [ ] Supabase Auth migration decision (docs/supabase-auth-migration.md).
- [ ] Payments remain disabled until a processor approves the business (Phase 6).

## 7. Rebranding
The product is **DivaFans**. The name, wordmark letters, descriptors, email sender name, MFA issuer and cookie prefix all live in `src/config/brand.ts`. Changing `cookiePrefix` signs everyone out, so it stays `mk`. The logo files are in `public/images/brand/` and the app icons in `src/app/` (see `docs/ASSETS.md`). Database identifiers (schema `app`, role `mk_app`) are brand-neutral.

**Secrets.** Only `APP_SECRET` is read. If a host still sets an older secret variable under another name, copy its value into `APP_SECRET`; startup fails loudly until it is set.

**MFA.** New authenticator enrolments show the issuer "DivaFans". Existing enrolments keep the label they were created with; their codes still work.

**Outside the repository (not changed or verified from here):**
- `EMAIL_FROM` on the host sets the email sender's display name. Change its name part to `DivaFans` while keeping the same, verified address.
- The GitHub repository name, the Vercel project name and any `*.vercel.app` hostname are set in those dashboards.
- **Public domain.** SEO and social metadata (metadataBase, canonical, `og:url`, `og:image`, robots, sitemap) always use `brand.siteUrl` = `https://www.divafans.io`. Invitation, reset and email links use `APP_URL`; set `APP_URL=https://www.divafans.io` in Vercel production so those links use the same domain. `divafans.io` → `www.divafans.io` and http → https redirects are handled by Vercel's domain settings (both return 308 today).
- **Link previews.** WhatsApp, Facebook, X and LinkedIn cache previews. After a deploy, re-scrape with the Facebook Sharing Debugger (WhatsApp uses the same crawler) or share the URL with a query string (e.g. `https://www.divafans.io/?v=2`) to see the new card; old chats may keep the cached preview.
- Supabase Auth email templates and site name only matter once `AUTH_PROVIDER=supabase`; update them in the Supabase dashboard before switching.
