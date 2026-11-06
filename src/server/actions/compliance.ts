"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { FormState } from "@/lib/forms";
import { requestMeta, requireViewer } from "@/server/auth/request";
import { deliverPending } from "@/server/email/outbox";
import { isAppError } from "@/server/errors";
import { uuid } from "@/server/validation";
import { decideTakedown, submitTakedown, takedownContact, type RequesterRole, type TakedownCategory, type TakedownDecision } from "@/server/services/takedown";
import { decideReview, setReviewMode } from "@/server/services/review";
import { addConsent, addParticipant, revealIdentity, reviewParticipant, setPostParticipants, withdrawConsent, type DocType } from "@/server/services/participants";
import { attestTraining, cyberTiplineDraft, decideCase, releaseHold, type CaseAction } from "@/server/services/safeguarding";
import { decideAppeal, fileAppeal } from "@/server/services/notices";

// Server actions for safety and compliance. Every action re-checks the
// caller on the server; services check again, and RLS checks a third time.

const str = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");
const fail = (e: unknown, values?: Record<string, string>): FormState => {
  if (isAppError(e)) return { status: "error", message: e.message, fields: e.field ? { [e.field]: e.message } : undefined, values };
  throw e;
};
const bad: FormState = { status: "error", message: "Invalid request." };

// ---------------------------------------------------------------- public

/** No account needed. Never reveals whether the content exists. */
export async function takedownAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = {
    category: str(fd, "category"), requesterRole: str(fd, "requesterRole"), name: str(fd, "name"), email: str(fd, "email"),
    location: str(fd, "location"), description: str(fd, "description"), signature: str(fd, "signature"),
  };
  try {
    const r = await submitTakedown(
      {
        category: values.category as TakedownCategory,
        requesterRole: values.requesterRole as RequesterRole,
        name: values.name,
        email: values.email,
        location: values.location,
        description: values.description,
        signature: values.signature,
        goodFaith: str(fd, "goodFaith") === "on",
        honeypot: str(fd, "website"),
      },
      await requestMeta(),
    );
    after(() => deliverPending().catch(() => {}));
    return { status: "success", message: "Your notice was received.", data: { reference: r.reference } };
  } catch (e) {
    return fail(e, values);
  }
}

// ---------------------------------------------------------------- owner: takedowns

export async function decideTakedownAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const v = await requireViewer("moderation.review");
  const id = str(fd, "id");
  const decision = str(fd, "decision") as TakedownDecision;
  if (!uuid.safeParse(id).success || !["in_review", "remove", "reject"].includes(decision)) return bad;
  try {
    const r = await decideTakedown(v, id, decision, str(fd, "note"), await requestMeta());
    const msg = r.status === "removed" ? `Removed${r.copies ? `, with ${r.copies} identical ${r.copies === 1 ? "copy" : "copies"}` : ""}. The media can't be published again.` : r.status === "rejected" ? "Notice rejected." : "Marked in review.";
    return { status: "success", message: msg, data: { status: r.status } };
  } catch (e) {
    return fail(e, { note: str(fd, "note") });
  }
}

export async function revealContactAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const v = await requireViewer("moderation.review");
  const id = str(fd, "id");
  if (!uuid.safeParse(id).success) return bad;
  try {
    const c = await takedownContact(v, id, await requestMeta());
    return { status: "success", message: "Shown and recorded in the audit log.", data: c };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- owner: review

export async function reviewModeAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const v = await requireViewer("moderation.review");
  const mode = str(fd, "mode");
  if (mode !== "flagged" && mode !== "all") return bad;
  try {
    await setReviewMode(v, mode);
    return { status: "success", message: mode === "all" ? "Every new or edited post now waits for review." : "Only flagged posts wait for review.", data: { mode } };
  } catch (e) {
    return fail(e);
  }
}

export async function decideReviewAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const v = await requireViewer("moderation.review");
  const id = str(fd, "id");
  const decision = str(fd, "decision");
  if (!uuid.safeParse(id).success || !["approve", "reject"].includes(decision)) return bad;
  try {
    const s = await decideReview(v, id, decision === "approve", str(fd, "note"));
    return { status: "success", message: s === "approved" ? "Approved. Members can see it from its publish time." : "Rejected. The creator sees your note." };
  } catch (e) {
    return fail(e, { note: str(fd, "note") });
  }
}

// ---------------------------------------------------------------- owner: participants

export async function revealIdentityAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const v = await requireViewer("moderation.review");
  const id = str(fd, "id");
  if (!uuid.safeParse(id).success) return bad;
  try {
    const i = await revealIdentity(v, id, str(fd, "purpose"));
    return { status: "success", message: "Shown and recorded in the audit log.", data: { ...i } };
  } catch (e) {
    return fail(e, { purpose: str(fd, "purpose") });
  }
}

export async function reviewParticipantAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const v = await requireViewer("moderation.review");
  const id = str(fd, "id");
  const decision = str(fd, "decision") as "verified" | "rejected" | "revoked";
  if (!uuid.safeParse(id).success || !["verified", "rejected", "revoked"].includes(decision)) return bad;
  try {
    await reviewParticipant(v, id, decision, str(fd, "note"));
    return { status: "success", message: decision === "verified" ? "Verified." : decision === "rejected" ? "Rejected." : "Verification revoked; their posts are hidden." };
  } catch (e) {
    return fail(e, { note: str(fd, "note") });
  }
}

// ---------------------------------------------------------------- owner: safeguarding

