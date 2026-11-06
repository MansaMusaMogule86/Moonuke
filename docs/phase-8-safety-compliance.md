# Phase 8: safety and compliance

Approved by the owner on 2026-11-06, as items 1–4 of the roadmap in `docs/DECISION_REGISTER.md` §5. The four items are:

1. Public takedown notices.
2. Pre-publication review.
3. Participant identity, age and consent records.
4. Safeguarding with NCMEC report preparation.

**What this phase did not do:**
- Nothing was deployed.
- No paid service was added.
- Nothing is sent to any external party.
- None of the 52 confirmed defaults changed. PAY2 is untouched.
- The visual identity is unchanged.

**Not legal advice.** Every procedure below must be verified by counsel before launch (§8).

## Migration
`supabase/migrations/20261114000001_phase8_safety_compliance.sql`. It adds:

- **Tables** (all with RLS):
  - `blocked_media_hashes`
  - `safety_settings`
  - `participants`, `participant_consents`, `post_participants`
  - `takedown_notices`
  - `safeguarding_staff`, `safeguarding_cases`, `safeguarding_events`
  - `legal_holds`
- **Columns on `posts`:** `review_state`, `review_reasons`, `review_note`, `reviewed_by`, `reviewed_at`.
- **Function** `app.media_hashes(media)`, with a GIN index for finding identical copies.
- **Guard triggers** (SECURITY INVOKER):
  - `posts_review_guard`
  - `posts_consent_guard`
  - `post_content_media_guard`
  - `post_content_hold_guard`
  - `legal_hold_delete_guard`, on posts, post content, users, messages and uploads
  - `legal_holds_guard`
  - `safeguarding_events_guard`
- **Redefined, with the review gate added:** `can_view_post()`, `post_is_live()` and the `posts_select` policy.
- **`moderation_actions` action check:** gains `takedown_remove` and `takedown_hide`.

**Access model:**
- `mk_app` has no table grants on participant, settings or staff tables. Everything goes through SECURITY DEFINER functions that check `app.uid()` or `app.is_owner()`, pin `search_path`, and aren't executable by PUBLIC.
- Takedown notices: the owner at AAL2 can read them and update the decision columns under RLS. Inserts come only from the server.
- Safeguarding tables are readable only when `app.is_safeguarding_staff()` is true: the owner at AAL2 **and** an attested training record.

## 1. Public takedown notices
- **Page:** `/takedown`. No account is needed, and it's linked from the site footer as "Report content".
- **Categories:**
  - NCII
  - CSAM
  - consent withdrawn
  - impersonation
  - other illegal content
- **Fields:**
  - requester role
  - location (a link or a description)
  - description
  - name and email
  - a good-faith statement
  - an electronic signature (the typed name)
- **No oracle.** The response is always just a reference (`TD-XXXXXXXXXX`), whether or not the content exists, for duplicates, and for honeypot hits. Filing grants no session and no access.
- **Privacy.**
  - The requester's name, email and signature are encrypted with AES-256-GCM (`src/server/safety/seal.ts`).
  - A keyed hash of the email is used only for deduplication and rate limits.
  - Revealing the contact is owner-only and audited before decryption.
  - No acknowledgement email is sent, so the email is never copied in plaintext to the outbox (SC9).
- **Abuse prevention:**
  - 5 notices per hour per network.
  - 5 per day per email.
  - A hidden honeypot field.
  - Length limits.
  - NCII and consent withdrawal can only be filed by the person shown or their representative.
- **Deduplication.**
  - The same requester and target return the existing reference.
  - Another requester's notice is linked to the first open notice (`duplicate_of`) and decided with it.
- **Clock.** `due_at` is receipt plus 48 hours. A table CHECK forbids anything later. The queue shows the hours left, notices due within 12 hours, and overdue notices.
- **Urgent categories** (NCII, CSAM, consent withdrawn): the post is withheld on receipt, mirroring S1. Rejecting the notice restores only what the notice itself hid.
- **Removal:**
  - Hides the post and **every known identical copy**: posts sharing any media fingerprint.
  - Adds the fingerprints to `blocked_media_hashes`.
  - The database then refuses that media in any post for every role, and the upload pipeline quarantines a matching file.
  - Nothing is deleted.
- **CSAM notices** open a safeguarding case at once (§4). They can't be rejected from the takedown queue.
- **Admin:** `/admin/safety` (the queue) and `/admin/safety/takedown/[id]` (detail, contact reveal and decision).

## 2. Pre-publication review
- **Mode** (owner, audited):
  - **`flagged`** (default): posts that name other participants wait for review. Ordinary posts publish as before.
  - **`all`:** every new or edited post waits.
- **Enforced in the database:**
  - Pending and rejected posts are invisible to everyone except their creator and the owner, through RLS, `can_view_post()` (which also governs the signed media route), `post_is_live()` (notifications) and therefore the vault.
  - Creators can't write review columns: the guard raises 42501, and an insert is forced to `not_required`, or `pending` in `all` mode.
  - A creator's edit to a reviewed post (teaser, access, format, body or media) sends it back to the queue.
- **Decisions** go through `app.decide_post_review()`: owner only, a note required to reject, audited.
- **Pages:** the queue is `/admin/safety/review`. Studio shows "Waiting for review" and "Not approved", with the house's note.

## 3. Participants, age and consent
- **Studio:** `/studio/participants`. A creator records each person other than themselves:
  - a label, legal name and date of birth;
  - the ID document type and country.
  - **No document images or numbers are stored.**
