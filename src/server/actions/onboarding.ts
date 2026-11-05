"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import type { FormState } from "@/lib/forms";
import { requestMeta, requireViewer } from "@/server/auth/request";
import { appUrl } from "@/server/env";
import { deliverPending } from "@/server/email/outbox";
import { isAppError } from "@/server/errors";
import * as ob from "@/server/services/onboarding";
import { hit, LIMITS } from "@/server/services/rateLimit";
import { email, fieldErrors, uuid } from "@/server/validation";

const str = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string).trim() : "");
const fail = (e: unknown, values?: Record<string, string>): FormState => {
  if (isAppError(e)) return { status: "error", message: e.message, fields: e.field ? { [e.field]: e.message } : undefined, values };
  throw e;
};
const PROFILE_KEYS = ["handle", "displayName", "discipline", "category", "city", "tagline", "bio", "visibility"] as const;
const pickFields = (fd: FormData) => Object.fromEntries(PROFILE_KEYS.map((k) => [k, str(fd, k)]).filter(([, v]) => v)) as ob.ProposalFields;

// ---------------------------------------------------------------- owner

const caseSchema = z.object({ name: z.string().min(1, "Add their name.").max(80), email, note: z.string().max(4000).optional() });

export async function openCaseAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const owner = await requireViewer("creators.verify");
  const values = { name: str(fd, "name"), email: str(fd, "email"), note: str(fd, "note") };
  const parsed = caseSchema.safeParse({ ...values, note: values.note || undefined });
  if (!parsed.success) return { status: "error", message: "Please check the highlighted fields.", fields: fieldErrors(parsed.error), values };
  try {
    await hit(`invite:create:${owner.id}`, LIMITS.invitationCreate);
    const r = await ob.openWhiteGloveCase(owner, { ...parsed.data, sendEmail: fd.get("sendEmail") === "on" }, await requestMeta());
    if (r.emailed) after(() => deliverPending().catch(() => {}));
    return {
      status: "success",
      message: r.emailed ? "Case opened and the invitation was queued for email. The link is also shown once below." : "Case opened. Copy the invitation link now — it won't be shown again.",
      data: { link: `${appUrl()}/invite/${r.token}`, expiresAt: r.expiresAt.toISOString(), caseId: r.caseId },
    };
  } catch (e) {
    return fail(e, values);
  }
}

