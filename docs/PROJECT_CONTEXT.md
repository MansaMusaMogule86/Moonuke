# Project context (one-page summary)

## What it is
**Moonuke** (a *working name*, centralised in `src/config/brand.ts`) is a private, **invitation-only** creator membership platform for adults (18+). It competes with Fanfix, OnlyFans, Fansly and Fanvue. It sets itself apart in four ways:
- A luxury black-and-gold editorial design.
- Pseudonymous fan identities (aliases).
- VIP memberships and locked content.
- Hands-on, "white-glove" creator onboarding.

## Business model (confirmed)
- **Access is controlled by one platform owner ("The House").** The owner issues invitations, approves every account, verifies creators, and can suspend anyone.
- **Invitation only.**
  - A valid invitation lets someone *apply*.
  - The account stays **pending** until the owner approves it.
  - Members and creators may *request* invitations for others. Only the owner decides.
- **Creators** publish profiles, membership tiers (Member and VIP), locked posts and pay-per-view posts.
  - Profiles are visible to approved members only after the owner **verifies and publishes** them.
- **Fans (members)** appear to creators only by alias. Their legal identity and payment data stay private.
- **Monetisation.** Subscriptions, VIP, pay-per-view, tips and messaging are planned. **No payment provider is approved or active.**

## Who uses it

| Role | What they can do today |
|---|---|
| Owner | Owner console: applications, invitations, referrals, onboarding pipeline, creator verification, moderation, members, email log, audit log. MFA is mandatory |
| Creator | Studio: profile draft, House proposals, social connections, verification request |
| Member | Discovery, profiles, follow, report and block, referral requests, account security |
| Public | Marketing homepage, design-system page, sign-in, invitation link. No age-restricted media |

## Current state
Phases 1–4 are built and run locally; nothing is deployed. Details are in `docs/CURRENT_STATUS.md`.

## Hard constraints
- Spend no money without approval. That covers payments, crypto, deployment, paid APIs, photography and CI.
- Portraits are placeholders, illustrated "studies", until the visual direction is approved.
- Don't promise anything about screenshot protection. Treat chargeback protection and crypto as *proposed* until legal and processor review.
