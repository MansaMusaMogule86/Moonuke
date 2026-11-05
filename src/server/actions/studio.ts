"use server";

import { z } from "zod";
import type { FormState } from "@/lib/forms";
import { requireViewer } from "@/server/auth/request";
import { isAppError } from "@/server/errors";
import { hit, LIMITS } from "@/server/services/rateLimit";
import * as studio from "@/server/services/studio";
import { uuid } from "@/server/validation";

const str = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string).trim() : "");
const POST_KEYS = ["teaser", "body", "access", "price", "mediaKind", "mediaCount", "publish", "scheduleAt", "scheduleLocal"] as const;

const postSchema = z.object({
  access: z.enum(["preview", "members", "vip", "ppv"]),
  // Dollars as typed; converted to integer cents. The server decides the bounds.
  price: z.string().regex(/^\d{1,5}(\.\d{1,2})?$/, "Use a price like 12 or 12.50.").optional(),
  teaser: z.string().max(400),
  body: z.string().max(10_000),
  mediaKind: z.enum(["image", "set", "video"]),
  mediaCount: z.coerce.number().int().min(0).max(1000).optional(),
  publish: z.enum(["draft", "now", "schedule"]),
  scheduleAt: z.string().datetime({ offset: true }).optional(),
});

function readPost(fd: FormData) {
  const values = Object.fromEntries(POST_KEYS.map((k) => [k, str(fd, k)]));
  const parsed = postSchema.safeParse({
    ...values,
    price: values.access === "ppv" && values.price ? values.price : undefined,
    mediaCount: values.mediaKind === "set" ? values.mediaCount || "0" : undefined,
    scheduleAt: values.publish === "schedule" && values.scheduleAt ? values.scheduleAt : undefined,
  });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) fields[String(i.path[0])] ??= i.message;
    return { values, error: { status: "error", message: "Please check the highlighted fields.", fields, values } as FormState };
  }
  const d = parsed.data;
  const input: studio.PostInput = {
    access: d.access,
    priceCents: d.price ? Math.round(Number(d.price) * 100) : null,
    teaser: d.teaser,
    body: d.body,
    mediaKind: d.mediaKind,
    mediaCount: d.mediaCount,
    publish: d.publish,
    scheduleAt: d.scheduleAt ? new Date(d.scheduleAt) : undefined,
  };
  return { values, input };
}

const fail = (e: unknown, values: Record<string, string>): FormState => {
  if (isAppError(e)) return { status: "error", message: e.message, fields: e.field ? { [e.field]: e.message } : undefined, values };
  throw e;
};

const doneMessage = (p: studio.PostInput) =>
  p.publish === "draft" ? "Saved as a draft. Only you can see it." : p.publish === "schedule" ? "Scheduled. Members will see it at the chosen time." : "Published to your members.";

export async function createPostAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const creator = await requireViewer("club.discover");
  const r = readPost(fd);
  if (!r.input) return r.error!;
  try {
    await hit(`post:${creator.id}`, LIMITS.postWrite);
    const id = await studio.createPost(creator, r.input);
    return { status: "success", message: doneMessage(r.input), data: { id } };
  } catch (e) {
    return fail(e, r.values);
  }
}

export async function updatePostAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const creator = await requireViewer("club.discover");
  const id = str(fd, "id");
  if (!uuid.safeParse(id).success) return { status: "error", message: "Invalid request." };
  const r = readPost(fd);
  if (!r.input) return r.error!;
  try {
    await hit(`post:${creator.id}`, LIMITS.postWrite);
    await studio.updatePost(creator, id, r.input);
    return { status: "success", message: r.input.publish === "now" ? "Saved and published." : doneMessage(r.input), data: { id } };
  } catch (e) {
    return fail(e, r.values);
  }
}

export async function deletePostAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const creator = await requireViewer("club.discover");
  const id = str(fd, "id");
  if (!uuid.safeParse(id).success) return { status: "error", message: "Invalid request." };
  if (str(fd, "confirm") !== "yes") return { status: "error", message: "Confirm to delete." };
  try {
    await hit(`post:${creator.id}`, LIMITS.postWrite);
    await studio.deletePost(creator, id);
    return { status: "success", message: "Post deleted.", data: { deleted: id } };
  } catch (e) {
    return fail(e, {});
  }
}
