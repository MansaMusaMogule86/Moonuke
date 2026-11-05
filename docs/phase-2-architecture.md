# Phase 2: Invitation-only access, discovery and creator profiles

Status: implemented on `claude/cool-noether-uvf5h7`. No MOONUKE PRD was in the repository, so this spec is built only from the Phase 1 and Phase 2 briefs. Anything those briefs do not settle is listed under **Decisions requiring approval**. Each one has a default that is easy to reverse.

## 1. Principles

1. **No unrestricted registration.** The only way to create an account is a valid invitation link. Even a valid link produces a *pending* account. Only the owner can make an account active.
2. **The server decides.** Every protected page and server action checks the session, the account status and the permission on the server. Hiding a button is a UX choice, never a security control.
3. **Two layers of enforcement.** App code checks permissions, then queries run as a non-privileged Postgres role (`mk_app`) under row-level security, with the viewer's id bound to the transaction. A bug in app code still cannot read locked content or modify accounts.
4. **Locked content never leaves the server.** Post bodies and media sit in a separate table (`post_content`) that RLS gates by entitlement. Locked posts reach the browser only as teasers.
5. **Privacy by default.** Members appear only by alias. Emails are visible only to the account holder and the owner. IP addresses are stored only as keyed hashes.

## 2. Roles, statuses and permissions

| Role | Who | Count |
|---|---|---|
| `owner` | Platform super-administrator | Exactly one. Enforced by a unique partial index |
| `creator` | Invited and approved creator | Any |
| `member` | Invited and approved fan | Any |

| Status | Meaning | Can sign in | Can use the club |
|---|---|---|---|
| `pending` | Applied through an invitation, awaiting the owner | yes, sees "awaiting approval" only | no |
| `active` | Approved | yes | yes |
| `suspended` | Suspended by the owner. All sessions revoked | no | no |
| `rejected` | Application declined | no | no |

Permission matrix (`src/server/auth/permissions.ts`):

| Permission | owner | creator | member |
|---|:-:|:-:|:-:|
| `club.discover` (discovery, profiles) | ✓ | ✓ | ✓ |
| `club.follow` | ✓ | ✓ | ✓ |
| `referrals.request` | | ✓ | ✓ |
| `invitations.manage` | ✓ | | |
| `applications.review` | ✓ | | |
| `referrals.review` | ✓ | | |
| `accounts.suspend` | ✓ | | |
| `audit.view` | ✓ | | |

Every permission also requires `status = active`.

## 3. Flows

**Invitation → application → approval**
1. The owner creates an invitation: intended role (`member` or `creator`), an optional email lock, a use limit (1–100), an expiry (1–30 days) and a private note. The server generates 32 random bytes as the token and stores **only its SHA-256 hash**. The link `/invite/<token>` is shown once.
2. A visitor opens the link. The server hashes the token and checks that the invitation exists, is not revoked, has not expired and is not exhausted. Every failure shows the same generic page, so an attacker learns nothing. The page is rate-limited per IP.
3. The visitor submits an alias, an email, a password and an 18+ attestation. In one transaction the server consumes a use (`UPDATE … WHERE use_count < max_uses AND revoked_at IS NULL AND expires_at > now()`, which is race-safe), creates the user as `pending`, creates the application record and writes the audit log. If the invitation is email-locked, the submitted email must match.
4. The applicant gets a session, but every club route sends them to `/pending`.
5. The owner approves (the account becomes `active`) or rejects it (it becomes `rejected` and its sessions are revoked). Every decision is audited.

**Referral requests**
- Active members and creators submit a request: the invitee's name, email, intended role and a relationship note. The request **creates no invitation and no account**.
- The owner approves a request, which issues a single-use, email-locked invitation valid for 7 days, or declines it. The link is shown only to the owner, who delivers it.

**Suspension.** The owner suspends with a reason. Status becomes `suspended` and all sessions are revoked immediately. Reactivating sets the status back to `active`. The owner cannot suspend themselves.

## 4. Database schema (`supabase/migrations`)

All tables live in schema `app` and RLS is enabled on every one.

