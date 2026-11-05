"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/lib/forms";
import { clearSession, requestMeta, setSessionCookie } from "@/server/auth/request";
import { isAppError } from "@/server/errors";
import { redeemInvitation, signIn } from "@/server/services/accounts";
import { hit, LIMITS } from "@/server/services/rateLimit";
import { applySchema, fieldErrors, signinSchema } from "@/server/validation";

const str = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");

export async function signInAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = { email: str(fd, "email") };
  const parsed = signinSchema.safeParse({ email: str(fd, "email"), password: str(fd, "password") });
  if (!parsed.success) return { status: "error", message: "Enter your email and password.", fields: fieldErrors(parsed.error), values };

  const meta = await requestMeta();
  let status: string;
  try {
    await hit(`signin:ip:${meta.ipHash ?? "unknown"}`, LIMITS.signinIp);
    await hit(`signin:email:${parsed.data.email}`, LIMITS.signinEmail);
    const r = await signIn(parsed.data.email, parsed.data.password, meta);
    await setSessionCookie(r.sessionToken);
    status = r.viewer.status;
  } catch (e) {
    if (isAppError(e)) return { status: "error", message: e.message, values };
    throw e;
  }
  redirect(status === "active" ? "/discover" : "/pending");
}

export async function applyAction(token: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const values = { alias: str(fd, "alias"), email: str(fd, "email") };
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
    await hit(`apply:ip:${meta.ipHash ?? "unknown"}`, LIMITS.applySubmit);
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

export async function signOutAction() {
  await clearSession();
  redirect("/");
}
