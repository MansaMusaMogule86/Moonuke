"use server";

import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import type { FormState } from "@/lib/forms";
import { requireViewer } from "@/server/auth/request";
import { ageProvider, signMockResult } from "@/server/compliance/ageProvider";
import { env, isProd } from "@/server/env";
import { isAppError } from "@/server/errors";
import { uuid } from "@/server/validation";
import { completeAgeCheck, removeRule, setAgeScope, setRule, startAgeCheck } from "@/server/services/access";

const str = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");
const fail = (e: unknown, values?: Record<string, string>): FormState => {
  if (isAppError(e)) return { status: "error", message: e.message, fields: e.field ? { [e.field]: e.message } : undefined, values };
  throw e;
};

export async function startAgeCheckAction(_prev: FormState, _fd: FormData): Promise<FormState> {
  const v = await requireViewer();
  const p = ageProvider();
  if (!p) return { status: "error", message: "Age checks aren't active yet." };
  let path: string;
  try {
    path = (await startAgeCheck(v, p)).path;
  } catch (e) {
    return fail(e);
  }
  redirect(path);
}

/** Local tests only: plays the vendor and posts a signed result through the same verification path. */
export async function mockAgeResultAction(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireViewer();
  if (isProd() || env().AGE_PROVIDER !== "mock") return { status: "error", message: "Not available." };
  const p = ageProvider()!;
  const check = str(fd, "check");
  const result = str(fd, "result") === "passed" ? "passed" : "failed";
  if (!uuid.safeParse(check).success) return { status: "error", message: "Invalid request." };
  try {
    const signed = signMockResult({ checkId: check, providerRef: randomUUID(), result, method: "mock", assurance: "high" });
    await completeAgeCheck(p, signed.body, signed.signature);
  } catch (e) {
    return fail(e);
  }
  redirect("/verify-age");
}

export async function setRuleAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const v = await requireViewer("moderation.review");
  const values = { country: str(fd, "country"), rule: str(fd, "rule"), note: str(fd, "note") };
  try {
    await setRule(v, values.country, values.rule as "block" | "age_assurance", values.note);
    return { status: "success", message: `Rule saved for ${values.country.toUpperCase()}. It has no effect until regional rules are approved and switched on.` };
  } catch (e) {
    return fail(e, values);
  }
}

export async function removeRuleAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const v = await requireViewer("moderation.review");
  const c = str(fd, "country");
  if (!/^[A-Za-z]{2}$/.test(c)) return { status: "error", message: "Invalid request." };
  await removeRule(v, c);
  return { status: "success", message: `Rule for ${c.toUpperCase()} removed.` };
}

export async function ageScopeAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const v = await requireViewer("moderation.review");
  const scope = str(fd, "scope");
  if (scope !== "listed" && scope !== "everywhere") return { status: "error", message: "Invalid request." };
  await setAgeScope(v, scope);
  return { status: "success", message: scope === "everywhere" ? "When switched on, everyone will need an age check." : "When switched on, only listed countries will need an age check.", data: { scope } };
}
