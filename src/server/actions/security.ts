"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import type { FormState } from "@/lib/forms";
import { getViewer, requestMeta, requireViewer } from "@/server/auth/request";
import { deliverPending } from "@/server/email/outbox";
import { isAppError } from "@/server/errors";
import { changePassword, revokeOtherSessions, revokeOwnSession } from "@/server/services/account";
import { confirmEnrollment, disableMfa, regenerateRecoveryCodes, startEnrollment, verifyChallenge } from "@/server/services/mfa";
import { hit, hitIp, LIMITS } from "@/server/services/rateLimit";
import { fieldErrors, password, uuid } from "@/server/validation";

const str = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");
const flush = () => after(() => deliverPending().catch(() => {}));
const fail = (e: unknown): FormState => {
  if (isAppError(e)) return { status: "error", message: e.message, fields: e.field ? { [e.field]: e.message } : undefined };
  throw e;
};
const code = z.string().trim().min(6, "Enter the code.").max(20);

/** Second-factor challenge after password sign-in. Brute force is capped per account and per IP. */
export async function verifyChallengeAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/signin");
  if (viewer.mfa !== "pending") redirect("/discover");
  const parsed = code.safeParse(str(fd, "code"));
  if (!parsed.success) return { status: "error", message: "Enter the 6-digit code or a recovery code.", fields: { code: "Required." } };
  const meta = await requestMeta();
  try {
    await hit(`mfa:user:${viewer.id}`, LIMITS.mfaChallenge);
    await hitIp("mfa", meta.ipHash, LIMITS.mfaChallengeIp);
    await verifyChallenge(viewer, parsed.data, meta);
    flush();
  } catch (e) {
    return fail(e);
  }
  redirect(viewer.status === "active" ? (viewer.role === "owner" ? "/admin" : "/discover") : "/pending");
}

export async function startMfaAction(_prev: FormState): Promise<FormState> {
  const viewer = await requireViewer(undefined, { allowMfaSetup: true });
  try {
    const r = await startEnrollment(viewer);
    return { status: "success", data: { secret: r.secret, qrSvg: r.qrSvg, uri: r.uri } };
  } catch (e) {
    return fail(e);
  }
}

export async function confirmMfaAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer(undefined, { allowMfaSetup: true });
  const parsed = code.safeParse(str(fd, "code"));
  if (!parsed.success) return { status: "error", message: "Enter the 6-digit code from your app.", fields: { code: "Required." } };
  try {
    await hit(`mfa:enrol:${viewer.id}`, LIMITS.mfaChallenge);
    const codes = await confirmEnrollment(viewer, parsed.data);
    flush();
    return { status: "success", message: "Two-step sign-in is on.", data: { codes: codes.join("\n") } };
  } catch (e) {
    return fail(e);
  }
}

export async function disableMfaAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer(undefined, { allowMfaSetup: true });
  try {
    await hit(`mfa:user:${viewer.id}`, LIMITS.mfaChallenge);
    await disableMfa(viewer, str(fd, "code"));
    flush();
    revalidatePath("/account/security");
    return { status: "success", message: "Two-step sign-in is off." };
  } catch (e) {
    return fail(e);
  }
}

export async function regenerateCodesAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer(undefined, { allowMfaSetup: true });
  try {
    await hit(`mfa:user:${viewer.id}`, LIMITS.mfaChallenge);
    const codes = await regenerateRecoveryCodes(viewer, str(fd, "code"));
    return { status: "success", message: "New recovery codes. The old ones no longer work.", data: { codes: codes.join("\n") } };
  } catch (e) {
    return fail(e);
  }
}

const passwordChange = z
  .object({ current: z.string().min(1, "Enter your current password.").max(200), next: password, confirm: z.string() })
  .refine((v) => v.next === v.confirm, { message: "The passwords don't match.", path: ["confirm"] });

export async function changePasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer(undefined, { allowMfaSetup: true });
  const parsed = passwordChange.safeParse({ current: str(fd, "current"), next: str(fd, "next"), confirm: str(fd, "confirm") });
  if (!parsed.success) return { status: "error", message: "Please check the highlighted fields.", fields: fieldErrors(parsed.error) };
  try {
    await hit(`pwchange:${viewer.id}`, LIMITS.passwordChange);
    await changePassword(viewer, parsed.data.current, parsed.data.next);
    flush();
    revalidatePath("/account/security");
    return { status: "success", message: "Password changed. Every other session was signed out." };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeSessionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer(undefined, { allowMfaSetup: true });
  const id = str(fd, "id");
  if (!uuid.safeParse(id).success) return { status: "error", message: "Invalid request." };
  try {
    if (id === viewer.sessionId) return { status: "error", message: "Use Sign out to end this session." };
    await revokeOwnSession(viewer, id);
    revalidatePath("/account/security");
    return { status: "success", message: "Session signed out." };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeOthersAction(_prev: FormState): Promise<FormState> {
  const viewer = await requireViewer(undefined, { allowMfaSetup: true });
  const n = await revokeOtherSessions(viewer);
  flush();
  revalidatePath("/account/security");
  return { status: "success", message: n ? `Signed out ${n} other session${n === 1 ? "" : "s"}.` : "No other sessions." };
}
