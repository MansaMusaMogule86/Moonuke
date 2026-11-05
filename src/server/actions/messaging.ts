"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/lib/forms";
import { requireViewer } from "@/server/auth/request";
import { isAppError } from "@/server/errors";
import * as msg from "@/server/services/messaging";
import { uuid } from "@/server/validation";

const str = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string).trim() : "");
const fail = (e: unknown, values?: Record<string, string>): FormState => {
  if (isAppError(e)) return { status: "error", message: e.message, fields: e.field ? { [e.field]: e.message } : undefined, values };
  throw e;
};

/** Open (or find) a conversation and go to it. */
export async function openConversationAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("club.discover");
  const other = str(fd, "userId");
  if (!uuid.safeParse(other).success) return { status: "error", message: "Invalid request." };
  let id: string;
  try {
    id = await msg.openConversation(viewer, other);
  } catch (e) {
    return fail(e);
  }
  redirect(`/messages/${id}`);
}

export async function sendMessageAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("club.discover");
  const id = str(fd, "conversationId");
  const body = typeof fd.get("body") === "string" ? (fd.get("body") as string) : "";
  if (!uuid.safeParse(id).success) return { status: "error", message: "Invalid request." };
  try {
    const r = await msg.sendMessage(viewer, id, body, str(fd, "clientKey"));
    return {
      status: "success",
      message: r.status === "held" ? "Your message is being checked by the house before it's delivered." : undefined,
      data: { id: r.id, status: r.status },
    };
  } catch (e) {
    // Echo the draft back so it isn't lost.
    return fail(e, { body: body.slice(0, 2000) });
  }
}

export async function conversationFlagsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("club.discover");
  const id = str(fd, "conversationId");
  const intent = str(fd, "intent");
  if (!uuid.safeParse(id).success) return { status: "error", message: "Invalid request." };
  const flags = intent === "mute" ? { muted: true } : intent === "unmute" ? { muted: false } : intent === "restrict" ? { restricted: true } : intent === "unrestrict" ? { restricted: false } : null;
  if (!flags) return { status: "error", message: "Invalid request." };
  try {
    await msg.setConversationFlags(viewer, id, flags);
    return { status: "success", message: { mute: "Muted. You won't be notified about new messages.", unmute: "Notifications on.", restrict: "Paused. They can't send you messages until you allow it.", unrestrict: "They can message you again." }[intent as "mute"], data: { intent } };
  } catch (e) {
    return fail(e);
  }
}

export async function messagingSettingsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("club.discover");
  try {
    await msg.saveSettings(viewer, { membersCanMessage: fd.get("membersCanMessage") === "on" });
    return { status: "success", message: "Saved.", values: { membersCanMessage: fd.get("membersCanMessage") === "on" ? "on" : "" } };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- house

export async function heldReviewAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const owner = await requireViewer("moderation.review");
  const id = str(fd, "id");
  if (!uuid.safeParse(id).success) return { status: "error", message: "Invalid request." };
  try {
    const release = str(fd, "decision") === "release";
    await msg.reviewHeld(owner, id, release);
    return { status: "success", message: release ? "Released to the conversation." : "Removed.", data: { done: release ? "released" : "removed" } };
  } catch (e) {
    return fail(e);
  }
}

export async function moderateMessageAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const owner = await requireViewer("moderation.review");
  const reportId = str(fd, "reportId");
  const messageId = str(fd, "messageId");
  const status = str(fd, "status");
  if (!uuid.safeParse(reportId).success || !uuid.safeParse(messageId).success || !["sent", "held", "removed"].includes(status)) return { status: "error", message: "Invalid request." };
  try {
    await msg.moderateMessage(owner, reportId, messageId, status as "sent" | "held" | "removed");
    return { status: "success", message: status === "removed" ? "Message removed from the conversation." : status === "held" ? "Message withheld pending review." : "Message restored.", data: { status } };
  } catch (e) {
    return fail(e);
  }
}

export async function restrictAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const owner = await requireViewer("moderation.review");
  const userId = str(fd, "userId");
  if (str(fd, "intent") === "lift") {
    const id = str(fd, "id");
    if (!uuid.safeParse(id).success) return { status: "error", message: "Invalid request." };
    try {
      await msg.liftRestriction(owner, id);
      return { status: "success", message: "Restriction lifted.", data: { lifted: id } };
    } catch (e) {
      return fail(e);
    }
  }
  if (!uuid.safeParse(userId).success) return { status: "error", message: "Invalid request." };
  try {
    await msg.restrictMessaging(owner, userId, Number(str(fd, "hours")), str(fd, "reason"));
    return { status: "success", message: "Messaging paused for this account." };
  } catch (e) {
    return fail(e, { hours: str(fd, "hours"), reason: str(fd, "reason") });
  }
}

/** Exceptional access (owner, AAL2). The justification is logged before content is returned. */
export async function exceptionalAccessAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const owner = await requireViewer("moderation.review");
  const reportId = str(fd, "reportId");
  if (!uuid.safeParse(reportId).success) return { status: "error", message: "Invalid request." };
  const justification = str(fd, "justification");
  try {
    const rows = await msg.exceptionalAccessForReport(owner, reportId, justification);
    return {
      status: "success",
      message: `Access recorded in the audit log. Showing ${rows.length} message${rows.length === 1 ? "" : "s"}.`,
      data: { rows: JSON.stringify(rows.map((r) => ({ id: r.id, sender: r.sender_id, body: r.body, status: r.status, at: new Date(r.created_at).toISOString() }))) },
    };
  } catch (e) {
    return fail(e, { justification });
  }
}
