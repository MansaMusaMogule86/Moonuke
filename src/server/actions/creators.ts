"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import type { FormState } from "@/lib/forms";
import { requireViewer } from "@/server/auth/request";
import { deliverPending } from "@/server/email/outbox";
import { isAppError } from "@/server/errors";
import { reviewVerification, saveProfile, submitVerification, type ReviewAction } from "@/server/services/creatorOnboarding";
import { fieldErrors, uuid } from "@/server/validation";

const str = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");
const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));
const fail = (e: unknown): FormState => {
  if (isAppError(e)) return { status: "error", message: e.message, fields: e.field ? { [e.field]: e.message } : undefined };
  throw e;
};

const profileSchema = z.object({
  handle: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{2,24}$/, "2–24 lowercase letters, numbers or underscores."),
  displayName: z.string().trim().min(1, "Add your display name.").max(60),
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
    return { status: "success", message: "Profile saved. It stays private until the house verifies you.", values };
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
