# Private creator onboarding (allowlist)

Status (2026-11-11): implemented and tested locally. All migrations through `20261119000001`, including the allowlist, were applied to the production Supabase database with the owner's approval; never edit them now. **The app code is not deployed; nothing has been provisioned, and no invitation has been sent.**

## Who can be a creator

Only these addresses, compared exactly after trimming and lower-casing (no dot or `+` folding):

- `hjaouhari0@gmail.com`
- `mehdi.alaouiismaili9@gmail.com`

| Layer | Enforcement |
|---|---|
| Database | `app.creator_allowlist` (migration `20261119000001`). Guard triggers refuse, for every database role including privileged server code: (a) any user row becoming or being created as `creator` with a non-allowlisted email, or a creator changing their email to one; and (b) any creator invitation that isn't single-use and bound to an allowlisted email. The app role (`mk_app`) also can't update `role` at all |
| Server | `insertInvitation` (used by the owner form, white-glove cases and referral approvals) refuses creator invitations that aren't single-use and bound to an allowlisted address. `redeemInvitation` re-checks the bound address. Owner approval of a creator requires a confirmed email. In **live production**, only rows from the migration count (`source = 'production'`) and the address must also be in `PRODUCTION_CREATOR_ALLOWLIST` (`src/server/auth/creatorAllowlist.ts`) |
| Test fixtures | Dev and test databases add `source = 'test_fixture'` rows: the dev seed for its fictional creators, plus explicit `allowCreatorFixture()` calls and inserts in tests. Live production ignores them, and the seed refuses to run in production |

There is no public or self-service creator registration. Members can't upgrade themselves, and the owner can't invite anyone else as a creator.

## Requirements before any creator permission works

`can()` refuses every permission to a creator unless the session has verified a second factor (AAL2) **and** the account's email is confirmed. `requireViewer` sends a creator without MFA to `/account/security?setup=required`. Creators can't turn MFA off. A provisioned account can't sign in at all until it's activated (`must_change_password`).

## Flow for the two creators

1. **Provision (owner, locally):** creates each account as a pending creator, storing only a scrypt hash of the temporary password. It also records an approved application (the owner's decision) and issues a single-use activation link bound to the address that expires in 7 days.
2. **Dispatch:** `--send` queues the branded activation email from `welcome@divafans.io`. It contains the link only, never a password. The temporary password reaches the creator separately, in person or through a secure messenger.
3. **Activate:** the creator opens the link, enters the temporary password, chooses a new one and confirms 18+ and the terms. That confirms the email, makes the account active and revokes any sessions. A wrong temporary password doesn't consume the link; attempts are rate-limited per network and per link.
4. **Sign in, then MFA:** after the new password, they set up two-step sign-in (mandatory), and then the studio opens.

## Commands (local; production needs explicit approval)

Set the values in your own shell only. Never commit them, never put them in `.env.local` or `.env.example`, and use fresh passwords:

```bash
# Bash / Git Bash — values typed into your terminal, never into a file
export PROVISION_CREATOR_1_EMAIL='hjaouhari0@gmail.com'
export PROVISION_CREATOR_1_PASSWORD='<temporary password 1>'
export PROVISION_CREATOR_2_EMAIL='mehdi.alaouiismaili9@gmail.com'
export PROVISION_CREATOR_2_PASSWORD='<temporary password 2>'

pnpm creators:provision                 # local database: creates accounts and links, sends nothing
pnpm creators:provision --print-links   # also shows each link once, for manual delivery
pnpm creators:provision --send          # queue the activation emails (then: pnpm email:drain)

# Production (only after approval, migrations applied and the code deployed):
DATABASE_URL='<production connection string>' pnpm creators:provision --send --allow-remote

unset PROVISION_CREATOR_1_PASSWORD PROVISION_CREATOR_2_PASSWORD
```

PowerShell equivalent: `$env:PROVISION_CREATOR_1_PASSWORD = '…'`, and afterwards `Remove-Item Env:PROVISION_CREATOR_1_PASSWORD`.

The script:
- refuses any non-localhost database without `--allow-remote`;
- reads the password variables, then deletes them from its environment;
- prints only masked addresses and outcomes (`created`, `reissued`, `already_active`, `skipped_other_role`);
- is idempotent. Re-running revokes an unused link and issues a new one; it leaves activated accounts and accounts with other roles unchanged and never creates duplicates.

**Required environment for sending:** `EMAIL_TRANSPORT=resend`, `RESEND_API_KEY`, `WELCOME_EMAIL_FROM=welcome@divafans.io`, `APP_URL=https://www.divafans.io`. The `divafans.io` domain must also be verified in Resend (see `EMAIL_NOTIFICATION_POLICY.md`).

## Limits (honest)

- **MFA is enforced in code, not in RLS.** The MFA-and-confirmed-email requirement for creators is enforced in `can()` and `requireViewer`, which every creator page and action passes through, not in RLS. Creator-owned rows are protected by ownership policies. Moving the MFA check into RLS would mean changing every creator policy; that's a separate decision.
- **Fixture creators.** Dev and test fixture creators have deterministic dev authenticator secrets (`devTotpSecret`). These exist only in seeded development data.

## Rollback

1. Revert the commit. The allowlist checks and activation flow disappear from the app.
2. The migration is additive. To remove it, add a new migration that drops the two triggers and their functions, `app.creator_email_allowed`, the `app.creator_allowlist` table, the `invitations.activates_user_id` and `users.must_change_password` columns, and the `users_adult_attested` constraint; then restore `adult_attested_at not null` (check that no row is null first). Never edit the original migration.
3. Provisioned accounts that were never activated can be revoked by revoking their invitation (`/admin/invitations`) or suspending the account (`/admin/members`).