| Table | Purpose | Key constraints |
|---|---|---|
| `users` | Accounts | `email` and `alias` are citext and unique. Single-owner partial unique index. `password_hash` is never granted to `mk_app` |
| `invitations` | Invitations | `token_hash` is unique. `intended_role <> owner`. `0 ≤ use_count ≤ max_uses ≤ 100` |
| `applications` | One per registration | `user_id` unique. Status plus the decision record |
| `referral_requests` | Requests from members and creators | One pending request per requester and email |
| `sessions` | Server-side sessions | Primary key is the SHA-256 of the cookie token. Has an expiry and a revocation time |
| `rate_limits` | Fixed-window counters | Primary key `(bucket, window_start)` |
| `audit_log` | Append-only audit trail | A trigger rejects UPDATE and DELETE |
| `categories` | Discovery categories | |
| `creators` | Creator profiles | Handle is checked against `^[a-z0-9_]{2,24}$`. `visibility` is `listed`, `discreet` or `private` |
| `tiers` | Member and VIP tiers | Price in integer cents with an ISO currency. Optional VIP seat limit |
| `posts` | Post teasers | `access` is `preview`, `members`, `vip` or `ppv`. A PPV post must have a price |
| `post_content` | Gated body and media | Readable only when `app.can_view_post()` is true |
| `subscriptions` | Active and past subscriptions | One active subscription per fan and creator. **Written only by the system.** No client path creates one in Phase 2 |
| `purchases` | Pay-per-view entitlements | Unique per fan and post. System-written only |
| `follows` | Follows | Primary key `(fan_id, creator_id)` |

RLS helpers are `SECURITY DEFINER` functions with a pinned `search_path`:
- `app.uid()`
- `app.is_active()`
- `app.is_owner()`
- `app.viewer_role()`
- `app.can_see_creator(id)`
- `app.can_view_post(id)`

## 5. Access-control rules (RLS and app layer)

| Resource | Rule |
|---|---|
| Creator profile | Visible to the owner and the creator themselves. Otherwise the viewer must be **active**, the creator must be active, and the profile must be `listed` or `discreet`, or `private` with the viewer holding an active subscription |
| Discovery and search | Active viewers only. `listed` creators only, so `discreet` and `private` never appear |
| Post teaser | Same rule as the creator profile |
| Post body and media | `preview`: anyone who can see the profile. `members`: any active subscription to the creator. `vip`: an active VIP-tier subscription. `ppv`: a purchase record. The owner and the creator always qualify |
| Media bytes | `/api/media/:id` needs a fresh HMAC-signed URL bound to the viewer and to an expiry 5 minutes out. It re-checks the session and `can_view_post`, and responds with `Cache-Control: private, no-store`. There are no permanent public URLs |
| Invitations, applications, account status | Owner only. RLS denies everyone else, including other active users |
| Referral requests | The requester inserts and reads their own. Only the owner decides |
| Audit log | Readable by the owner. No updates or deletes for anyone |

Rate limits are DB-backed, so they hold across instances:

| Bucket | Limit |
|---|---|
| Sign-in | 8 per 15 min per IP, and 5 per 15 min per email |
| Invite view | 30 per 10 min per IP |
| Application submit | 5 per hour per IP |
| Referral request | 10 per day per user |
| Invitation create | 60 per hour for the owner |

Sessions:
- The cookie holds a 256-bit random token. The database stores only its SHA-256.
- The cookie is `HttpOnly` and `SameSite=Lax`. In production it is also `Secure` and named `__Host-mk_session`.
- Sessions expire 14 days after creation, with no sliding renewal.
- Suspending or rejecting an account revokes all its sessions.
- Passwords are hashed with scrypt (N=2¹⁵, r=8, p=1). Sign-in failures return the same message and take the same time whether or not the email exists.

Next.js server actions get Origin-header CSRF protection from the framework. Every action re-validates its input with zod.

## 6. Routes

| Route | Access |
|---|---|
| `/` | Public marketing (no age-restricted media) |
| `/design-system` | Public, `noindex` |
| `/signin` | Public, rate-limited |
| `/invite/[token]` | Valid invitation token only |
| `/pending` | Any signed-in account that is not active |
| `/discover` | Active members, creators and the owner |
| `/c/[handle]` | As the creator-profile rule. Returns 404 rather than 403, so existence is not revealed |
| `/refer` | Active members and creators |
| `/admin`, `/admin/invitations`, `/admin/referrals`, `/admin/members`, `/admin/audit` | Owner only (404 for everyone else) |
| `/api/media/[id]` | Signed URL, a valid session and the entitlement |

## 7. Payments in Phase 2
`src/server/payments` defines the `PaymentProvider` interface and a registry that holds **no approved provider**. "Join" and "Unlock" call a server action that loads the price from the database (client prices are never trusted) and returns a quote with `available: false`. No transaction can be created. Phase 6 brings adapters, the ledger and webhooks.

