import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { brand } from "@/config/brand";
import { env, isProd } from "@/server/env";
import { clientIp, type TrustedProxy } from "@/server/net/ip";
import { contextFrom } from "@/server/security/monitor";
import { hashIp } from "./crypto";
import { can, type Permission, type Viewer, type WorkspaceMode } from "./permissions";
import { normalizeLocale, type Locale } from "@/lib/i18n";
import { resolveSession, revokeSession, SESSION_TTL_DAYS } from "@/server/services/sessions";

/** `__Host-` pins the cookie to this exact origin over HTTPS (production). */
export const SESSION_COOKIE = isProd() ? `__Host-${brand.cookiePrefix}_session` : `${brand.cookiePrefix}_session`;
export const WORKSPACE_COOKIE = `${brand.cookiePrefix}_workspace`;
export const LOCALE_COOKIE = `${brand.cookiePrefix}_locale`;

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

export async function setWorkspaceCookie(workspace: WorkspaceMode) {
  (await cookies()).set(WORKSPACE_COOKIE, workspace, {
    httpOnly: false,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    maxAge: 90 * 24 * 60 * 60,
  });
}

export async function getWorkspaceCookie(): Promise<WorkspaceMode | null> {
  const val = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  return val === "studio" || val === "fan" ? val : null;
}

export async function setLocaleCookie(locale: Locale) {
  (await cookies()).set(LOCALE_COOKIE, locale, {
    httpOnly: false,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
}

export async function getLocaleCookie(): Promise<Locale> {
  const val = (await cookies()).get(LOCALE_COOKIE)?.value;
  return normalizeLocale(val);
}

export async function clearSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(token);
  jar.delete(SESSION_COOKIE);
}

/**
 * Client IP, resolved per TRUSTED_PROXY (see server/net/ip.ts). Null when the
 * deployment declares no trusted proxy; rate limits then fall back to
 * per-account buckets plus a shared "unknown" bucket.
 */
export async function requestMeta() {
  const h = await headers();
  const mode = env().TRUSTED_PROXY as TrustedProxy;
  const ip = clientIp(h, mode);
  return { ip, ipHash: hashIp(ip), userAgent: h.get("user-agent"), security: contextFrom(h, mode) };
}

/** The signed-in account for this request (memoised per request). */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return resolveSession(token);
});

/**
 * Server-side gate for every protected page and action.
 * - no session → /signin
 * - second factor enrolled but not yet verified in this session → /signin/verify
 * - not active → /pending
 * - owner without an enrolled authenticator → /account/security (mandatory setup)
 * - missing permission → 404 (does not reveal that the route exists)
 * `allowMfaSetup` is used only by the account-security area itself.
 */
export async function requireViewer(permission?: Permission, opts: { allowMfaSetup?: boolean } = {}): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect("/signin");
  if (v.mfa === "pending") redirect("/signin/verify");
  if (v.status !== "active") redirect("/pending");
  // Two-step sign-in is mandatory for the owner before any owner tools open.
  // It is optional for creators, who can enable it in Account security.
  if (v.role === "owner" && v.mfa === "none" && !opts.allowMfaSetup) redirect("/account/security?setup=required");
  if (permission && !can(v, permission)) notFound();
  return v;
}

export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}
