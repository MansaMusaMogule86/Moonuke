# Phase 6: fan app

Requested by the owner after release hardening. **No payment processing, no new tracking, no fake transactions.** Everything reads existing entitlements; nothing assumes a payment succeeded.

## Routes

Only active members and creators can use these. The owner is an administrator, not a fan (D8), and gets a 404. Signed-out visitors go to sign-in.

| Route | What |
|---|---|
| `/library` | Overview: counts, current memberships, the latest vault posts, followed creators |
| `/library/vault` | Unlocked posts: members and VIP posts of current memberships, plus owned pay-per-view posts. Paginated (`?before=`), filterable (`?creator=`) |
| `/library/memberships` | Current and past memberships: state, period end, cancel at period end, keep |
| `/library/purchases` | Owned pay-per-view posts with their **current** entitlement state |
| `/notifications` | Notification centre: read and unread, mark all, mark one as read on open |

Navigation adds a **Library** item for members and creators, plus a bell with an unread count in the header.

## Entitlement and media
- **The vault is the database's decision.**
  - It inner-joins `post_content`, which is readable only when `can_view_post()` is true.
  - That function covers memberships (with period end), VIP, purchases, hidden posts, blocks, profile visibility and publish time.
  - So a post leaves the vault the moment a membership ends, the house hides it, or either side blocks the other.
  - Free previews and the fan's own posts are excluded.
- **Media** reuses `/api/media/[postId]/[index]`. URLs are HMAC-signed for this viewer and this asset index, expire in 5 minutes, and the server re-checks entitlement under RLS on every request.
  - Browser tests show that a vault URL returns 404 for another member, for a signed-out visitor, with a tampered signature, and for a different index.
  - Responses are `no-store`.
- **No locked content through notifications.** A notification row holds references only (post id, creator id). Teasers are read under RLS when the page renders; post bodies never appear (tested on the server and in the browser).

## Purchases
- `app.my_purchase_states()` (SECURITY DEFINER, the caller's own rows) returns per-purchase flags: unlocked, under review, creator visible. The states are:
  - **Unlocked:** it opens.
  - **Under review:** the house hid the post.
  - **Unavailable:** the creator isn't visible to the fan, for example because of a block.
- **No amount is shown.** No payment has ever been processed, so there is no paid amount to show, and today's price would misstate history. Pricing and receipts belong to the payments phase.
- Purchases are never created by this phase.

## Memberships and cancellation
- **Cancel at period end:**
  - Cancelling sets `cancel_at_period_end` and `canceled_at` through `app.set_my_subscription_cancel()` (SECURITY DEFINER; own, active, unexpired rows only). "Keep my membership" undoes it.
  - Access continues until `current_period_end`, because `has_active_sub()` already stops access at that point.
  - `mk_app` still cannot write `subscriptions`; the schema lint enforces this.
- **States are derived:** active; ending (cancel set, period not over); ended (status not active, or the period has passed).
- **No renewal:** there's no billing, so nothing renews. The UI says "Current period ends …" and states that automatic renewal isn't active. It never says "Renews on".
- **Audit:** `subscription.cancel` and `subscription.resume`.
- **Rate limit:** 30 changes per hour.

## Notifications
- **Table `app.notifications`:**
  - Columns: `kind`, an optional `creator_id` and `post_id`, a size-capped `data` (2 KB, never message bodies), `available_at` and `read_at`.
  - Uniqueness: one row per user, kind and post.
- **RLS:**
  - Readers see only their own rows, once `available_at` has passed, and only while the creator is visible to them (`can_see_creator`) and the post is live (`post_is_live`, definer).
  - Hidden, deleted, unpublished or blocked items vanish.
  - `mk_app` may update `read_at` only. It has no insert or delete.
- **Sources** (all existing events; nothing new is tracked):
  - `post.published`: a SECURITY DEFINER trigger on `posts` fans out to followers and active members at publish time.
    - It skips the creator, blocked pairs and inactive accounts.
    - A scheduled post gets `available_at` equal to its publish time.
    - Re-scheduling moves the notification, and un-publishing removes unread ones.
    - Back-dating a post by more than a day doesn't re-announce it.
  - `proposal.received`: a trigger tells a creator when the house (or an import) files a proposal for them.
- **Prepared for Messaging and Blasts:**
  - The kinds `message.received`, `blast.received` and `system` exist.
  - `deliverNotification()` in `src/server/services/notifications.ts` is the server-side (`system()`) entry point. Senders must authorise first, and no user action calls it yet.
  - Future kinds render generically until their UI exists.
- **Read state:** opening a notification marks it read optimistically. "Mark all as read" covers the rest.

## Migration
`20261110000001_phase6_fan_app.sql`:
- `subscriptions.cancel_at_period_end` and `canceled_at`.
- `set_my_subscription_cancel()`, `my_purchase_states()` and `post_is_live()`.
- `notifications`, with its policies and the `posts_notify` and `proposals_notify` triggers.

## Tests
- **Server** (`tests/server/fan.test.ts`, 16 tests):
  - Fan access (the owner and pending accounts are denied).
  - The vault equals the database's entitlement set; signed media; pagination and filtering.
  - Removal on hide, on membership end and on block.
  - Purchase states, with no price.
  - Cancel, resume, ended memberships, and cross-user denial.
  - RLS denial of direct subscription writes.
  - Notification fan-out, scheduling, un-publishing, hiding and blocking; read state.
  - RLS denial of insert, delete, other columns and other users.
  - Proposal notifications; future-kind delivery.
- **Browser:** `scripts/e2e-phase6.mjs`, 41 checks, including axe at 1440 and 390 px.

## Defaults (please confirm)

| # | Default |
|---|---|
| F1 | Cancelling ends a membership at the close of the current period. There's no immediate cancel and no refunds (payments inactive) |
| F2 | The vault excludes free previews and the fan's own posts |
| F3 | Purchases show no amount until payments record one |
| F4 | Notifications are kept indefinitely (retention is UNKNOWN, as for other user data) |
| F5 | Post notifications go to followers and current members; there are no per-creator mute settings yet |

## Known limitations
- The unread badge in the header refreshes on navigation or reload, not live (no push or websockets).
- There are no notification preferences or email digests yet.
- Messaging and Blasts aren't built; only their notification plumbing is.
- There is no automatic transition of `status` to `expired`. State is derived from `current_period_end`, which is what entitlement uses.
