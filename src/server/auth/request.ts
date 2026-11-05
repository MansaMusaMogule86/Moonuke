import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { isProd } from "@/server/env";
import { hashIp } from "./crypto";
import { can, type Permission, type Viewer } from "./permissions";
import { resolveSession, revokeSession, SESSION_TTL_DAYS } from "@/server/services/sessions";

/** `__Host-` pins the cookie to this exact origin over HTTPS (production). */
export const SESSION_COOKIE = isProd() ? "__Host-mk_session" : "mk_session";

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

export async function clearSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(token);
  jar.delete(SESSION_COOKIE);
}

/**
 * Client IP. Uses the first X-Forwarded-For hop, which is only trustworthy
 * behind a proxy that overwrites it (Vercel, Cloudflare, a configured LB).
 */
export async function requestMeta() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return { ip, ipHash: hashIp(ip), userAgent: h.get("user-agent") };
}

/** The signed-in account for this request (memoised per request). */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return resolveSession(token);
});

/**
 * Server-side gate for every protected page and action.
 * - no session → /signin
 * - not active → /pending
 * - missing permission → 404 (does not reveal that the route exists)
 */
export async function requireViewer(permission?: Permission): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect("/signin");
  if (v.status !== "active") redirect("/pending");
  if (permission && !can(v, permission)) notFound();
  return v;
}
