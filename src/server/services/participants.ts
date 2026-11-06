import "server-only";
import { asViewer } from "@/server/db";
import { can, type Viewer } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { seal, unseal } from "@/server/safety/seal";
import { audit } from "./audit";
import { announceNotices, issueNotice, type Issued } from "./notices";

// =====================================================================
// Participant identity, age and consent records.
// A creator records each person (other than themselves) who appears in their
// content: identity details are encrypted before storage, anyone under 18 is
// refused before anything is stored, and the house verifies the record.
// A post naming participants needs a verified record and an active consent
// for each, and then waits for house review. Withdrawing consent hides every
// post that relied on it immediately.
// No identity documents are stored: verification by an ID vendor or private
// document storage needs approval (DECISION_REGISTER P-6, A7).
// =====================================================================

export const DOC_TYPES = ["passport", "driving_licence", "national_id", "other_government_id"] as const;
export type DocType = (typeof DOC_TYPES)[number];
export type Identity = { legalName: string; dateOfBirth: string; documentType: DocType; documentCountry: string };

const pgError = (e: unknown): never => {
  const code = (e as { code?: string }).code;
  if (code === "P0002") throw new AppError("not_found", "Not found.");
  if (code === "22023") throw new AppError("validation", (e as Error).message.replace(/^./, (c) => c.toUpperCase()) + ".");
  if (code === "42501") throw new AppError("forbidden", "Not allowed.");
  throw e;
};

function assertCreator(v: Viewer) {
  if (v.role !== "creator" || v.status !== "active") throw new AppError("forbidden", "Not allowed.");
}
function assertOwner(v: Viewer) {
  if (!can(v, "moderation.review")) throw new AppError("forbidden", "Not allowed.");
}

/** Whole years between a YYYY-MM-DD birth date and `on` (UTC). */
export function ageOn(dateOfBirth: string, on = new Date()): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!m) return NaN;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dob = new Date(Date.UTC(y, mo - 1, d));
  if (dob.getUTCFullYear() !== y || dob.getUTCMonth() !== mo - 1 || dob.getUTCDate() !== d) return NaN;
  let age = on.getUTCFullYear() - y;
  if (on.getUTCMonth() < mo - 1 || (on.getUTCMonth() === mo - 1 && on.getUTCDate() < d)) age--;
  return age;
}

export async function addParticipant(v: Viewer, input: { label: string } & Identity, now = new Date()): Promise<string> {
  assertCreator(v);
  const label = input.label.trim();
  const legalName = input.legalName.trim();
  const country = input.documentCountry.trim().toUpperCase();
  if (label.length < 1 || label.length > 60) throw new AppError("validation", "Give this person a short label (up to 60 characters).", "label");
  if (legalName.length < 2 || legalName.length > 120) throw new AppError("validation", "Enter their full legal name.", "legalName");
  if (!DOC_TYPES.includes(input.documentType)) throw new AppError("validation", "Choose the ID document type.", "documentType");
  if (!/^[A-Z]{2}$/.test(country)) throw new AppError("validation", "Use the two-letter country code of the ID (for example GB).", "documentCountry");
  const age = ageOn(input.dateOfBirth, now);
  if (Number.isNaN(age) || age > 120) throw new AppError("validation", "Enter a valid date of birth.", "dateOfBirth");
  if (age < 18) {
    // Nothing about the person is stored. The refusal itself is recorded.
    await asViewer(v, (q) => audit(q, { actorId: v.id, action: "participant.refused_minor", targetType: "user", targetId: v.id }));
    throw new AppError("validation", "Everyone who appears in content must be 18 or older. This person can't be added.", "dateOfBirth");
  }
  const enc = seal("participant-identity", { legalName, dateOfBirth: input.dateOfBirth, documentType: input.documentType, documentCountry: country } satisfies Identity);
  return asViewer(v, async (q) => (await q.one<{ id: string }>(`select app.add_participant($1, $2) as id`, [label, enc]).catch(pgError))!.id);
}

export type ParticipantRow = {
  id: string; label: string; status: "pending" | "verified" | "rejected" | "revoked"; review_note: string | null;
  created_at: Date; reviewed_at: Date | null; active_consents: number; withdrawn_consents: number; posts: number;
};
export async function myParticipants(v: Viewer): Promise<ParticipantRow[]> {
  assertCreator(v);
  return asViewer(v, (q) => q.query<ParticipantRow>(`select * from app.my_participants()`));
}

export type ConsentRow = { id: string; scope: string; signed_on: string; created_at: Date; withdrawn_at: Date | null; withdrawal_reason: string | null };
export async function myConsents(v: Viewer, participantId: string): Promise<ConsentRow[]> {
  assertCreator(v);
  return asViewer(v, (q) => q.query<ConsentRow>(`select id, scope, to_char(signed_on, 'YYYY-MM-DD') as signed_on, created_at, withdrawn_at, withdrawal_reason from app.my_consents($1)`, [participantId]));
}

