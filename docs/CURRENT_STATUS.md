# Current status

**Branch:** `claude/cool-noether-uvf5h7`. **Last code commit:** `07e2002`. **Deployed:** no. **Payments active:** no.

## Completed phases

| Phase | What | Commits |
|---|---|---|
| 1 | Identity, design system, homepage, responsive navigation | `3aa531d` |
| 2 | Invitation-only access, RLS schema, owner console, discovery, profiles, locked/PPV UI, signed media | `3602779`, `59d4436` |
| 3 | Brand centralisation and validated env; IP handling and CSP | `08edf4b` |
| 3 | Email and password recovery | `384159e` |
| 3 | Owner MFA and sessions | `675604b` |
| 3 | Blocking, reporting, moderation | `a548d22` |
| 3 | Creator verification | `a57bf0d` |
| 3 | Stale-UI fix | `123475a` |
| 3 | CI workflow, now disabled | `b5df861` |
| 3 | Docs | `5a6dfcd`, `de3e0a7` |
| 4 | Pause CI, add `pnpm verify` | `67629dd` |
| 4 | Onboarding server: cases, proposals, socials, AI assistant | `be7b342` |
| 4 | Onboarding UI and e2e tests | `0513865` |
| 4 | Studio fix, full verify passing | `43faf7f` |
| 4 | Profile imports: parser, service, migration, RLS, server tests | `1abb412` |
| 4 | Profile imports UI (studio, owner case page) | `aa94a7f` |
| 4 | Profile imports e2e and docs | `fd93768`, `738d683` |
| 5a | Studio posts: drafts, scheduling, publishing (server, RLS, tests) | `9698c20` |
| 5a | Posts UI and e2e | `81433c9`, `88fe9b7` |
| 5b | Studio tiers (server, RLS, tests) | `65181ac` |
| 5b | Tiers UI and e2e | `a552160` |
| 5 | Docs | `54bfd9e` |
| 5c | Studio analytics (aggregates only) and docs | `f296276`, `6e7a72b` |
| H | Hardening: schema lint | `487d667` |
| H | Hardening: 404/error pages, health, redacted logs | `32d8962`, `71bc38e` |
| H | Hardening: maintenance job | `851378f`, `63cac29` |
| H | Hardening: backup drill and dependency audit in verify | `b08825e` |
| H | Hardening: docs and runbook | `3abcf98` |
| 6 | Fan app server: vault, purchases, memberships, notifications (RLS, tests) | `2043552` |
| 6 | Fan app UI and e2e | `d35abcf` |
| 6 | Docs | `07e2002` |

What Phase 4 delivered:
- White-glove cases and the pipeline board.
- Profile proposals that need the creator's consent.
- Social connections verified by proof code.
- The AI profile assistant: local template, with Claude as an opt-in.
- Verified socials on profiles.
- Profile imports: paste text or upload a `.txt`/`.json` export. It's parsed locally into name, tagline, bio and links, always filed as a proposal, duplicate-proof, and the raw text is never stored.

What Phase 5 has delivered so far (the creator studio; details in `docs/phase-5-architecture.md`):
- **Posts** (`/studio/posts`): compose, draft, schedule, publish, edit, two-step delete.
  - Drafts and scheduled posts stay invisible and locked in RLS.
  - A bought post keeps its access level and publish time, and can't be deleted.
- **Tiers** (`/studio/tiers`): add, edit price, perks and seats, switch off, delete.
  - A subscribed tier keeps its kind and can't be deleted.
  - Seats can't drop below current members.
- **Analytics** (`/studio/analytics`): aggregate counts from existing data only — members, followers, weekly trend, tier fill, posts by state, pay-per-view unlocks. No fan identities, no view tracking, no money figures.

Release hardening (details in `docs/release-hardening.md`, operations in `docs/runbook.md`):
- A schema security lint covering RLS, policies, grants, definer `search_path` and invoker guards.
- Branded, non-revealing 404 and error pages.
- `/api/health` and redacted JSON error logs.
- `pnpm maintenance`.
- A backup and restore drill, plus a dependency audit, both inside `pnpm verify`.

