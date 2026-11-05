# Phase 4: White-glove creator onboarding

Built on `claude/cool-noether-uvf5h7`. GitHub-hosted CI is paused (no spend). All verification runs locally with `pnpm verify`.

## What it does
1. **The owner opens a case** at `/admin/onboarding` with the creator's name, email and a private concierge note. The case issues a single-use creator invitation, locked to that email and valid for 14 days. The link can be emailed or copied by hand.
2. **The creator applies** through the link. The account starts pending, exactly as in Phase 2, and the case attaches to it.
3. **The owner approves** the account, schedules or marks the welcome call, and **prepares the profile**. The owner can do this by hand or with the profile assistant, and sends the result as a **proposal**.
4. **The creator decides.** `/studio` shows exactly what would change, with old values struck through. Accepting saves it **as the creator**. Declining changes nothing. The house never writes the profile directly.
5. **Social profiles.** The creator adds their handles, and each one gets a proof code (`mnk-xxxxxxxx`) to place in that profile's bio. The owner opens the link, checks the code and marks it verified. Verified socials can be shown on the profile if the creator opts in.
6. **Verification and publishing** are unchanged from Phase 3: the creator's attestations, then the owner's checklist, then **Verify & publish**.

The pipeline board groups every creator, white-glove or self-serve, by what needs to happen next:

> Invited → To approve → Preparing profile → Verification → Ready to verify → Live

Stages are derived from the data, never stored.

## Security model

| Rule | Enforced by |
|---|---|
| Concierge notes and cases are owner-only | RLS on `onboarding_cases`. Creators get `app.my_onboarding_case()`, which has no notes |
| Only the creator can accept or decline a proposal | RLS: the owner may only `superseded` a proposal; the creator may only `accepted` or `declined` their own |
| Proposals never touch `app.creators` | Service: acceptance calls `saveProfile` as the creator |
| Creators can't verify their own socials | Guard trigger (`SECURITY INVOKER`): status, method and verifier are owner-only |
| Editing a verified handle or URL resets verification and hides it | Same trigger |
| Members see only verified, opted-in socials of creators they can already see | RLS uses `can_see_creator`, so blocks, unpublished and private profiles all apply |
| Platform links stay on the platform's own domain | Service validation; https only |
| A white-glove invite cannot be redeemed with another email | Phase 2 email-locked redemption |

## Profile assistant

| `AI_PROVIDER` | Behaviour | Cost |
|---|---|---|
| `template` (default) | Local generator. Nothing leaves the server | Free |
| `anthropic` | Claude via the official SDK (`AI_MODEL`, default `claude-opus-5-5`), structured output, server-side refusal fallback (`fallbacks: "default"`) | Billed by Anthropic. Opt-in only |
| `disabled` | Assistant hidden | — |

- **Only these notes are sent:** display name, discipline, city, themes, what members get and tone. Never email, identity or socials. An external provider requires an explicit consent tick.
- **Hard safety filter** on inputs **and** outputs: anything sexualising minors or implying youth, and non-consent themes, is refused. Contact details, links and @handles are stripped from suggestions.
- **Suggestions are never saved automatically.** "Use" copies the text into a form, and a person reviews and saves it.
- **Usage is metered** in `ai_assist_usage` (who, provider, character counts, blocked or not). Prompts and outputs are **never stored**.
- **Rate limit:** 30 drafts per day per user.

## Migration
`20261107000001_phase4_onboarding.sql` adds:
- `onboarding_cases`
- `profile_proposals`
- `social_connections`
- `ai_assist_usage`
- RLS policies, the socials guard trigger, and the `my_onboarding_case()` function

## Routes

| Route | Access |
|---|---|
| `/admin/onboarding` | Owner at AAL2: the board and the open-case form |
| `/admin/onboarding/case/[caseId]`, `/admin/onboarding/creator/[userId]` | Owner: concierge notes, welcome call, proposal composer with the assistant, social review |
| `/studio` | Active creators: progress, house proposal, profile editor with the assistant, socials, verification |

## Decisions (please confirm)

| # | Decision | Default |
|---|---|---|
| W1 | White-glove invitation lifetime | 14 days, single use, email-locked |
| W2 | Welcome call and socials are optional steps | Shown, never blocking |
| W3 | Social verification is manual (proof code in bio) | No platform APIs, scraping or paid services |
| W4 | Default AI provider | `template` (free, local). `anthropic` only if you set a key |
| W5 | `AI_MODEL` default | `claude-opus-5-5`. Cheaper models are configurable; that's your call |

## Known limitations
- Social verification is a human check. There is no automated fetch, because platforms block scraping and official APIs need app review.
- No content studio, tiers editor or uploads yet. Profile copy only.
- The assistant's safety filter is a keyword and pattern list. It is conservative but not a classifier, so pair it with human review (the owner already approves everything).
- The Anthropic adapter is typechecked against the SDK but **was not called live**. No API key was used, so no cost was incurred.
