"use server";

import { z } from "zod";
import type { FormState } from "@/lib/forms";
import { requireViewer } from "@/server/auth/request";
import { isAppError } from "@/server/errors";
import { hit, LIMITS } from "@/server/services/rateLimit";
import { updateAlert, updateSettings } from "@/server/services/securityMonitor";
import { fieldErrors, uuid } from "@/server/validation";

const str = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");
const fail = (e: unknown): FormState => {
  if (isAppError(e)) return { status: "error", message: e.message };
  throw e;
};

const alertSchema = z.object({
  id: uuid,
  action: z.enum(["acknowledge", "resolve", "note"]),
  note: z.string().trim().max(1000, "Keep notes under 1,000 characters.").optional(),
});

/** Acknowledge, resolve, or annotate an alert. Owner only (AAL2), audited. */
export async function alertAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = alertSchema.safeParse({ id: str(fd, "id"), action: str(fd, "action"), note: str(fd, "note") || undefined });
  if (!parsed.success) return { status: "error", message: "Please check the note.", fields: fieldErrors(parsed.error) };
  const viewer = await requireViewer("security.view");
  try {
    await hit(`security_admin:${viewer.id}`, LIMITS.securityAdmin);
    await updateAlert(viewer, parsed.data);
  } catch (e) {
    return fail(e);
  }
  const done = { acknowledge: "Alert acknowledged.", resolve: "Alert resolved.", note: "Note saved." }[parsed.data.action];
  return { status: "success", message: done };
}

const int = (min: number, max: number) => z.coerce.number().int().min(min, `At least ${min}.`).max(max, `At most ${max}.`);
const settingsSchema = z.object({
  failed_account_threshold: int(2, 100),
  failed_ip_threshold: int(2, 1000),
  stuffing_accounts_threshold: int(2, 1000),
  distributed_threshold: int(10, 100000),
  mfa_failure_threshold: int(2, 100),
  window_minutes: int(1, 1440),
  alert_cooldown_minutes: int(1, 1440),
  max_alert_emails_per_hour: int(1, 500),
  immediate_registration: z.boolean(),
  immediate_creator_application: z.boolean(),
  digest_local_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM."),
});

/** Alert thresholds and notification preferences. Retention is not editable here: it needs approval first. */
export async function settingsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const keys = Object.keys(settingsSchema.shape).filter((k) => !k.startsWith("immediate_"));
  const values = Object.fromEntries(keys.map((k) => [k, str(fd, k)]));
  const parsed = settingsSchema.safeParse({
    ...values,
    immediate_registration: fd.get("immediate_registration") === "on",
    immediate_creator_application: fd.get("immediate_creator_application") === "on",
  });
  if (!parsed.success) return { status: "error", message: "Please check the highlighted fields.", fields: fieldErrors(parsed.error), values };
  const viewer = await requireViewer("security.view");
  try {
    await hit(`security_admin:${viewer.id}`, LIMITS.securityAdmin);
    await updateSettings(viewer, parsed.data);
  } catch (e) {
    return fail(e);
  }
  return { status: "success", message: "Monitoring settings saved.", values };
}
