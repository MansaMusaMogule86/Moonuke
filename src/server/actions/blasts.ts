"use server";

import { after } from "next/server";
import type { FormState } from "@/lib/forms";
import { requireViewer } from "@/server/auth/request";
import { isAppError } from "@/server/errors";
import { runBlasts } from "@/server/messaging/blasts";
import * as b from "@/server/services/blasts";
import { hit, LIMITS } from "@/server/services/rateLimit";
import { uuid } from "@/server/validation";

const str = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string).trim() : "");
const fail = (e: unknown, values?: Record<string, string>): FormState => {
  if (isAppError(e)) return { status: "error", message: e.message, fields: e.field ? { [e.field]: e.message } : undefined, values };
  throw e;
};

export async function createBlastAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("club.discover");
  const values = { segment: str(fd, "segment"), listId: str(fd, "listId"), body: str(fd, "body"), when: str(fd, "when"), scheduleLocal: str(fd, "scheduleLocal") };
  const scheduleAt = values.when === "later" ? new Date(str(fd, "scheduleAt")) : null;
  if (values.listId && !uuid.safeParse(values.listId).success) return { status: "error", message: "Invalid request." };
  try {
    await hit(`blast:${viewer.id}`, LIMITS.postWrite);
    const r = await b.createBlast(viewer, { segment: values.segment as b.Segment, listId: values.listId || null, body: values.body, scheduleAt });
    if (!r.scheduled) after(() => runBlasts().catch(() => {}));
    return { status: "success", message: r.scheduled ? "Scheduled. Each recipient will get it as a private message." : "Sending now. Each recipient gets it as a private message.", data: { id: r.id } };
  } catch (e) {
    return fail(e, values);
  }
}

export async function cancelBlastAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("club.discover");
  const id = str(fd, "id");
  if (!uuid.safeParse(id).success) return { status: "error", message: "Invalid request." };
  try {
    await b.cancelBlast(viewer, id);
    return { status: "success", message: "Cancelled.", data: { canceled: id } };
  } catch (e) {
    return fail(e);
  }
}

export async function templateAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("club.discover");
  try {
    if (str(fd, "intent") === "delete") {
      const id = str(fd, "id");
      if (!uuid.safeParse(id).success) return { status: "error", message: "Invalid request." };
      await b.deleteTemplate(viewer, id);
      return { status: "success", message: "Template deleted." };
    }
    await b.saveTemplate(viewer, str(fd, "templateName"), str(fd, "body"));
    return { status: "success", message: "Template saved." };
  } catch (e) {
    return fail(e, { templateName: str(fd, "templateName"), body: str(fd, "body") });
  }
}

export async function listAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("club.discover");
  const intent = str(fd, "intent");
  try {
    if (intent === "create") {
      await b.createList(viewer, str(fd, "name"));
      return { status: "success", message: "List created." };
    }
    const listId = str(fd, "listId");
    if (!uuid.safeParse(listId).success) return { status: "error", message: "Invalid request." };
    if (intent === "delete") {
      await b.deleteList(viewer, listId);
      return { status: "success", message: "List deleted. Scheduled Blasts to it were cancelled." };
    }
    const fanId = str(fd, "fanId");
    if (!uuid.safeParse(fanId).success) return { status: "error", message: "Invalid request." };
    await b.setListMember(viewer, listId, fanId, intent === "add");
    return { status: "success", message: intent === "add" ? "Added." : "Removed." };
  } catch (e) {
    return fail(e, { name: str(fd, "name") });
  }
}

export async function blastOptOutAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("club.discover");
  const creatorId = str(fd, "creatorId");
  if (!uuid.safeParse(creatorId).success) return { status: "error", message: "Invalid request." };
  const optOut = str(fd, "intent") === "optout";
  try {
    await b.setBlastOptOut(viewer, creatorId, optOut);
    return { status: "success", message: optOut ? "You won't receive broadcasts from this creator." : "Broadcasts are on.", data: { optedOut: optOut ? "1" : "0" } };
  } catch (e) {
    return fail(e);
  }
}

export async function appealAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("club.discover");
  const id = str(fd, "restrictionId");
  if (!uuid.safeParse(id).success) return { status: "error", message: "Invalid request." };
  try {
    await b.fileAppeal(viewer, id, str(fd, "appeal"));
    return { status: "success", message: "Appeal sent. The house will review it." };
  } catch (e) {
    return fail(e, { appeal: str(fd, "appeal") });
  }
}

export async function decideAppealAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const owner = await requireViewer("moderation.review");
  const id = str(fd, "id");
  if (!uuid.safeParse(id).success) return { status: "error", message: "Invalid request." };
  try {
    const overturn = str(fd, "decision") === "overturn";
    await b.decideAppeal(owner, id, overturn, str(fd, "note"));
    return { status: "success", message: overturn ? "Overturned — the pause was lifted." : "Upheld." };
  } catch (e) {
    return fail(e);
  }
}
