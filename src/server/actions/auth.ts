"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { deliverPending } from "@/server/email/outbox";
import { requestPasswordReset, resetPassword } from "@/server/services/recovery";
import type { FormState } from "@/lib/forms";
import { clearSession, requestMeta, setSessionCookie } from "@/server/auth/request";
import { bucketKey } from "@/server/auth/crypto";
import { isAppError } from "@/server/errors";
import { activateProvisionedAccount, redeemInvitation, signIn } from "@/server/services/accounts";
import { confirmEmail } from "@/server/services/emailVerification";
import { recordLoginFailure } from "@/server/security/monitor";
import { hit, hitIp, LIMITS } from "@/server/services/rateLimit";
import { activateSchema, applySchema, fieldErrors, forgotSchema, resetSchema, signinSchema } from "@/server/validation";

const str = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");

export async function signInAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = { email: str(fd, "email") };
  const parsed = signinSchema.safeParse({ email: str(fd, "email"), password: str(fd, "password") });
  if (!parsed.success) return { status: "error", message: "Enter your email and password.", fields: fieldErrors(parsed.error), values };

  const meta = await requestMeta();
  let status: string;
  let mfa: string;
  let role: string;
  try {
    await hitIp("signin", meta.ipHash, LIMITS.signinIp);
    await hit(`signin:email:${bucketKey("email", parsed.data.email)}`, LIMITS.signinEmail);
    const r = await signIn(parsed.data.email, parsed.data.password, meta);
    await setSessionCookie(r.sessionToken);
    status = r.viewer.status;
    mfa = r.viewer.mfa;
    role = r.viewer.role;
  } catch (e) {
    if (isAppError(e) && e.code === "rate_limited") await recordLoginFailure(parsed.data.email, null, meta.security, "rate_limited");
    if (isAppError(e)) return { status: "error", message: e.message, values };
    throw e;
  }
  if (mfa === "pending") redirect("/signin/verify");
  if (role === "owner" && mfa === "none") redirect("/account/security?setup=required");
  redirect(status === "active" ? "/discover" : "/pending");
}

export async function applyAction(token: string, _prev: FormState, fd: FormData): Promise<FormState> {
  // Echo consent choices so a failed submit doesn't silently untick them (React resets the form). Never echo the password.
  const values = { alias: str(fd, "alias"), email: str(fd, "email"), adult: str(fd, "adult"), terms: str(fd, "terms") };
  const parsed = applySchema.safeParse({
    alias: str(fd, "alias"),
    email: str(fd, "email"),
    password: str(fd, "password"),
    adult: fd.get("adult"),
    terms: fd.get("terms"),
  });
  if (!parsed.success) return { status: "error", message: "Please check the highlighted fields.", fields: fieldErrors(parsed.error), values };

  const meta = await requestMeta();
  try {
    await hitIp("apply", meta.ipHash, LIMITS.applySubmit);
    await hit(`apply:token:${bucketKey("invite", token)}`, LIMITS.applySubmit);
    const r = await redeemInvitation(token, parsed.data, meta);
    await setSessionCookie(r.sessionToken);
  } catch (e) {
    if (isAppError(e)) {
      return { status: "error", message: e.message, fields: e.field ? { [e.field]: e.message } : undefined, values };
    }
    throw e;
  }
  redirect("/pending");
}

/** Confirm an email address from its link. A POST (the page's button), so link scanners can't confirm by prefetching. */
export async function confirmEmailAction(token: string, _prev: FormState): Promise<FormState> {
  const meta = await requestMeta();
  try {
    await hitIp("verify_email", meta.ipHash, LIMITS.verifyEmail);
    const ok = await confirmEmail(token, meta);
    return ok
      ? { status: "success", message: "Thanks, your email address is confirmed." }
      : { status: "error", message: "This confirmation link is no longer valid." };
  } catch (e) {
    if (isAppError(e)) return { status: "error", message: e.message };
    throw e;
  }
}

/** Activate a provisioned creator account. Never echoes passwords; same limits as applications. */
export async function activateAction(token: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const values = { adult: str(fd, "adult"), terms: str(fd, "terms") };
  const parsed = activateSchema.safeParse({
    temporaryPassword: str(fd, "temporaryPassword"),
    password: str(fd, "password"),
    confirm: str(fd, "confirm"),
    adult: fd.get("adult"),
    terms: fd.get("terms"),
  });
  if (!parsed.success) return { status: "error", message: "Please check the highlighted fields.", fields: fieldErrors(parsed.error), values };
  const meta = await requestMeta();
  try {
    await hitIp("activate", meta.ipHash, LIMITS.applySubmit);
    await hit(`activate:token:${bucketKey("invite", token)}`, LIMITS.applySubmit);
    await activateProvisionedAccount(token, { temporaryPassword: parsed.data.temporaryPassword, password: parsed.data.password }, meta);
  } catch (e) {
    if (isAppError(e)) return { status: "error", message: e.code === "invalid_invitation" ? "That didn't work. Check the temporary password, or ask for a new link." : e.message, fields: e.field ? { [e.field]: e.message } : undefined, values };
    throw e;
  }
  redirect("/signin?activated=1");
}

export async function signOutAction() {
  await clearSession();
  redirect("/");
}

// ---------------------------------------------------------------- password recovery

export async function forgotPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = forgotSchema.safeParse({ email: str(fd, "email") });
  if (!parsed.success) return { status: "error", message: "Enter a valid email address.", fields: fieldErrors(parsed.error) };
  const meta = await requestMeta();
  try {
    await hitIp("forgot", meta.ipHash, LIMITS.forgotIp);
    await hit(`forgot:email:${bucketKey("email", parsed.data.email)}`, LIMITS.forgotEmail);
    await requestPasswordReset(parsed.data.email, meta);
    after(() => deliverPending().catch(() => {}));
  } catch (e) {
    if (isAppError(e)) return { status: "error", message: e.message };
    throw e;
  }
  // Identical response whether or not the account exists.
  return { status: "success", message: "If an account uses that address, a reset link is on its way. It expires in 30 minutes." };
}

export async function resetPasswordAction(token: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse({ password: str(fd, "password"), confirm: str(fd, "confirm") });
  if (!parsed.success) return { status: "error", message: "Please check the highlighted fields.", fields: fieldErrors(parsed.error) };
  const meta = await requestMeta();
  try {
    await hitIp("reset", meta.ipHash, LIMITS.resetSubmit);
    await hit(`reset:token:${bucketKey("reset", token)}`, LIMITS.resetSubmit);
    await resetPassword(token, parsed.data.password, meta);
    after(() => deliverPending().catch(() => {}));
  } catch (e) {
    if (isAppError(e)) return { status: "error", message: e.message };
    throw e;
  }
  redirect("/signin?reset=1");
}
