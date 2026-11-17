"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import type { FormState } from "@/lib/forms";
import { requireViewer } from "@/server/auth/request";
import { deliverPending } from "@/server/email/outbox";
import { isAppError } from "@/server/errors";
import { isProd } from "@/server/env";
import { reviewVerification, saveProfile, submitVerification, updateCreatorName, type ReviewAction } from "@/server/services/creatorOnboarding";
import { confirmCreatorReferralOnboarding, resolveRecruitmentCode } from "@/server/services/creatorReferralsAndWithdrawals";
import { RECRUIT_COOKIE, RECRUIT_COOKIE_MAX_AGE } from "@/server/auth/request";
import { creatorChosenName, creatorNameSchema, fieldErrors, uuid } from "@/server/validation";

const str = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");
const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));
const fail = (e: unknown): FormState => {
  if (isAppError(e)) return { status: "error", message: e.message, fields: e.field ? { [e.field]: e.message } : undefined };
  throw e;
};

const profileSchema = z.object({
  handle: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{2,24}$/, "2–24 lowercase letters, numbers or underscores."),
  displayName: creatorChosenName,
  discipline: z.string().trim().min(1, "What do you do?").max(60),
  category: z.string().regex(/^[a-z-]{2,32}$/, "Choose a category."),
  city: opt(60),
  tagline: opt(160),
  bio: opt(2000),
  visibility: z.enum(["listed", "discreet", "private"]),
});

export async function saveProfileAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("club.discover");
  const values = Object.fromEntries(["handle", "displayName", "discipline", "category", "city", "tagline", "bio", "visibility"].map((k) => [k, str(fd, k)]));
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: "Please check the highlighted fields.", fields: fieldErrors(parsed.error), values };
  try {
    await saveProfile(viewer, parsed.data);
    revalidatePath("/studio");
    revalidatePath("/studio/settings");
    revalidatePath("/discover");
    revalidatePath(`/c/${parsed.data.handle}`);
    return {
      status: "success",
      message: `Profile saved as Diva ${parsed.data.displayName}.`,
      values: { ...values, displayName: parsed.data.displayName },
    };
  } catch (e) {
    return { ...fail(e), values };
  }
}

export async function updateCreatorNameAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("club.discover");
  const rawName = str(fd, "creatorName");
  const targetUserId = str(fd, "targetUserId") || viewer.id;
  const values = { creatorName: rawName };
  const parsed = creatorNameSchema.safeParse({ creatorName: rawName });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please check your creator name.",
      fields: fieldErrors(parsed.error),
      values,
    };
  }
  try {
    const res = await updateCreatorName(viewer, targetUserId, parsed.data.creatorName);
    revalidatePath("/studio");
    revalidatePath("/studio/settings");
    revalidatePath("/discover");
    revalidatePath(`/c/${res.handle}`);
    return {
      status: "success",
      message: `Creator name updated to ${res.displayName}.`,
      values: { creatorName: res.creatorName },
      data: { creatorName: res.creatorName, displayName: res.displayName },
    };
  } catch (e) {
    return { ...fail(e), values };
  }
}

const attest = z.object({
  age: z.literal("on", { message: "Required." }),
  identity: z.literal("on", { message: "Required." }),
  consent: z.literal("on", { message: "Required." }),
  terms: z.literal("on", { message: "Required." }),
});

export async function submitVerificationAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("club.discover");
  const parsed = attest.safeParse({ age: fd.get("age"), identity: fd.get("identity"), consent: fd.get("consent"), terms: fd.get("terms") });
  if (!parsed.success) return { status: "error", message: "Every statement must be confirmed to submit.", fields: fieldErrors(parsed.error) };
  try {
    await submitVerification(viewer);
    after(() => deliverPending().catch(() => {}));
    return { status: "success", message: "Submitted. The house will review and may contact you to complete identity checks." };
  } catch (e) {
    return fail(e);
  }
}

export async function reviewVerificationAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("creators.verify");
  const userId = str(fd, "userId");
  const action = str(fd, "action") as ReviewAction;
  if (!uuid.safeParse(userId).success || !["in_review", "needs_more_info", "reject", "verify", "unpublish"].includes(action)) {
    return { status: "error", message: "Invalid request." };
  }
  const note = str(fd, "note").trim().slice(0, 1000) || undefined;
  try {
    const r = await reviewVerification(viewer, userId, action, {
      checks: { identity: fd.get("identity") === "on", age: fd.get("age") === "on", consent_records: fd.get("consent_records") === "on" },
      note,
    });
    if (action === "verify") after(() => deliverPending().catch(() => {}));
    const label = { in_review: "Marked in review.", needs_more_info: "Asked for more information.", reject: "Verification rejected.", verify: "Verified and published.", unpublish: "Profile unpublished." }[action];
    return { status: "success", message: label, data: { status: r.status, published: String(r.published) } };
  } catch (e) {
    return fail(e);
  }
}

function codeFromForm(fd: FormData): string | null {
  const raw = typeof fd.get("recruitCode") === "string" ? (fd.get("recruitCode") as string) : "";
  const clean = raw.trim().toLowerCase();
  return /^[a-z0-9_-]{4,32}$/.test(clean) ? clean : null;
}

/**
 * Remembers a creator recruitment code from the public /recruit/[code] page.
 * Validates the code is live before storing it; never reveals which existing
 * account it belongs to beyond the public landing page itself.
 */
export async function rememberRecruitmentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const code = codeFromForm(fd);
  if (!code) return { status: "error", message: "That recruitment link is invalid." };
  const resolved = await resolveRecruitmentCode(code);
  if (!resolved) return { status: "error", message: "That recruitment link is invalid or no longer active." };
  (await cookies()).set(RECRUIT_COOKIE, resolved.recruitmentCode, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    maxAge: RECRUIT_COOKIE_MAX_AGE,
  });
  return { status: "success", message: "Referral remembered. It will be attached when you apply." };
}

/**
 * Confirms the signed-in creator's own referral attribution (single level,
 * terms accepted explicitly). Never touches another creator's attribution.
 */
export async function confirmReferralAttributionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("club.discover");
  if (viewer.role !== "creator") return { status: "error", message: "Creator account required." };
  if (fd.get("acceptTerms") !== "on") {
    return { status: "error", message: "Accept the referral terms to confirm attribution.", fields: { acceptTerms: "Required." } };
  }
  try {
    const row = await confirmCreatorReferralOnboarding(viewer, { acceptReferralTerms: true });
    if (!row) return { status: "error", message: "No referral attribution to confirm." };
    revalidatePath("/studio/referrals");
    return { status: "success", message: "Referral attribution confirmed." };
  } catch (e) {
    return fail(e);
  }
}
