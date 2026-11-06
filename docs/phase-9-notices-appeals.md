# Phase 9: statements of reasons and creator appeals

The owner chose this phase on 2026-11-06. It closes the gap listed in `docs/DECISION_REGISTER.md` §7d ("statements of reasons and appeals for creators"), aimed at EU DSA Art. 17 and 20 (REPORTED; counsel to confirm).

It runs locally only: nothing was deployed, no paid service was added, and no confirmed default changed.

## What it does
- **Notices.** Every house decision that restricts a creator's content issues a **notice** to that creator, inside the same transaction as the decision:

  | Decision | Notice kind |
  |---|---|
  | Takedown removal, including each identical copy | `takedown_removed` (copies are marked "found automatically") |
  | Review rejection | `review_rejected` |
  | Moderation "hide post" | `moderation_removed` |
  | Participant verification revoked | `verification_revoked` |
  | Consent withdrawn **by the house** | `consent_withdrawn` |

- **Each notice states:**
  - the decision;
  - the facts, including the house note if any;
  - the ground;
  - whether automated means were used;
  - the redress: an internal appeal, and out-of-court bodies or the courts.

  The person who reported the content is never identified.
- **Delivery:** an in-app notification ("A decision about your content", linking to `/studio/notices`), an email with no details, and a "Notices (N new)" button in Studio.
- **No notice while the content is under a safeguarding legal hold**, so a report or an investigation can't be tipped off.
- **Appeals.**
  - One per notice, by its recipient only, within **183 days**, from `/studio/notices`.
  - The owner decides at `/admin/safety/appeals`, with a note of at least 10 characters that the creator sees.
  - Decisions are final.
- **What overturning does:**

  | Notice | Overturn |
  |---|---|
  | Takedown | Un-hides the post and lifts that notice's fingerprint block |
  | Moderation removal | Un-hides the post |
  | Review rejection | Approves the post |
  | Verification revoked | Restores the verification and un-hides posts whose people are all valid again |
  | Consent withdrawn | **Not possible.** It can only be upheld; the creator can record a new consent |

  Overturning is also refused for content in an uncleared safeguarding case, and the consent guard still applies.

## Database
`20261115000001_phase9_notices_appeals.sql`:
- **Tables:** `moderation_notices` and `decision_appeals`, both with RLS.
  - The recipient reads their own; the owner reads all.
  - Only the owner (AAL2) can issue notices, never to themselves.
  - The recipient may only set `read_at`, once.
  - Appeals are filed through `app.file_decision_appeal()`, which checks the window and allows one per notice. The owner decides under RLS.
  - Guard triggers make notices and appeals immutable, and undeletable by every role.
- **Owner helpers:** `app.overturn_review()`, `app.restore_participant()` and `app.participant_ref()`.
- **Owner policy:** delete on `blocked_media_hashes`, for overturned takedowns.

## Tests
- **Server:** `tests/server/notices.test.ts`, 8 tests:
  - notices for every decision type, with copies marked automated and the requester never identified;
  - no notice for a creator's own withdrawal or under a hold;
  - privacy, immutability and owner-only issuing;
  - one appeal, recipient only, within the window;
  - every overturn path, with the consent refusal;
  - final decisions, at the app layer and in RLS.
- **Browser:** `scripts/e2e-notices.mjs`, 22 checks with axe at 1440 and 390 px. The flow covers rejection, the notice and notification, reading the statement, a refused short appeal, one appeal only, access denial, overturning, the post returning, and the outcome shown to the creator.

## Proposed defaults (awaiting owner confirmation)

| # | Proposed default |
|---|---|
| AP1 | Appeal window: 183 days (DSA Art. 20(1) requires at least six months) |
| AP2 | One appeal per decision. The owner decides, and the decision is final |
| AP3 | No notice while the content is under a safeguarding hold. **Open:** whether to issue one later, once the case is cleared |
| AP4 | Only final house decisions issue notices. Automatic "withheld pending review" (S1, SC2) and a creator's own consent withdrawal don't. **Open:** whether the DSA requires notices for temporary restrictions |
| AP5 | A consent withdrawal can't be overturned on appeal |
| AP6 | Notice emails contain no details |

## Still open
- Counsel: whether the DSA (or UK OSA) applies, and the exact contents of the statements.
- Submitting statements to the EU transparency database (DSA Art. 24(5)) is not built.
- Appeals for members, for example about suspensions.
- Out-of-court dispute body details.
