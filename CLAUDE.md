# CLAUDE.md: permanent instructions for this repository

**The repository is the source of truth.** Don't rely on earlier conversations. Read in this order:
1. `docs/PROJECT_CONTEXT.md`: what the product is, in one page.
2. `docs/CURRENT_STATUS.md`: what's done, test results, known issues.
3. `docs/NEXT_PHASE.md`: what to build next.
4. As needed:
   - `docs/MASTER_PRD.md` (requirements)
   - `docs/ARCHITECTURE.md` (system)
   - `docs/DECISIONS.md` (approved and open decisions)
   - Detailed references in `docs/phase-*-architecture.md`, `docs/design-system.md`, `docs/deployment.md`, `docs/supabase-auth-migration.md`, `docs/verification-design.md`

## Non-negotiable rules
- **Invitation-only.** Never add public sign-up, waitlists or any path that creates an account without a valid invitation **and** owner approval.
- **Single owner.** Exactly one `owner`. Owner powers require MFA (AAL2) in app code **and** in the database (`app.is_owner()` checks `app.aal`).
- **Server-side authorization in two layers.** Every page and action calls `requireViewer(permission)`, and viewer queries run through `asViewer()` as role `mk_app` under RLS. Hiding a button is never a security control.
- **Never trust the client** for prices, entitlements, balances, roles or ids of other users.
- **Locked content never leaves the server.** Media is served only through short-lived signed URLs (`/api/media`).
- **No money or deployment without explicit approval.** That covers live payments, crypto, production deployment, paid services, paid photography, and GitHub Actions or billing.
- **Working name.** "Moonuke" is temporary. All brand strings live in `src/config/brand.ts`; never hard-code the name.
- **Don't invent requirements.** If something isn't in `docs/MASTER_PRD.md` or `docs/DECISIONS.md`, ask or mark it UNKNOWN.
- **Be honest.** Never claim tests passed without running them. `pnpm verify` is a **local** run, not CI.

## Commands
```bash
pnpm install
pnpm db:seed          # DEV ONLY: resets schema `app` and loads fictional data (prints logins + dev TOTP secret)
pnpm dev              # or: pnpm build && pnpm start
pnpm verify           # FULL local suite: typecheck, unit + Postgres security tests, build, env check, all browser suites + axe
pnpm verify:quick     # typecheck + unit + Postgres security tests
pnpm lint             # tsc --noEmit (strict)
```
- Requires PostgreSQL 15+ and `.env.local` (copy `.env.example`).
- `pnpm verify` uses isolated `<db>_test` and `<db>_e2e` databases and never touches the dev database.
- In ephemeral cloud containers Postgres may need restarting. A local cluster was used at port 54329; see `docs/CURRENT_STATUS.md` → Environment.

## Engineering conventions
- **Database access.**
  - `asViewer(viewer, fn)` is the default.
  - `system(fn)` is privileged and only for the narrow call sites listed in the phase docs: sessions, invitation redemption, rate limits, MFA material, email delivery.
- **RLS.**
  - Look-ups inside policies must go through `SECURITY DEFINER` helpers, because a plain subquery is filtered by RLS and silently passes or fails.
  - Guard triggers must be **`SECURITY INVOKER`**, because `current_user` has to be the caller.
- **Migrations.** Add new files under `supabase/migrations/` (timestamped). Never edit a migration once it has been committed and pushed.
- **Server actions.** Validate input with zod, then `requireViewer`, then rate-limit (keyed hashes, never plaintext emails or tokens), then the service, then audit.
- **UI state.**
  - Don't `revalidatePath` in a way that unmounts the component showing the result. Keep result state in the component and refresh on "Done".
  - React 19 resets forms after an action, so echo non-secret values (never passwords).
- **Accessibility.** WCAG 2.1 AA. Every new page gets an axe check in a browser suite at 1440 and 390 px. Respect reduced motion.
- **Tests.**
  - Security rules get a server test that hits real Postgres, checking both the app-layer denial and the direct-RLS denial.
  - New flows get browser checks in `scripts/e2e-phase*.mjs`, registered in `scripts/verify.mjs`.
- **Design.** Black and gold tokens live in `src/styles/tokens.css`; components in `src/components/ui`. See `docs/design-system.md`.

## Git
- Work on the assigned branch (currently `claude/cool-noether-uvf5h7`). Make small, reviewable commits.
- Run `pnpm verify` before pushing feature work.
- GitHub Actions is **paused** (`ci/github-actions.disabled.yml`). Don't re-enable it without approval.
- Never commit `.env.local` or secrets.
