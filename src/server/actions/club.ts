"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/lib/forms";
import { requestMeta, requireViewer } from "@/server/auth/request";
import { isAppError } from "@/server/errors";
import { quote, setFollow, type Quote } from "@/server/services/club";
import { processSandboxCheckout, type CheckoutOutcome, type CheckoutResult } from "@/server/services/checkout";
import { hit, LIMITS } from "@/server/services/rateLimit";
import { requestReferral } from "@/server/services/referrals";
import { fieldErrors, referralSchema, uuid } from "@/server/validation";

const str = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");

export async function followAction(creatorId: string, follow: boolean, handle: string): Promise<{ ok: boolean; message?: string }> {
  const viewer = await requireViewer("club.follow");
  if (!uuid.safeParse(creatorId).success || !/^[a-z0-9_]{2,24}$/i.test(handle)) return { ok: false, message: "Invalid request." };
  try {
    await setFollow(viewer, creatorId, follow);
    revalidatePath(`/c/${handle}`);
    return { ok: true };
  } catch (e) {
    if (isAppError(e)) return { ok: false, message: e.message };
    throw e;
  }
}

const quoteInput = z.object({ kind: z.enum(["tier", "post", "message"]), id: uuid });

/** The client sends only an id. Price and availability are resolved here. */
export async function quoteAction(input: { kind: "tier" | "post" | "message"; id: string }): Promise<{ ok: true; quote: Quote } | { ok: false; message: string }> {
  const viewer = await requireViewer("club.discover");
  const parsed = quoteInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  try {
    return { ok: true, quote: await quote(viewer, parsed.data) };
  } catch (e) {
    if (isAppError(e)) return { ok: false, message: e.message };
    throw e;
  }
}

const checkoutInput = z.object({
  kind: z.enum(["tier", "post", "message"]),
  id: uuid,
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_:-]{8,120}$/),
  outcome: z.enum(["succeeded", "failed", "canceled"]).optional(),
});

export async function completeCheckoutAction(input: {
  kind: "tier" | "post" | "message";
  id: string;
  idempotencyKey: string;
  outcome?: CheckoutOutcome;
}): Promise<{ ok: true; result: CheckoutResult } | { ok: false; message: string }> {
  const viewer = await requireViewer("club.discover");
  const parsed = checkoutInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid checkout request." };
  try {
    const result = await processSandboxCheckout(viewer, {
      kind: parsed.data.kind,
      targetId: parsed.data.id,
      idempotencyKey: parsed.data.idempotencyKey,
      outcome: parsed.data.outcome,
    });
    revalidatePath("/home");
    revalidatePath("/library");
    revalidatePath("/library/memberships");
    revalidatePath("/library/purchases");
    revalidatePath("/library/vault");
    revalidatePath("/messages");
    if (result.creatorHandle) revalidatePath(`/c/${result.creatorHandle}`);
    return { ok: true, result };
  } catch (e) {
    if (isAppError(e)) return { ok: false, message: e.message };
    throw e;
  }
}

export async function referralAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("referrals.request");
  const values = { inviteeName: str(fd, "inviteeName"), inviteeEmail: str(fd, "inviteeEmail"), role: str(fd, "role"), relationship: str(fd, "relationship") };
  const parsed = referralSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: "Please check the highlighted fields.", fields: fieldErrors(parsed.error), values };
  try {
    await hit(`referral:${viewer.id}`, LIMITS.referralRequest);
    await requestReferral(viewer, parsed.data, await requestMeta());
    revalidatePath("/refer");
    return { status: "success", message: "Request sent to the house. You'll see its status below." };
  } catch (e) {
    if (isAppError(e)) return { status: "error", message: e.message, fields: e.field ? { [e.field]: e.message } : undefined, values };
    throw e;
  }
}
