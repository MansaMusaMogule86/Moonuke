# Phase 5: creator studio

The owner chose the creator studio as the next phase. It is built in slices. **Payments stay inactive and there are no uploads:** media remains placeholder until storage is approved (A13).

## Slices

| Slice | Scope | Status |
|---|---|---|
| 5a | Posts: compose, draft, schedule, publish, edit, delete | **Done** |
| 5b | Tiers: create, edit price, perks and seats, switch off, delete | **Done** |
| 5c | Analytics from existing data only (aggregate counts) | **Done**. Further metrics or tracking need approval |
| 5d | Blasts, fan messaging, segmentation, top fans | Planned. Needs messaging (fan app), so order is **UNKNOWN** |
| 5e | Earnings, payouts, transactions | Blocked: no payments, fees **UNKNOWN** |
| — | Media uploads | Blocked: storage plus CSAM/NCII hash-matching not approved |

## 5a: Posts
- **Routes** (active creators only; everyone else gets a 404):
  - `/studio/posts`: list with draft, scheduled and published counts.
  - `/studio/posts/new`: composer.
  - `/studio/posts/[id]`: edit, plus a two-step delete.
- **States:** `published_at IS NULL` is a draft; a future `published_at` is scheduled; otherwise the post is published. Nothing runs on a timer. A scheduled post becomes visible when its time passes, because every read checks `published_at <= now()`.
- **Visibility.** Enforced in the database:
  - `posts_select` shows unpublished or hidden posts only to their creator and the owner.
  - `can_view_post` returns false for unpublished posts, so neither the content nor the signed media unlocks.
  - The public profile query also filters to published posts, so a creator's own profile shows exactly what members see.
- **Media:** the client never sends media. The server derives a placeholder study from the post id. Format (image, set, video) and set size are metadata only.
- **Validation** (`normalizePost`, re-checked by DB constraints):
  - Teaser 1–140 characters; body up to 5,000.
  - Pay-per-view price $1–$1,000 in integer cents.
  - A set has 2–50 pieces.
  - A schedule must be at least one minute and at most 365 days ahead.
  - The minors and non-consent safety filter applies.
- **Guard trigger `posts_guard`** (SECURITY INVOKER):
  - A post can't move to another creator.
  - Creators can't change the moderation columns, so they can't un-hide a post.
  - The owner may moderate other creators' posts but never rewrite them.
  - **A bought post** keeps its access level and publish time, and can't be deleted (`post_has_purchases`, definer). Copy and price can still change.
- **Helpers:** `owns_post()` and `post_has_purchases()` are SECURITY DEFINER.
- **Rate limit:** 120 writes per hour (`LIMITS.postWrite`, shared with tiers).
- **Audit:** `post.create`, `post.update` and `post.delete`, with access and state only.

## 5b: Tiers
- **Route:** `/studio/tiers`. Each tier has its own form, plus an "Add a tier" form.
- **Validation** (`normalizeTier`):
  - Name 1–40 characters, unique per creator and kind.
  - Monthly price $1–$1,000 in integer cents. There are no free tiers by default.
  - Up to 8 distinct perks of up to 80 characters each.
  - Seats: a whole number of 1 or more, or empty for unlimited.
  - The safety filter applies.
  - At most 8 tiers per creator.
- **Integrity:**
  - A tier that has **ever** had a subscriber keeps its kind, because VIP access depends on it, and can't be deleted (switch it off instead). This is enforced by `tiers_guard` and `tier_has_subscribers()` (definer).
  - Seats can't drop below current active members.
  - The last active tier can't be switched off or deleted.
- **Price changes** take effect in quotes immediately. With no billing, existing subscribers are unaffected.
- **RLS:** creators insert, update and delete only their own tiers. The owner has no write policy on tiers.
- **Audit:** `tier.create`, `tier.update` (price from and to, active) and `tier.delete`.

## 5c: Analytics
- **Route:** `/studio/analytics`.
- **Counts only, from data that already exists:**
  - Active and VIP members, plus new members in the last 30 days.
  - Followers, plus new followers in the last 30 days.
  - New members and followers per week over 8 weeks.
  - Members per tier against seats.
  - Posts by state and by access.
  - Unlocks per pay-per-view post.
- **Not collected or shown:**
  - No view or engagement tracking was added.
  - No fan identities are shown (top fans are deferred).
  - No money figures: payments are inactive, so revenue numbers would be fiction.
- **Purchases** stay unreadable to creators under RLS. Unlock counts come from `my_post_unlocks()` (SECURITY DEFINER, aggregate-only, the caller's own posts).
- Weekly rows use Monday-start weeks in the database time zone (UTC).

## Migrations
- `20261109000001_phase5_creator_posts.sql`: nullable `published_at`, `created_at`, `updated_at`; the new `posts_select` and `can_view_post`; creator insert, update and delete policies on posts and post_content; `posts_guard`; the helpers.
- `20261109000002_phase5_creator_tiers.sql`: creator policies on tiers, `tiers_guard`, `tier_has_subscribers()`.
- `20261109000003_phase5_creator_analytics.sql`: `my_post_unlocks()`.

## Defaults (please confirm)

| # | Default |
|---|---|
| P1 | Pay-per-view price range $1–$1,000; tier price range $1–$1,000 per month; USD only |
| P2 | Bought posts: access and publish time fixed, no delete; copy and price editable |
| P3 | Scheduling up to 365 days ahead; times are entered in the creator's local time and stored in UTC |
| T1 | At most 8 tiers and 8 perks; no free tiers |
| T2 | Price changes apply to new quotes only (no billing exists) |
| T3 | A tier that has had subscribers keeps its kind and can only be switched off |
| T4 | At least one tier stays active once a creator has tiers |

## Known limitations
- No uploads, so posts show placeholder studies.
- There's no notification when a scheduled post goes live; notifications don't exist yet.
- Analytics show no views or engagement, because none is tracked (that would be new data collection and needs approval).
- Tier reordering isn't exposed in the UI; new tiers sort last.