## 8. Acceptance criteria
- [x] Without an invitation, no route or action creates an account.
- [x] Expired, revoked, exhausted and malformed tokens all show the same "not valid" response. Only the token hash is stored.
- [x] Concurrent submissions cannot exceed `max_uses`.
- [x] An email-locked invitation rejects a different email.
- [x] A new account is `pending` and cannot reach `/discover`, `/c/*`, `/refer` or `/admin`.
- [x] Only the owner can approve, reject, suspend, reactivate, issue invitations or revoke them. These are enforced in app code **and** by RLS.
- [x] Members and creators can file referral requests. Doing so creates no invitation.
- [x] Only one owner can exist.
- [x] The audit log records every security-relevant event and cannot be updated or deleted.
- [x] Discovery lists only `listed` creators, with search, category filter and sort.
- [x] Profiles show free previews, tiers, VIP seats, and locked and pay-per-view posts. Locked bodies and media never reach the browser.
- [x] Media is served only through short-lived signed URLs that are re-checked against entitlements.
- [x] "Join" and "Unlock" show server-quoted prices and cannot complete a payment.
- [x] Rate limits apply to sign-in, invite, apply, referral and invitation creation.
- [x] WCAG 2.1 AA (axe) passes on every new route at 1440 and 390 px. Reduced motion is respected.

## 9. Decisions requiring approval

| # | Decision | Default implemented | Alternative |
|---|---|---|---|
| D1 | **Auth provider.** Phase 5 names Supabase Auth, but Phase 2 needs sessions now | Own email and password with server-side sessions, behind `src/server/auth`. Plain Postgres, so it moves to Supabase unchanged | Supabase Auth now (needs a project and keys) |
| D2 | **Who delivers invitation links.** No email provider is approved | The link is shown once to the owner, who sends it personally | Transactional email (provider to choose) |
| D3 | **What a `private` profile means** | Visible only to current subscribers, the creator and the owner | Only to the owner and creator until a member is granted access |
| D4 | **Discovery behind sign-in** | Discovery and all profiles need an active account. The public homepage shows only the curated SFW showcase | A public teaser directory |
| D5 | **Age assurance** | An 18+ attestation is recorded at application, and the owner reviews before approving. **Not a verified age check** | An ID-verification vendor (Phase 5, to choose) |
| D6 | **Referral visibility** | The requester sees the status of their request but never the token | Hand the link to the requester after approval |
| D7 | **Defaults for invitations from referrals** | Single use, email-locked, 7 days | Configurable per approval |
| D8 | **Can the owner hold creator tiers?** | No. The owner is an administrator only | — |
| D9 | **Rate-limit values** | As in §5 | Tune once there is traffic |

## 10. Out of scope (later phases)
- Messaging, the vault, notifications, blocking and reporting (Phase 3).
- The creator studio and publishing (Phase 4). Phase 2 content comes from the dev seed.
- Real object storage, ID verification, moderation queues and 2FA (Phase 5).
- Payment providers, the ledger and webhooks (Phase 6).

## 11. Privileged (`system()`) call sites

These are the only code paths that bypass RLS. Each runs a fixed query with no viewer-controlled SQL.

| Module | Operation | Why it is privileged |
|---|---|---|
| `services/sessions.ts` | create, resolve and revoke sessions | `app.sessions` is unreachable for `mk_app` by design |
| `services/accounts.ts` | inspect and redeem invitations, sign in, bootstrap the owner | Runs before any viewer exists |
| `services/rateLimit.ts` | Increment counters | Shared across viewers |
| `services/admin.ts` (via `revokeAllSessions`) | Revoke sessions after rejection or suspension | Runs only after an owner-authorised RLS update has succeeded |
| `seed/` | Dev data | Refuses to run when `NODE_ENV=production` |

## 12. Verification (this branch)

| Check | Result |
|---|---|
| `pnpm lint` (tsc strict) | clean |
| `pnpm build` (Next 16, Turbopack) | 16 routes |
| `pnpm test` | 64/64: 17 UI and 47 server security tests against PostgreSQL 16 |
| `scripts/e2e-smoke.mjs` (Phase 1) | 17/17, including axe on `/` and `/design-system` at 1440 and 390 |
| `scripts/e2e-phase2.mjs` | 64/64: full invite → apply → approve → discover → entitlement → referral → suspension flow, plus axe WCAG 2.1 AA on every new route at 1440 and 390 |

## 13. Known limitations
- **No password reset or email delivery.** Both need an email provider (D2). The owner delivers invitation links by hand.
- **No 2FA, no ID verification.** Age is an 18+ attestation plus owner review (D5). Both are planned for Phase 5.
- **Creator content comes from the dev seed.** There is no studio or upload until Phase 4. Media is a placeholder SVG streamed through the signed route. Phase 5 swaps in private object storage behind the same URL contract.
- **Blocking and reporting are not built.** They are scheduled for Phase 3.
- **Rate limits and audit IP hashes use the first `X-Forwarded-For` hop.** Deploy only behind a proxy that overwrites that header.
- **No global Content-Security-Policy yet.** Next's inline scripts need a nonce setup (Phase 7). The media route sends its own strict CSP.
- **Decided rows keep stale badges.** After approving an application or referral, the row keeps its old status badge until the page reloads. This is deliberate, so the one-time invitation link is not unmounted.
- **The end-to-end suites are Node scripts, not CI jobs.** Each needs a freshly seeded DB and a running server.