- **Under 18 is refused before anything is stored.** Only the refusal is audited.
- **Encryption:** identity is sealed with AES-256-GCM; consent signatures are sealed too.
- **Verification:** the owner verifies (`/admin/safety/participants`).
  - Seeing the identity requires a stated purpose, which is audited before decryption.
  - Verify, reject or revoke. Revoking hides every post that names the person.
- **Consents:** a scope, the date signed, and a sealed signature.
- **Naming people in a post** ("People in this post" on the post editor):
  - Each person must be **verified** and have an **active consent**.
  - The post then waits for house review.
- **Withdrawing consent** (by the creator, or by the owner from a notice) hides every post that relied on it, immediately. The consent can't be reused.
- **Nobody can un-hide such a post** while a consent is withdrawn or a verification revoked. That includes the owner's ordinary "restore" and the server role (`posts_consent_guard`).
- **Records are never deleted:** foreign keys are `on delete restrict`.

## 4. Safeguarding and NCMEC preparation
- **Cases open automatically** (server role; reporters can't open them) from:
  - a member report with reason `underage_concern`;
  - a CSAM takedown notice;
  - an upload hash-list match.

  Trained staff can also open one by hand.
- **On opening:**
  - The subjects (post, account, message or upload) are put under a **legal hold**, with a snapshot of identifiers, timestamps, text and media fingerprints.
  - The preservation period is at least 365 days (18 U.S.C. § 2258A(h) as amended by the REPORT Act; VERIFIED in the register).
  - The owner gets an alert email with no details.
- **Holds:**
  - Deletes of held posts, post content, accounts, messages and uploads are blocked for **every** role, including the server.
  - Held post content can't be rewritten.
  - Holds can't be deleted or shortened; they can only be extended or released.
  - Release requires a closed case, an ended period and a reason.
  - Release deletes nothing.
- **Independent of ordinary moderation:**
  - Cases have their own page.
  - The moderation queue **can't dismiss or restore** content in an uncleared case.
  - The safety overview shows an urgent banner with a count even before training is recorded.
- **Restricted access:** the owner at AAL2 **plus** a training attestation (date within 3 years, course name, audited). Without it, `/admin/safety/safeguarding` shows only the count and the attestation form, and RLS returns no rows.
- **Workflow:** open → assessing → report required or no report required (a reason of at least 40 characters) → reported → closed.
  - "Reported" requires the CyberTipline report number **and** an attestation that it was submitted manually through the official CyberTipline. The database also enforces this with a CHECK.
  - Every step is in an append-only case log and the audit log.
- **No external submission.**
  - `src/server/safety/ncmec.ts` has only a manual channel, whose `submit()` throws.
  - "Prepare CyberTipline draft" builds a checklist from preserved metadata. It holds identifiers, timestamps and fingerprints, never content.
  - Content is not displayed on case pages.

## 5. Other changes
- **Blast worker fix (B1 unchanged).**
  - Blasts claimed together were counting each other towards the 3-per-day cap, and a JavaScript clock (milliseconds) was compared with Postgres timestamps (microseconds), missing just-due Blasts.
  - The worker now ranks by schedule and uses the database clock.
  - This fixed a regression test that failed intermittently. It failed 3 of 4 runs on the unmodified baseline and passed 6 of 6 after the fix.
- **Studio:** `myPosts` and `myPost` return `review`, `reviewNote` and `hiddenReason`. Legal-hold and blocked-media errors become clear messages.
- **Forms:** dropdowns keep the user's choice after a validation error. They're keyed so they remount, because React's form reset otherwise clears them.

## 6. Tests
- **Server:** `tests/server/safety-compliance.test.ts`, 28 tests, run against real Postgres.
  - **Takedowns:** encryption, the 48-hour clock, urgent withholding, no oracle, deduplication, validation, honeypot, rate limits, owner-only access at the app layer and RLS (including AAL1 denial), removal with identical copies and the fingerprint block, rejection and audited contact access, CSAM escalation.
  - **Review:** the default mode preserves behaviour; in `all` mode a post is invisible everywhere (RLS, post content, profile, signed media); every creator bypass attempt fails; rejection notes; notifications are gated.
  - **Participants:** age arithmetic; under-18 refusal; encryption and privacy, with no table access; purpose-audited reveal; linking only when verified and consented; withdrawal hides posts; revocation.
  - **Safeguarding:**
    - automatic case and holds;
    - the training gate (app layer, RLS, AAL1);
    - the ordinary queue can't dismiss;
    - workflow rules;
    - no external channel, and a content-free draft;
    - holds block deletes by every role;
    - append-only evidence;
    - release rules;
    - scanner-match escalation.
- **Browser:** `scripts/e2e-safety.mjs`, 52 checks with axe at 1440 and 390 px:
  - the public form, with an error that keeps values, deduplication, encryption and the clock;
  - access denial for signed-out visitors, members and creators;
  - the owner queue, contact reveal and removal;
  - review approval and mode switching;
  - participant refusal and addition, consent, verification, linking and withdrawal;
  - the CSAM escalation, training gate, case page, draft and assessment.

## 7. Proposed defaults introduced by this phase (not yet confirmed)
These are listed in `docs/DECISION_REGISTER.md` §7 as **SC1–SC11** for the owner to confirm or change.

## 8. Not built, and why
See `docs/DECISION_REGISTER.md` §7:
- statements of reasons and appeals for creators;
- an acknowledgement channel for requesters;
- ID-document verification;
- private evidence storage;
- NCMEC registration;
- counsel review;
- a managed encryption key;
- the moderator role.
