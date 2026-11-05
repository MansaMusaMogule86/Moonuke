"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/forms";
import { requestMeta, requireViewer } from "@/server/auth/request";
import { isAppError } from "@/server/errors";
import * as admin from "@/server/services/admin";
import { hit, LIMITS } from "@/server/services/rateLimit";
import { createInvitationSchema, decisionSchema, fieldErrors } from "@/server/validation";

const str = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");
const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

function fail(e: unknown): FormState {
  if (isAppError(e)) return { status: "error", message: e.message };
  throw e;
}

/** Every action re-checks the session + permission server-side (never trusts the UI). */
export async function createInvitationAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("invitations.manage");
  const parsed = createInvitationSchema.safeParse({
    role: str(fd, "role"),
    email: str(fd, "email"),
    maxUses: str(fd, "maxUses"),
    expiresInDays: str(fd, "expiresInDays"),
    note: str(fd, "note"),
  });
  if (!parsed.success) return { status: "error", message: "Please check the highlighted fields.", fields: fieldErrors(parsed.error) };
  const meta = await requestMeta();
  try {
    await hit(`invite:create:${viewer.id}`, LIMITS.invitationCreate);
    const inv = await admin.createInvitation(viewer, parsed.data, meta);
    revalidatePath("/admin/invitations");
    return {
      status: "success",
      message: "Invitation created. Copy the link now — it won't be shown again.",
      data: { link: `${appUrl()}/invite/${inv.token}`, expiresAt: inv.expiresAt.toISOString() },
    };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeInvitationAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("invitations.manage");
  const parsed = decisionSchema.safeParse({ id: str(fd, "id") });
  if (!parsed.success) return { status: "error", message: "Invalid request." };
  try {
    await admin.revokeInvitation(viewer, parsed.data.id, await requestMeta());
    revalidatePath("/admin/invitations");
    return { status: "success", message: "Invitation revoked." };
  } catch (e) {
    return fail(e);
  }
}

export async function decideApplicationAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("applications.review");
  const decision = str(fd, "decision");
  const parsed = decisionSchema.safeParse({ id: str(fd, "id"), note: str(fd, "note") });
  if (!parsed.success || (decision !== "approve" && decision !== "reject")) return { status: "error", message: "Invalid request." };
  try {
    await admin.decideApplication(viewer, parsed.data.id, decision, parsed.data.note, await requestMeta());
    // No revalidate: the decided row stays visible with its confirmation until the next visit.
    return { status: "success", message: decision === "approve" ? "Approved. The account is now active." : "Application declined." };
  } catch (e) {
    return fail(e);
  }
}

export async function decideReferralAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("referrals.review");
  const decision = str(fd, "decision");
  const parsed = decisionSchema.safeParse({ id: str(fd, "id"), note: str(fd, "note") });
  if (!parsed.success || (decision !== "approve" && decision !== "decline")) return { status: "error", message: "Invalid request." };
  try {
    const issued = await admin.decideReferral(viewer, parsed.data.id, decision, parsed.data.note, await requestMeta());
    // No revalidate: re-rendering would unmount the row and lose the one-time link.
    if (issued) {
      return {
        status: "success",
        message: "Invitation issued — single use, locked to their email, valid 7 days. Copy it now.",
        data: { link: `${appUrl()}/invite/${issued.token}`, expiresAt: issued.expiresAt.toISOString() },
      };
    }
    return { status: "success", message: "Request declined." };
  } catch (e) {
    return fail(e);
  }
}

export async function setSuspendedAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("accounts.suspend");
  const parsed = decisionSchema.safeParse({ id: str(fd, "id"), note: str(fd, "reason") });
  const suspend = str(fd, "suspend") === "true";
  if (!parsed.success) return { status: "error", message: "Invalid request." };
  try {
    await admin.setSuspended(viewer, parsed.data.id, suspend, parsed.data.note, await requestMeta());
    revalidatePath("/admin/members");
    return { status: "success", message: suspend ? "Account suspended and signed out everywhere." : "Account reactivated." };
  } catch (e) {
    return fail(e);
  }
}
