"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { deliverPending } from "@/server/email/outbox";
import { requestPasswordReset, resetPassword } from "@/server/services/recovery";
import type { FormState } from "@/lib/forms";
import { clearSession, requestMeta, setSessionCookie, setWorkspaceCookie } from "@/server/auth/request";
import { bucketKey } from "@/server/auth/crypto";
import { isAppError } from "@/server/errors";
import { activateProvisionedAccount, redeemInvitation, signIn } from "@/server/services/accounts";
import { RECRUIT_COOKIE } from "@/server/auth/request";
import { captureCreatorReferralAtSignup, resolveRecruitmentCode } from "@/server/services/creatorReferralsAndWithdrawals";
import { registerFanViaReferral } from "@/server/services/creatorReferral";
import { confirmEmail } from "@/server/services/emailVerification";
import { resolvePostLoginDestination } from "@/server/services/workspace";
import { recordLoginFailure } from "@/server/security/monitor";
import { hit, hitIp, LIMITS } from "@/server/services/rateLimit";
import { activateSchema, applySchema, creatorApplySchema, fieldErrors, forgotSchema, resetSchema, signinSchema } from "@/server/validation";

const str = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");

export async function signInAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = { email: str(fd, "email") };
  const next = str(fd, "next") || null;
  const parsed = signinSchema.safeParse({ email: str(fd, "email"), password: str(fd, "password") });
  if (!parsed.success) return { status: "error", message: "Enter your email and password.", fields: fieldErrors(parsed.error), values };

  const meta = await requestMeta();
  let destination: string;
  try {
    await hitIp("signin", meta.ipHash, LIMITS.signinIp);
    await hit(`signin:email:${bucketKey("email", parsed.data.email)}`, LIMITS.signinEmail);
    const r = await signIn(parsed.data.email, parsed.data.password, meta);
    await setSessionCookie(r.sessionToken);
    await setWorkspaceCookie(r.viewer.role === "creator" ? "studio" : "fan");
    destination = await resolvePostLoginDestination(r.viewer, next);
  } catch (e) {
    if (isAppError(e) && e.code === "rate_limited") await recordLoginFailure(parsed.data.email, null, meta.security, "rate_limited");
    if (isAppError(e)) return { status: "error", message: e.message, values };
    throw e;
  }
  redirect(destination);
}

export async function applyAction(token: string, _prev: FormState, fd: FormData): Promise<FormState> {
  // Echo consent choices so a failed submit doesn't silently untick them (React resets the form). Never echo the password.
  const values = { alias: str(fd, "alias"), email: str(fd, "email"), adult: str(fd, "adult"), terms: str(fd, "terms"), recruitCode: str(fd, "recruitCode") };
  const schema = str(fd, "role") === "creator" ? creatorApplySchema : applySchema;
  const parsed = schema.safeParse({
    alias: str(fd, "alias"),
    email: str(fd, "email"),
    password: str(fd, "password"),
    adult: fd.get("adult"),
    terms: fd.get("terms"),
  });
  if (!parsed.success) return { status: "error", message: "Please check the highlighted fields.", fields: fieldErrors(parsed.error), values };

  const isCreatorApply = str(fd, "role") === "creator";
  const rawCode = (str(fd, "recruitCode") || (await cookies()).get(RECRUIT_COOKIE)?.value || "").trim().toLowerCase();
  const recruitCode = /^[a-z0-9_-]{4,32}$/.test(rawCode) ? rawCode : null;
  // Pre-validate the code before creating the account: an unknown or
  // inactive code is a field error, and applying never depends on it.
  if (isCreatorApply && recruitCode && !(await resolveRecruitmentCode(recruitCode))) {
    return {
      status: "error",
      message: "That creator referral code is invalid or no longer active. Remove it or fix it to continue.",
      fields: { recruitCode: "That creator referral code is invalid or no longer active." },
      values,
    };
  }

  const meta = await requestMeta();
  try {
    await hitIp("apply", meta.ipHash, LIMITS.applySubmit);
    await hit(`apply:token:${bucketKey("invite", token)}`, LIMITS.applySubmit);
    const r = await redeemInvitation(token, parsed.data, meta);
    await setSessionCookie(r.sessionToken);
    // Attribution only: records who referred this creator. It grants no
    // role, no privileges, and no money; approval still decides everything.
    if (isCreatorApply && recruitCode) {
      try {
        await captureCreatorReferralAtSignup({ referredUserId: r.userId, recruitmentCode: recruitCode });
        (await cookies()).delete(RECRUIT_COOKIE);
      } catch (e) {
        // The account is already created; a referral hiccup must not block
        // it. The service guards self-referral, cycles, and duplicates, and
        // the code stays in the form for a correction on review.
        if (!isAppError(e)) throw e;
      }
    }
  } catch (e) {
    if (isAppError(e)) {
      return { status: "error", message: e.message, fields: e.field ? { [e.field]: e.message } : undefined, values };
    }
    throw e;
  }
  redirect("/pending");
}

/** Join as a fan through a creator's link. The handle is validated server-side. */
export async function fanSignupAction(handle: string, _prev: FormState, fd: FormData): Promise<FormState> {
  // Echo consent choices; never echo the password.
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
  let destination = "/discover";
  try {
    await hitIp("apply", meta.ipHash, LIMITS.applySubmit);
    await hit(`signup:creator:${bucketKey("invite", handle)}`, LIMITS.applySubmit);
    const r = await registerFanViaReferral(handle, { alias: parsed.data.alias, email: parsed.data.email, password: parsed.data.password }, meta);
    await setSessionCookie(r.sessionToken);
    destination = `/c/${r.handle}`;
  } catch (e) {
    if (isAppError(e)) return { status: "error", message: e.message, fields: e.field ? { [e.field]: e.message } : undefined, values };
    throw e;
  }
  redirect(destination);
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
