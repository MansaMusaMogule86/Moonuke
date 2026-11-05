"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/lib/forms";
import { requestMeta, requireViewer } from "@/server/auth/request";
import { isAppError } from "@/server/errors";
import { quote, setFollow, type Quote } from "@/server/services/club";
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

const quoteInput = z.object({ kind: z.enum(["tier", "post"]), id: uuid });

/** The client sends only an id. Price and availability are resolved here. */
export async function quoteAction(input: { kind: "tier" | "post"; id: string }): Promise<{ ok: true; quote: Quote } | { ok: false; message: string }> {
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
