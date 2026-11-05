"use server";

import type { FormState } from "@/lib/forms";
import { requireViewer } from "@/server/auth/request";
import { isAppError } from "@/server/errors";
import * as fan from "@/server/services/fan";
import * as notes from "@/server/services/notifications";
import { hit, LIMITS } from "@/server/services/rateLimit";
import { uuid } from "@/server/validation";

const str = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string).trim() : "");
const fail = (e: unknown): FormState => {
  if (isAppError(e)) return { status: "error", message: e.message };
  throw e;
};

/** Cancel at period end, or keep the membership. Nothing is charged or refunded (payments inactive). */
export async function membershipAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("club.follow");
  const id = str(fd, "id");
  const intent = str(fd, "intent");
  if (!uuid.safeParse(id).success || !["cancel", "resume"].includes(intent)) return { status: "error", message: "Invalid request." };
  try {
    await hit(`membership:${viewer.id}`, LIMITS.membershipChange);
    await fan.setSubscriptionCancel(viewer, id, intent === "cancel");
    return {
      status: "success",
      message: intent === "cancel" ? "Your membership will end at the close of this period. You keep access until then." : "Your membership will continue.",
      data: { state: intent === "cancel" ? "ending" : "active" },
    };
  } catch (e) {
    return fail(e);
  }
}

export async function notificationReadAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("club.discover");
  try {
    if (str(fd, "intent") === "all") {
      const n = await notes.markAllRead(viewer);
      return { status: "success", message: n ? `Marked ${n} as read.` : "Everything is already read.", data: { all: "1" } };
    }
    const id = str(fd, "id");
    if (!uuid.safeParse(id).success) return { status: "error", message: "Invalid request." };
    await notes.markRead(viewer, id);
    return { status: "success", data: { id } };
  } catch (e) {
    return fail(e);
  }
}
