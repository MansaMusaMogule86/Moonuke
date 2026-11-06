# Phase 10: age assurance and regional rules (inactive)

The owner requested this phase on 2026-11-06. It is **built and switched off.** Nothing is active until the owner approves a vendor (P-2) and the jurisdictions (L-1).

- Production refuses to start with `FEATURE_AGE_ASSURANCE=on`, `FEATURE_GEO_RESTRICTIONS=on` or `AGE_PROVIDER=mock` (`productionProblems`).
- No country rules are pre-filled: which countries need what is a legal decision.
- The existing 18+ attestation at sign-up is unchanged.

## How it works when switched on

**The gate.** `src/server/compliance/access.ts` runs on:
- every club page (`(club)/layout.tsx`): it redirects to `/unavailable` or `/verify-age`;
- the signed media route and the messages API: they return a bare 404.

With both flags off it returns "allowed" **without any database lookup**, so current behaviour is unchanged.

**Country.**
- It comes only from the header the trusted proxy sets: `cf-ipcountry` for Cloudflare, `x-vercel-ip-country` for Vercel.
- With `TRUSTED_PROXY=none` it is unknown.
- No GeoIP database is used.
- `XX` (unknown) and `T1` (Tor) count as unknown.

**Rules** (`app.jurisdiction_rules`). One per country: `block` or `age_assurance`. A rule for `XX` applies when the country is unknown.

**Where age checks apply.**
- `listed` (the default): countries with an `age_assurance` rule.
- `everywhere`: everyone.

**Exemptions.** The owner is never gated.

**Age checks** (`app.age_checks`):
- Only the **outcome** is stored: passed or failed, the method, the assurance level and the provider reference. Never a date of birth, a document or an image.
- Users read their own checks. Every write comes from the server after it verifies the provider's signed result. This reuses the HMAC contract from the payments webhook: raw body, constant-time comparison, a 5-minute replay window.
- A provider reference is unique, so one result can't be reused for another check or person. A repeated delivery is idempotent; a conflicting result is refused.
- At most 5 pending checks per hour per user.

**Provider seam** (`src/server/compliance/ageProvider.ts`):
- `start(checkId)` returns where to send the user; `verify(rawBody, signature)` returns an outcome or null.
- Only a **test-only mock** exists, and it refuses to load in production. A real vendor is a new adapter after approval.

**Routes.** Each is a 404 while the feature is off:
- `/verify-age`
- `/verify-age/mock` (local tests only)
- `POST /api/age/callback/[provider]`

`/unavailable` is a neutral page.

**Owner page.** `/admin/safety/access` shows both features as "off (awaiting approval)". From it the owner can prepare rules and the scope. Changes are audited and have no effect while off.

## Database
`20261116000001_phase10_age_geo.sql`:
- `jurisdiction_rules`: owner at AAL2 only, under RLS.
- `safety_settings.age_assurance_scope`, with `set_age_assurance_scope()`: owner only, audited.
- `age_checks`: owner and self can read; no viewer writes.

## Tests
- **Server:** `tests/server/age-geo.test.ts`, 9 tests. Flags are forced on only through a test option that is ignored in production. They cover:
  - off by default, with no effect even when rules exist;
  - header handling;
  - blocking, unknown countries and owner exemption;
  - owner-only rule management (app layer, RLS, AAL1 denial, audit);
  - listed and everywhere scopes;
  - pass, fail and outcomes-only storage;
  - forged, tampered, expired, unknown and replayed results, and cross-user reuse;
  - no viewer writes.
- **`flags.test.ts`:** production refuses each new switch.
- **Browser:** `scripts/e2e-access.mjs`, 13 checks with the features **off**: 404 entry points, a bare 404 callback, the owner page status, a saved rule with no effect, `/unavailable`, and axe at 1440 and 390 px.

## Proposed defaults (awaiting the owner)

| # | Proposed default |
|---|---|
| AG1 | Age-check scope defaults to `listed` (only countries with a rule) |
| AG2 | A passed check doesn't expire (`AGE_CHECK_VALIDITY_DAYS = null`). **UNKNOWN:** legal |
| AG3 | The owner is never gated. Creators and members are gated alike |
| AG4 | An unknown country follows the `XX` rule if one exists, otherwise it is allowed |
| AG5 | The country comes only from the trusted proxy's header |
| AG6 | At most 5 pending checks per hour per user |

## Blockers (owner, legal or provider decisions; not made here)
- **L-1:** which jurisdictions to serve, require checks in, or block.
- **P-2:** an age-assurance vendor meeting Ofcom's "highly effective" standard and EU expectations. It's paid, and the vendor and contract are the owner's choice.
- **Counsel:**
  - whether creators must also be checked;
  - how long a check stays valid;
  - VPN handling;
  - a DPIA for age data;
  - whether invite-only access changes any duty.
- **Hosting (I-1):** needed for a trustworthy country header.