export async function addConsent(v: Viewer, participantId: string, input: { scope: string; signedOn: string; signature: string }): Promise<string> {
  assertCreator(v);
  const scope = input.scope.trim();
  const signature = input.signature.trim();
  if (scope.length < 3 || scope.length > 500) throw new AppError("validation", "Describe what the consent covers (3–500 characters).", "scope");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.signedOn) || Number.isNaN(Date.parse(input.signedOn))) throw new AppError("validation", "Enter the date it was signed.", "signedOn");
  if (signature.length < 2 || signature.length > 120) throw new AppError("validation", "Enter the name the participant signed with.", "signature");
  const enc = seal("consent-signature", { signature, recordedAt: new Date().toISOString() });
  return asViewer(v, async (q) => (await q.one<{ id: string }>(`select app.add_consent($1, $2, $3::date, $4) as id`, [participantId, scope, input.signedOn, enc]).catch(pgError))!.id);
}

/** Creator (for their own participant) or owner (from a notice). Returns how many posts were hidden. */
export async function withdrawConsent(v: Viewer, consentId: string, reason: string): Promise<number> {
  if (!(v.role === "creator" && v.status === "active") && !can(v, "moderation.review")) throw new AppError("forbidden", "Not allowed.");
  let issued: Issued | null = null;
  const n = await asViewer(v, async (q) => {
    const n = (await q.one<{ n: number }>(`select app.withdraw_consent($1, $2) as n`, [consentId, reason.trim().slice(0, 500)]).catch(pgError))!.n;
    // Withdrawn by the house: the creator gets a statement of reasons.
    if (v.role === "owner") {
      const p = await q.one<{ participant_id: string; creator_id: string; label: string }>(`select * from app.participant_ref(null, $1)`, [consentId]);
      if (p) issued = await issueNotice(q, { kind: "consent_withdrawn", userId: p.creator_id, participantId: p.participant_id, sourceType: "consent", sourceId: consentId, label: p.label, note: reason });
    }
    return n;
  });
  await announceNotices([issued]).catch(() => {});
  return n;
}

export type PostParticipant = { participant_id: string; label: string; consent_id: string; consent_active: boolean };
export async function postParticipants(v: Viewer, postId: string): Promise<PostParticipant[]> {
  return asViewer(v, (q) => q.query<PostParticipant>(`select * from app.post_participant_list($1)`, [postId]));
}

export async function setPostParticipants(v: Viewer, postId: string, links: { participantId: string; consentId: string }[]) {
  assertCreator(v);
  if (links.length > 20) throw new AppError("validation", "A post can name up to 20 people.");
  if (new Set(links.map((l) => l.participantId)).size !== links.length) throw new AppError("validation", "Each person can be named once.");
  await asViewer(v, (q) =>
    q.query(`select app.set_post_participants($1, $2::uuid[], $3::uuid[])`, [postId, links.map((l) => l.participantId), links.map((l) => l.consentId)]).catch(pgError),
  );
}

// ---------------------------------------------------------------- owner

export type QueueParticipant = { id: string; creator_id: string; creator_name: string; label: string; status: ParticipantRow["status"]; created_at: Date; consents: number; posts: number };
export async function participantQueue(v: Viewer): Promise<QueueParticipant[]> {
  assertOwner(v);
  return asViewer(v, (q) => q.query<QueueParticipant>(`select * from app.participant_queue()`));
}

/** Decrypt identity details for verification. The purpose is written to the audit log before anything is returned. */
export async function revealIdentity(v: Viewer, id: string, purpose: string): Promise<Identity> {
  assertOwner(v);
  if (purpose.trim().length < 10) throw new AppError("validation", "State why you need to see this (10+ characters).", "purpose");
  const enc = await asViewer(v, async (q) => (await q.one<{ enc: string }>(`select app.participant_identity($1, $2) as enc`, [id, purpose.trim()]).catch(pgError))!.enc);
  return unseal<Identity>("participant-identity", enc);
}

export async function reviewParticipant(v: Viewer, id: string, decision: "verified" | "rejected" | "revoked", note?: string) {
  assertOwner(v);
  let issued: Issued | null = null;
  await asViewer(v, async (q) => {
    await q.query(`select app.review_participant($1, $2, $3)`, [id, decision, note?.trim() ?? ""]).catch(pgError);
    if (decision === "revoked") {
      const p = (await q.one<{ creator_id: string; label: string }>(`select creator_id, label from app.participant_ref($1, null)`, [id]))!;
      issued = await issueNotice(q, { kind: "verification_revoked", userId: p.creator_id, participantId: id, sourceType: "participant", label: p.label, note });
    }
  });
  await announceNotices([issued]).catch(() => {});
}
