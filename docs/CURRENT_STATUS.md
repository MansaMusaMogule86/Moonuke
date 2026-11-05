# Current status

**Branch:** `claude/cool-noether-uvf5h7`. **Last code commit:** `43faf7f`. **Deployed:** no. **Payments active:** no.

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

What Phase 4 delivered:
- White-glove cases and the pipeline board.
- Profile proposals that need the creator's consent.
- Social connections verified by proof code.
- The AI profile assistant: local template, with Claude as an opt-in.
- Verified socials on profiles.

What's still open is in `docs/NEXT_PHASE.md`.

## Test results (last full local run: `pnpm verify` at `43faf7f`, PASS, ~5 min)
This was a **local** run. GitHub Actions did not run.

| Step | Result |
|---|---|
| TypeScript strict | pass |
| Vitest: UI and PostgreSQL security tests | 127 / 127 (11 files) |
| Production build, env-safety check | pass |
| Browser, Phase 1 (homepage and axe) | 17 / 17 |
| Browser, Phase 2 (access, entitlements, axe) | 70 / 70 |
| Browser, Phase 3 (recovery, MFA, safety, verification, axe) | 66 / 66 |
| Browser, Phase 4 (white-glove flow, axe) | 34 / 34 |

## Known issues and limitations
- **Auth:** our own implementation; the Supabase switch is planned, not done. There's no ID-verification vendor; checks are manual.
- **Media:** placeholder SVGs only. No uploads, no object storage, no CSAM/NCII hash-matching (required before real uploads).
- **Email:** never sent through a real SMTP provider.
- **AI:** the Claude adapter is typechecked against the official SDK but **never called live** (no key, no cost).
- **Safety filter:** pattern-based, not a classifier.
- **Social verification:** manual; there are no platform APIs.
- **Escalation:** recorded only, not wired to outside reporting bodies.
- **CSP:** allows inline styles.
- **Rate limits:** depend on a correctly set `TRUSTED_PROXY`.
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