export async function attestTrainingAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const v = await requireViewer("moderation.review");
  const on = new Date(`${str(fd, "trainedOn")}T00:00:00Z`);
  if (Number.isNaN(on.getTime())) return { status: "error", message: "Enter the training date.", fields: { trainedOn: "Enter the training date." } };
  try {
    await attestTraining(v, on, str(fd, "training"));
    return { status: "success", message: "Training recorded. Reload to open safeguarding." };
  } catch (e) {
    return fail(e, { training: str(fd, "training"), trainedOn: str(fd, "trainedOn") });
  }
}

export async function decideCaseAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const v = await requireViewer("moderation.review");
  const id = str(fd, "id");
  const action = str(fd, "action") as CaseAction;
  if (!uuid.safeParse(id).success || !["assess", "report_required", "no_report_required", "reported", "close", "note"].includes(action)) return bad;
  try {
    const status = await decideCase(v, id, action, { reason: str(fd, "reason"), externalRef: str(fd, "externalRef"), attestManual: str(fd, "attestManual") === "on" }, await requestMeta());
    return { status: "success", message: action === "note" ? "Note added." : `Case is now ${status.replace(/_/g, " ")}.`, data: { status } };
  } catch (e) {
    return fail(e, { reason: str(fd, "reason"), externalRef: str(fd, "externalRef") });
  }
}

export async function draftAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const v = await requireViewer("moderation.review");
  const id = str(fd, "id");
  if (!uuid.safeParse(id).success) return bad;
  try {
    const d = await cyberTiplineDraft(v, id);
    return { status: "success", message: "Draft prepared. Nothing was sent.", data: { json: JSON.stringify(d, null, 2) } };
  } catch (e) {
    return fail(e);
  }
}

export async function releaseHoldAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const v = await requireViewer("moderation.review");
  const id = str(fd, "id");
  if (!uuid.safeParse(id).success) return bad;
  try {
    await releaseHold(v, id, str(fd, "reason"));
    return { status: "success", message: "Hold released. Nothing was deleted." };
  } catch (e) {
    return fail(e, { reason: str(fd, "reason") });
  }
}

// ---------------------------------------------------------------- creator: participants

async function creator() {
  const v = await requireViewer("club.discover");
  if (v.role !== "creator") return null;
  return v;
}

export async function addParticipantAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const v = await creator();
  if (!v) return bad;
  // Identity values are never echoed back to the form.
  const values = { label: str(fd, "label"), documentType: str(fd, "documentType"), documentCountry: str(fd, "documentCountry") };
  try {
    await addParticipant(v, {
      label: values.label,
      legalName: str(fd, "legalName"),
      dateOfBirth: str(fd, "dateOfBirth"),
      documentType: values.documentType as DocType,
      documentCountry: values.documentCountry,
    });
    revalidatePath("/studio/participants");
    return { status: "success", message: "Added. The house will verify their identity and age before they can appear in a post." };
  } catch (e) {
    return fail(e, values);
  }
}

export async function addConsentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const v = await creator();
  const id = str(fd, "participantId");
  if (!v || !uuid.safeParse(id).success) return bad;
  try {
    await addConsent(v, id, { scope: str(fd, "scope"), signedOn: str(fd, "signedOn"), signature: str(fd, "signature") });
    revalidatePath("/studio/participants");
    return { status: "success", message: "Consent recorded." };
  } catch (e) {
    return fail(e, { scope: str(fd, "scope"), signedOn: str(fd, "signedOn") });
  }
}

export async function withdrawConsentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const v = await requireViewer();
  const id = str(fd, "consentId");
  if (!uuid.safeParse(id).success) return bad;
  try {
    const n = await withdrawConsent(v, id, str(fd, "reason"));
    return { status: "success", message: n ? `Consent withdrawn. ${n} ${n === 1 ? "post was" : "posts were"} hidden.` : "Consent withdrawn." };
  } catch (e) {
    return fail(e);
  }
}

export async function postParticipantsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const v = await creator();
  const postId = str(fd, "postId");
  if (!v || !uuid.safeParse(postId).success) return bad;
  // Each checked box carries "participantId:consentId".
  const links = fd.getAll("link").filter((x): x is string => typeof x === "string").map((x) => {
    const [participantId, consentId] = x.split(":");
    return { participantId, consentId };
  });
  if (links.some((l) => !uuid.safeParse(l.participantId).success || !uuid.safeParse(l.consentId).success)) return bad;
  try {
    await setPostParticipants(v, postId, links);
    return { status: "success", message: links.length ? "Saved. The post now waits for house review." : "Saved. No one else is named in this post." };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- notices and appeals

export async function fileAppealAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const v = await requireViewer("club.discover");
  const id = str(fd, "noticeId");
  if (!uuid.safeParse(id).success) return bad;
  try {
    await fileAppeal(v, id, str(fd, "body"));
    return { status: "success", message: "Appeal sent. A person will review it and you'll see the outcome here." };
  } catch (e) {
    return fail(e, { body: str(fd, "body") });
  }
}

export async function decideAppealAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const v = await requireViewer("moderation.review");
  const id = str(fd, "id");
  const outcome = str(fd, "outcome");
  if (!uuid.safeParse(id).success || (outcome !== "uphold" && outcome !== "overturn")) return bad;
  try {
    await decideAppeal(v, id, outcome, str(fd, "note"), await requestMeta());
    return { status: "success", message: outcome === "overturn" ? "Overturned. The restriction was reversed where possible." : "Upheld. The creator sees your note." };
  } catch (e) {
    return fail(e, { note: str(fd, "note") });
  }
}