export async function updateCaseAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const owner = await requireViewer("creators.verify");
  const caseId = str(fd, "caseId");
  if (!uuid.safeParse(caseId).success) return { status: "error", message: "Invalid request." };
  const when = str(fd, "welcomeCallAt");
  const intent = str(fd, "intent");
  try {
    await ob.updateCase(owner, caseId, {
      notes: fd.has("notes") ? str(fd, "notes").slice(0, 4000) : undefined,
      welcomeCallAt: fd.has("welcomeCallAt") ? (when ? new Date(when) : null) : undefined,
      welcomeCallDone: intent === "callDone" ? true : intent === "callUndo" ? false : undefined,
      status: intent === "complete" ? "completed" : intent === "withdraw" ? "withdrawn" : undefined,
    });
    revalidatePath("/admin/onboarding");
    return { status: "success", message: intent === "callDone" ? "Welcome call marked done." : intent === "withdraw" ? "Case withdrawn." : "Saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function proposeAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const owner = await requireViewer("creators.verify");
  const userId = str(fd, "userId");
  if (!uuid.safeParse(userId).success) return { status: "error", message: "Invalid request." };
  try {
    await ob.proposeProfile(owner, userId, pickFields(fd), { message: str(fd, "message") || undefined, aiAssisted: fd.get("aiAssisted") === "true" });
    return { status: "success", message: "Sent to the creator for approval. Nothing changes until they accept." };
  } catch (e) {
    return fail(e);
  }
}

export async function reviewSocialAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const owner = await requireViewer("creators.verify");
  const id = str(fd, "id");
  const verdict = str(fd, "verdict");
  if (!uuid.safeParse(id).success || !["verified", "failed", "revoked"].includes(verdict)) return { status: "error", message: "Invalid request." };
  try {
    await ob.reviewSocial(owner, id, verdict as "verified" | "failed" | "revoked", str(fd, "note") || undefined);
    return { status: "success", message: verdict === "verified" ? "Marked verified." : verdict === "failed" ? "Marked not verified." : "Revoked.", data: { status: verdict } };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- shared: assistant

const assistSchema = z.object({
  targetUserId: uuid,
  displayName: z.string().min(1, "Add a display name.").max(60),
  discipline: z.string().min(1, "Add a discipline.").max(60),
  city: z.string().max(60).optional(),
  keywords: z.string().max(400).optional(),
  offering: z.string().max(300).optional(),
  tone: z.enum(["refined", "warm", "playful", "minimal"]),
});

/** Returns suggestions only — nothing is saved until a person chooses to use them. */
export async function assistAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("club.discover");
  const raw = { targetUserId: str(fd, "targetUserId"), displayName: str(fd, "displayName"), discipline: str(fd, "discipline"), city: str(fd, "city") || undefined, keywords: str(fd, "keywords") || undefined, offering: str(fd, "offering") || undefined, tone: str(fd, "tone") || "refined" };
  const parsed = assistSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", message: "Add a display name and discipline first.", fields: fieldErrors(parsed.error) };
  try {
    await hit(`assist:${viewer.id}`, LIMITS.aiAssist);
    const r = await ob.assistDraft(
      viewer,
      parsed.data.targetUserId,
      { ...parsed.data, keywords: (parsed.data.keywords ?? "").split(",").map((k) => k.trim()).filter(Boolean) },
      fd.get("consent") === "on",
    );
    return { status: "success", data: { result: JSON.stringify({ taglines: r.taglines, bio: r.bio, provider: r.provider }) } };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- shared: profile import

const IMPORT_FILE_MAX = 64 * 1024;
const IMPORT_TYPES = ["", "text/plain", "application/json", "text/markdown", "text/csv"];

/**
 * Owner (for a creator) or creator (for themselves) imports profile details
 * from pasted text or a small .txt/.json export. Always files a proposal.
 */
export async function importProfileAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("club.discover");
  const targetUserId = str(fd, "targetUserId");
  if (!uuid.safeParse(targetUserId).success) return { status: "error", message: "Invalid request." };
  let text = typeof fd.get("text") === "string" ? (fd.get("text") as string) : "";
  const file = fd.get("file");
  if (file && typeof file !== "string" && file.size > 0) {
    if (file.size > IMPORT_FILE_MAX) return { status: "error", message: "That file is too large (64 KB max).", fields: { file: "64 KB max." } };
    if (!IMPORT_TYPES.includes(file.type) || !/\.(txt|json|md|csv)$/i.test(file.name)) {
      return { status: "error", message: "Choose a .txt or .json file.", fields: { file: "Choose a .txt or .json file." } };
    }
    if (text.trim()) return { status: "error", message: "Use either pasted text or a file, not both.", fields: { text: "Use either pasted text or a file." } };
    text = await file.text();
  }
  try {
    await hit(`import:${viewer.id}`, LIMITS.profileImport);
    const r = await ob.importProfile(viewer, targetUserId, text);
    // No revalidate here: the form keeps its confirmation until "Done".
    return {
      status: "success",
      message: viewer.role === "owner" ? "Import sent to the creator as a proposal. Nothing changes until they accept." : "Import ready below as a proposal. Review it, then accept or decline.",
      data: { fields: r.fields.join(","), links: String(r.links), warnings: r.warnings.join("\n") },
    };
  } catch (e) {
    // Echo pasted text back (not secret) so a fix doesn't mean re-pasting.
    return fail(e, { text: text.slice(0, 20_000) });
  }
}

// ---------------------------------------------------------------- creator

export async function decideProposalAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const creator = await requireViewer("club.discover");
  const id = str(fd, "id");
  const accept = str(fd, "decision") === "accept";
  if (!uuid.safeParse(id).success) return { status: "error", message: "Invalid request." };
  try {
    await ob.decideProposal(creator, id, accept);
    // No revalidate: the card keeps its confirmation until the creator refreshes (avoids unmount-on-revalidate).
    return { status: "success", message: accept ? "Accepted — your profile draft was updated." : "Declined. Your profile is unchanged.", data: { decided: accept ? "accepted" : "declined" } };
  } catch (e) {
    return fail(e);
  }
}

export async function addSocialAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const creator = await requireViewer("club.discover");
  const values = { platform: str(fd, "platform"), handle: str(fd, "handle"), url: str(fd, "url") };
  try {
    await ob.addSocial(creator, { platform: values.platform as ob.Platform, handle: values.handle, url: values.url || undefined });
    revalidatePath("/studio");
    return { status: "success", message: "Added. Put your code in that profile's bio, then the house will confirm it's yours." };
  } catch (e) {
    return fail(e, values);
  }
}

export async function socialSettingAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const creator = await requireViewer("club.discover");
  const id = str(fd, "id");
  if (!uuid.safeParse(id).success) return { status: "error", message: "Invalid request." };
  try {
    if (str(fd, "intent") === "remove") await ob.removeSocial(creator, id);
    else await ob.setSocialVisibility(creator, id, str(fd, "show") === "true");
    revalidatePath("/studio");
    return { status: "success", message: "Updated." };
  } catch (e) {
    return fail(e);
  }
}
