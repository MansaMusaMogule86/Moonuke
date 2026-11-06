# Phase 11: restricted moderator role (inactive)

The owner requested this phase on 2026-11-06. It is **built and switched off.** No one has moderator access, and none can be granted, until the owner approves the role (A1, B-6). Production refuses `FEATURE_MODERATORS=on`.

## Who can be a moderator
- An **active member** (never a creator or the owner) with **two-step sign-in** set up, holding a staff grant.
- **Four conditions must all hold** for a capability to work. They're checked in the app and again in Postgres (`app.has_capability`):
  1. `FEATURE_MODERATORS=on` on the server. Production refuses it.
  2. The owner's switch, `safety_settings.moderators_enabled`. It defaults to off and can only be turned on when (1) holds.
  3. An unrevoked grant naming the capability.
  4. An AAL2 session.
- Revoking or switching off takes effect **immediately**, even for a session already holding capabilities, because RLS checks live.

## Capabilities
Capabilities are a strict subset; the vocabulary is in `src/server/auth/staff.ts`.

| Capability | Allows | Never |
|---|---|---|
| `reports.view` | The report queue | Reports they filed, or reports about themselves |
| `reports.decide` | In review, dismiss, resolve, escalate | Suspensions (owner only) |
| `content.hide` | Hide or restore a reported post | Editing posts |
| `review.decide` | Approve or reject posts before publication, including seeing their content | Changing the review mode |
| `takedowns.decide` | Decide takedown notices, including copies | Seeing the requester's contact details |
| `appeals.decide` | Decide creator appeals | Appeals of their own decisions, or participant and consent cases |

**Owner only, never delegable:**
- invitations, approvals and suspensions;
- safeguarding;
- participant identity and requester contact;
- exceptional access;
- settings, access rules and grants;
- payments.

Moderators can't read private messages, safeguarding cases, legal holds, participant tables or the audit log (all checked in RLS).

## Reuse, not duplication
Moderators use the **same services, queues, forms and server actions** as the owner:
- `moderate`, `decideReview`, `decideTakedown` and `decideAppeal`;
- `ModerationCard`, `ReviewDecision`, `TakedownDecision` and `DecideDecisionAppeal`.

Each service now checks "the owner, **or** a moderator holding the capability" (`assertOwnerOrStaff`). The moderator console, `/staff`, only arranges the allowed queues. It's a 404 for anyone without effective capabilities.

Statements of reasons (Phase 9) are issued for moderator decisions exactly as for the owner's, with `issued_by` set to the moderator.

## Audit
- Every moderator decision goes to the append-only audit log, under the moderator's own id, through the existing services.
- **Queue views** are recorded too (`staff.view_queue`).
- Grants, revocations and the switch are recorded (`staff.grant`, `staff.revoke`, `staff.switch`).
- The owner's `/admin/staff` page shows each moderator's capabilities, grant and revocation, action count, and a full activity log.

## Database
`20261117000001_phase11_moderators.sql`:
- `staff_grants`, readable by the owner and the grantee. Writes go only through `grant_staff`, `revoke_staff` and `set_moderators_enabled`: owner only, audited.
- `has_capability()`, plus helpers.
- **Extended** with a staff branch (owner behaviour unchanged):
  - `posts_guard`, `posts_select`, `can_view_post`;
  - `decide_post_review`, `overturn_review`;
  - reports and moderation-log policies;
  - takedown and fingerprint policies;
  - notice and appeal policies.

## Tests
- **Server:** `tests/server/moderators.test.ts`, 12 tests:
  - inactive by default (granting and switching refused; a grant is inert with the switch off; sessions carry no capabilities while the flag is off);
  - eligibility (members with MFA only, never creators; no unknown capabilities);
  - owner-only management, at the app layer and in RLS;
  - AAL1 denial;
  - reports: self-exclusion, no suspension, hide with a notice, no editing;
  - view-only can't decide (app layer and RLS);
  - owner-only powers stay closed: safeguarding, holds, participants, identity, review mode, grants, requester contact, audit log, messages;
  - review with content and a notice;
  - takedowns;
  - appeals: never their own decisions;
  - revocation and switch-off are immediate;
  - activity log;
  - grants are immutable to viewers.
- **Browser:** `scripts/e2e-staff.mjs`, 11 checks with the role **off**. Even with a grant and the switch set directly in the database, `/staff`, `/admin/staff` and `/admin/moderation` are 404 for the member. Granting is refused. Axe at 1440 and 390 px.

## Proposed defaults (awaiting the owner)

| # | Proposed default |
|---|---|
| MOD1 | Moderators must be members, never creators (conflict of interest) |
| MOD2 | Two-step sign-in is required |
| MOD3 | Moderators can't see the identities of reporters or targets (aliases are hidden by RLS) |
| MOD4 | Participant and consent appeals, suspensions and safeguarding stay owner only |
| MOD5 | Activation needs both the server flag and the owner's switch |

## Decisions for the owner (not made here)
- **A1 / B-6:** whether to have moderators at all, who, how they're vetted and trained, and any contract or confidentiality terms.
- Whether moderators may see reporter or target aliases (today they can't).
- Whether moderators should handle messaging queues: held messages and pauses (`reports.context` and `accounts.pause_messaging` are reserved, not wired).
- Wellbeing and exposure policy for reviewers of sensitive content (counsel and HR).
