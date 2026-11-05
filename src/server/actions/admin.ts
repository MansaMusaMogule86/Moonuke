"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { deliverPending } from "@/server/email/outbox";
import type { FormState } from "@/lib/forms";
import { requestMeta, requireViewer } from "@/server/auth/request";
import { appUrl } from "@/server/env";
import { isAppError } from "@/server/errors";
import * as admin from "@/server/services/admin";
import { hit, LIMITS } from "@/server/services/rateLimit";
import { createInvitationSchema, decisionSchema, fieldErrors } from "@/server/validation";

const str = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");

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
  const sendEmail = fd.get("sendEmail") === "on";
  if (sendEmail && !parsed.data.email) return { status: "error", message: "Add an email address to send the invitation by email.", fields: { email: "Required to email the invitation." } };
  const meta = await requestMeta();
  try {
    await hit(`invite:create:${viewer.id}`, LIMITS.invitationCreate);
    const inv = await admin.createInvitation(viewer, { ...parsed.data, sendEmail }, meta);
    if (inv.emailed) after(() => deliverPending().catch(() => {}));
    revalidatePath("/admin/invitations");
    return {
      status: "success",
      message: inv.emailed
        ? "Invitation created and queued for email. The link is also shown below once, for manual delivery."
        : "Invitation created. Copy the link now — it won't be shown again.",
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
    const r = await admin.decideApplication(viewer, parsed.data.id, decision, parsed.data.note, await requestMeta());
    if (r.emailed) after(() => deliverPending().catch(() => {}));
    // No revalidate: the decided row stays visible with its confirmation until the next visit.
    return {
      status: "success",
      message: decision === "approve" ? "Approved. The account is now active." : "Application declined.",
      data: { decided: decision === "approve" ? "approved" : "rejected" },
    };
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
    const issued = await admin.decideReferral(viewer, parsed.data.id, decision, parsed.data.note, await requestMeta(), { sendEmail: fd.get("sendEmail") === "on" });
    if (issued?.emailed) after(() => deliverPending().catch(() => {}));
    // No revalidate: re-rendering would unmount the row and lose the one-time link.
    if (issued) {
      return {
        status: "success",
        message: issued.emailed
          ? "Invitation issued and queued for email — single use, locked to their email, valid 7 days. The link is also shown once below."
          : "Invitation issued — single use, locked to their email, valid 7 days. Copy it now.",
        data: { link: `${appUrl()}/invite/${issued.token}`, expiresAt: issued.expiresAt.toISOString(), decided: "approved" },
      };
    }
    return { status: "success", message: "Request declined.", data: { decided: "declined" } };
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
