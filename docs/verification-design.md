# Age and identity verification: integration design

**Status:** designed and stubbed. **No vendor is selected, contacted or active** (Phase 3 decision 5). The current process is a manual owner review recorded in `app.creator_verifications` (`method = 'manual'`).

## What is built
- **Records:** `app.creator_verifications` holds status, method, vendor and vendor reference, the creator's attestation timestamps, the owner's checklist (`identity`, `age`, `consent_records`), the review note and the reviewer.
- **Gate:** a creator profile is visible to members only when it is **verified and published**. Only the owner can publish, and a database trigger enforces that.
- **Provider surface:** `src/server/verification/index.ts` defines a `VerificationProvider` interface (`startSession`, `parseWebhook`) and an **empty** registry.
- **Data minimisation:** we never store ID documents, document numbers, legal names or dates of birth. A vendor holds those. We keep its reference and the result.

## How a vendor would plug in
1. A creator chooses "Verify identity". The server calls `startSession()` and redirects to the vendor's hosted flow.
2. The vendor posts to `/api/verification/webhook`. `parseWebhook()` **must verify the signature**, reject replays (timestamp plus id), and map the result to `{ status, checks }`.
3. The result updates `creator_verifications` (`method = 'vendor'`). The owner still publishes. A vendor result never publishes a profile on its own.
4. All raw vendor payloads are discarded after mapping. Only the result and reference are kept.

## Vendor evaluation checklist (all needed before selection)

| Area | Questions |
|---|---|
| Content category | Does the vendor's acceptable-use policy permit adult creator platforms? Get written confirmation. |
| Regional coverage | Which countries' documents are supported, and how accurate is liveness by region? Does coverage match the creator base? |
| Legal fit | Does the output satisfy record-keeping and age-assurance obligations in each target jurisdiction? This needs counsel review; we do not decide it in code. |
| Privacy | Data residency, retention period, sub-processors, DPA, deletion on request, biometric data handling and consent. |
| Security | SOC 2 / ISO 27001, webhook signing, key rotation, incident notification SLA. |
| Product | Hosted flow quality on mobile, accessibility (WCAG), re-verification, fan age assurance (if required) versus creator KYC. |
| Commercials | Per-check pricing and minimums. **No purchase without approval.** |

## Consent and record-keeping
Creators attest that everyone appearing in their content is 18 or older, has consented, and that the required records are kept. Attestation is **not** verification. The owner's `consent_records` check records that a records process has been reviewed out of band. The legal standard and the record format depend on jurisdiction and must be defined with counsel before launch.

## Fan age assurance
Fans currently attest that they are 18 or older at application, and the owner approves each account personally. Whether a stronger age-assurance step is legally required depends on the jurisdictions served. If it is, the same provider interface supports it with a `subject: "fan"` extension.
