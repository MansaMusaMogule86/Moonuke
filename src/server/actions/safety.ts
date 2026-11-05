"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import type { FormState } from "@/lib/forms";
import { requestMeta, requireViewer } from "@/server/auth/request";
import { deliverPending } from "@/server/email/outbox";
import { isAppError } from "@/server/errors";
import { hit, LIMITS } from "@/server/services/rateLimit";
import { block, fileReport, moderate, unblock } from "@/server/services/safety";
import { fieldErrors, moderateSchema, reportSchema, uuid } from "@/server/validation";

const str = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");
const fail = (e: unknown): FormState => {
  if (isAppError(e)) return { status: "error", message: e.message, fields: e.field ? { [e.field]: e.message } : undefined };
  throw e;
};

export async function reportAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("club.report");
  const parsed = reportSchema.safeParse({ targetType: str(fd, "targetType"), targetId: str(fd, "targetId"), reason: str(fd, "reason"), details: str(fd, "details") });
  if (!parsed.success) return { status: "error", message: "Choose a reason for your report.", fields: fieldErrors(parsed.error) };
  try {
    await hit(`report:${viewer.id}`, LIMITS.reportFile);
    const r = await fileReport(viewer, parsed.data, await requestMeta());
    if (r.critical) after(() => deliverPending().catch(() => {}));
    return {
      status: "success",
      message: r.critical
        ? "Thank you. This was flagged as urgent and the house has been alerted. Reported posts are hidden while they're reviewed."
        : "Thank you. The house will review your report.",
    };
  } catch (e) {
    return fail(e);
  }
}

/** Block a creator from their profile. The profile becomes invisible to you, so we leave it. */
export async function blockAction(targetUserId: string): Promise<{ ok: false; message: string }> {
  const viewer = await requireViewer("club.discover");
  if (!uuid.safeParse(targetUserId).success) return { ok: false, message: "Invalid request." };
  try {
    await hit(`block:${viewer.id}`, LIMITS.blockToggle);
    await block(viewer, targetUserId);
  } catch (e) {
    if (isAppError(e)) return { ok: false, message: e.message };
    throw e;
  }
  revalidatePath("/discover");
  redirect("/discover?blocked=1");
}

export async function unblockAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("club.discover");
  const id = str(fd, "id");
  if (!uuid.safeParse(id).success) return { status: "error", message: "Invalid request." };
  try {
    await hit(`block:${viewer.id}`, LIMITS.blockToggle);
    await unblock(viewer, id);
    return { status: "success", message: "Unblocked." };
  } catch (e) {
    return fail(e);
  }
}

export async function moderateAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("moderation.review");
  const parsed = moderateSchema.safeParse({ id: str(fd, "id"), action: str(fd, "action"), note: str(fd, "note"), escalationRef: str(fd, "escalationRef") });
  if (!parsed.success) return { status: "error", message: "Invalid request.", fields: fieldErrors(parsed.error) };
  try {
    const r = await moderate(viewer, parsed.data.id, parsed.data.action, { note: parsed.data.note, escalationRef: parsed.data.escalationRef }, await requestMeta());
    const label = { in_review: "Marked in review.", dismiss: "Report dismissed.", hide_post: "Post hidden.", restore_post: "Post restored; report dismissed.", suspend_user: "Account suspended and signed out.", escalate: "Escalation recorded.", resolve: "Resolved." }[parsed.data.action];
    // No revalidate: the card keeps its result visible (avoids the stale/unmount problem).
    return { status: "success", message: label, data: { status: r.status, postHidden: r.postHidden === undefined ? "" : String(r.postHidden) } };
  } catch (e) {
    return fail(e);
  }
}