Phase 6, the fan app (details in `docs/phase-6-architecture.md`):
- `/library`: overview of memberships, following, the latest vault posts and counts.
- `/library/vault`: unlocked posts with signed, viewer-bound media, checked by the database.
- `/library/memberships`: cancel at period end, and keep.
- `/library/purchases`: live entitlement state; no amounts are shown, because no payments exist.
- `/notifications`: read and unread, with an unread badge; ready for Messaging and Blasts.

What's still open is in `docs/NEXT_PHASE.md`.

## Test results (last full local run: `pnpm verify` at `07e2002`, PASS, ~7.5 min)
This was a **local** run. GitHub Actions did not run.

| Step | Result |
|---|---|
| TypeScript strict | pass |
| Dependency audit (`pnpm audit --prod`) | no known vulnerabilities |
| Vitest: UI and PostgreSQL security tests, including schema lint | 183 / 183 (19 files) |
| Production build, env-safety check | pass |
| Browser, Phase 1 (homepage and axe) | 17 / 17 |
| Browser, Phase 2 (access, entitlements, axe) | 70 / 70 |
| Browser, Phase 3 (recovery, MFA, safety, verification, axe) | 66 / 66 |
| Browser, Phase 4 (white-glove flow, profile import, axe) | 43 / 43 |
| Browser, Phase 5 (studio posts, tiers, analytics, axe) | 39 / 39 |
| Browser, Phase 6 (fan app, signed media, cancellation, notifications, axe) | 41 / 41 |
| Browser, release hardening (404s, headers, health, leaks, axe) | 21 / 21 |
| Backup and restore drill | 28 tables, 62 policies, 22 definer functions, 8 triggers matched |

## Known issues and limitations
- **Auth:** our own implementation; the Supabase switch is planned, not done. There's no ID-verification vendor; checks are manual.
- **Studio:** no uploads, Blasts or earnings yet; analytics are counts only.
- **Fan app:** no messaging, tips, notification preferences or email or push notifications. The unread badge updates on navigation, not live. Memberships never renew, because there's no billing. Scheduled posts go live silently, with no notification.
- **Media:** placeholder SVGs only. No uploads, no object storage, no CSAM/NCII hash-matching (required before real uploads).
- **Email:** never sent through a real SMTP provider.
- **AI:** the Claude adapter is typechecked against the official SDK but **never called live** (no key, no cost).
- **Safety filter:** pattern-based, not a classifier.
- **Social verification:** manual; there are no platform APIs.
- **Imports:** generic parsing only, with no per-platform adapters or OAuth. No avatar or image import, because there's no storage yet.
- **Escalation:** recorded only, not wired to outside reporting bodies.
- **CSP:** allows inline styles.
- **Rate limits:** depend on a correctly set `TRUSTED_PROXY`.
- **Ops:** no external log drain, uptime monitor or error tracker (they need accounts or money). No pentest or load test. The `APP_SECRET` rotation path for MFA hasn't been exercised.
- **UI:** after approving an application or referral, the row keeps its state until you press "Done". This is intentional.

## Infrastructure
- **CI:** GitHub Actions is paused. The workflow lives at `ci/github-actions.disabled.yml`. Its earlier runs never got a runner, which looked like a repository or account Actions/billing block. **Verification is local only (`pnpm verify`).**
- **Environment used for development:** an ephemeral cloud container with a local PostgreSQL 16 cluster.
  - Data directory `/home/user/pgdata`, port `54329`.
  - Databases: `moonuke` (dev), `moonuke_test`, `moonuke_e2e`.
  - Container restarts stop Postgres. Restart it with:
    `su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /home/user/pgdata -l /home/user/pgdata/log.txt -o '-p 54329 -k /tmp' start"`
  - `.env.local` (not committed) holds `DATABASE_URL`, `APP_SECRET`, `TRUSTED_PROXY=none`, `ALLOW_LOCAL_PRODUCTION=true`, `EMAIL_TRANSPORT=dev`. Recreate it from `.env.example` if missing.
- **Dev logins:** printed by `pnpm db:seed`. The password is `moonuke-dev-password`. The owner needs the dev TOTP secret, which is printed too and lives in `scripts/lib/totp.mjs`.
