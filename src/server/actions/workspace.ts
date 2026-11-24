"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/forms";
import { normalizeLocale } from "@/lib/i18n";
import {
  requireViewer,
  setLocaleCookie,
  setWorkspaceCookie,
} from "@/server/auth/request";
import { isAppError } from "@/server/errors";
import {
  switchWorkspace,
  updateMyFanAlias,
} from "@/server/services/workspace";

const str = (fd: FormData, k: string) =>
  typeof fd.get(k) === "string" ? (fd.get(k) as string).trim() : "";

export async function switchWorkspaceAction(fd: FormData) {
  const viewer = await requireViewer("club.discover");
  const targetRaw = str(fd, "workspace");
  const target = targetRaw === "studio" ? "studio" : "fan";

  // Ordinary fans and owners cannot switch to Creator Studio
  if (target === "studio" && viewer.role !== "creator") {
    redirect(viewer.role === "owner" ? "/owner" : "/home");
  }

  let destination = target === "studio" ? "/studio" : "/home";
  try {
    const res = await switchWorkspace(viewer, target);
    await setWorkspaceCookie(res.workspace);
    destination = res.redirectTo;
  } catch (e) {
    if (isAppError(e)) {
      redirect(viewer.role === "owner" ? "/owner" : "/home");
    }
    throw e;
  }
  redirect(destination);
}

export async function switchLocaleAction(fd: FormData) {
  const locale = normalizeLocale(str(fd, "locale"));
  await setLocaleCookie(locale);
  const returnTo = str(fd, "returnTo");
  if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
    revalidatePath(returnTo);
    redirect(returnTo);
  }
  revalidatePath("/", "layout");
}

export async function updateFanAliasAction(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const viewer = await requireViewer(undefined, { allowMfaSetup: true });
  const rawFanAlias = str(fd, "fanAlias");
  const values = { fanAlias: rawFanAlias };
  try {
    const res = await updateMyFanAlias(viewer, rawFanAlias);
    revalidatePath("/account/security");
    revalidatePath("/home");
    revalidatePath("/library");
    revalidatePath("/messages");
    return {
      status: "success",
      message: `Fan alias updated to ${res.fanAlias}.`,
      values: { fanAlias: res.fanAlias },
    };
  } catch (e) {
    if (isAppError(e)) {
      return {
        status: "error",
        message: e.message,
        fields: e.field ? { [e.field]: e.message } : undefined,
        values,
      };
    }
    throw e;
  }
}

