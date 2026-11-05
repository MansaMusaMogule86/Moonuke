import { randomBytes } from "node:crypto";
import { AppError } from "@/server/errors";

/** Supported social platforms and their canonical profile URL prefix. */
export const PLATFORMS = {
  instagram: { label: "Instagram", base: "https://www.instagram.com/" },
  tiktok: { label: "TikTok", base: "https://www.tiktok.com/@" },
  x: { label: "X", base: "https://x.com/" },
  youtube: { label: "YouTube", base: "https://www.youtube.com/@" },
  twitch: { label: "Twitch", base: "https://www.twitch.tv/" },
  threads: { label: "Threads", base: "https://www.threads.net/@" },
  website: { label: "Website", base: "" },
} as const;
export type Platform = keyof typeof PLATFORMS;
export type SocialLink = { platform: Platform; handle: string; url: string };

const HANDLE_RE = /^[A-Za-z0-9._-]{1,60}$/;
const URL_RE = /^https:\/\/[^\s/$.?#].[^\s]*$/;
const hostOf = (u: string) => new URL(u).hostname.toLowerCase().replace(/^www\./, "");

/**
 * Validate and normalise a social link. Same rules for manual adds and
 * imports: https only, ≤300 chars, and platform links must stay on the
 * platform's own domain so a "verified Instagram" can't point elsewhere.
 */
export function normalizeSocial(input: { platform: Platform; handle: string; url?: string }): SocialLink {
  const handle = input.handle.trim().replace(/^@/, "");
  if (!HANDLE_RE.test(handle)) throw new AppError("validation", "Use the handle only — letters, numbers, dots, dashes, underscores.", "handle");
  const meta = PLATFORMS[input.platform];
  if (!meta) throw new AppError("validation", "Choose a platform.", "platform");
  let url = input.url?.trim() || (meta.base ? `${meta.base}${handle}` : "");
  if (!URL_RE.test(url) || url.length > 300) throw new AppError("validation", "Enter the full https:// address.", "url");
  try {
    if (input.platform !== "website") {
      if (hostOf(url) !== hostOf(meta.base)) throw new AppError("validation", `That link isn't on ${meta.label}.`, "url");
    } else {
      url = new URL(url).toString();
    }
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("validation", "Enter the full https:// address.", "url");
  }
  return { platform: input.platform, handle, url };
}

const HOST_PLATFORM: Record<string, Platform> = {
  "instagram.com": "instagram",
  "tiktok.com": "tiktok",
  "x.com": "x",
  "twitter.com": "x",
  "youtube.com": "youtube",
  "twitch.tv": "twitch",
  "threads.net": "threads",
};

/**
 * Turn an arbitrary https URL into a social link, or null if it can't be
 * represented safely. Platform links are rewritten to the canonical profile
 * URL (dropping query strings and tracking), so imports can't smuggle paths.
 */
export function linkFromUrl(raw: string): SocialLink | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.|mobile\.)/, "");
  const platform = HOST_PLATFORM[host];
  try {
    if (platform) {
      const seg = u.pathname.split("/").filter(Boolean)[0]?.replace(/^@/, "");
      if (!seg || !HANDLE_RE.test(seg)) return null;
      return normalizeSocial({ platform, handle: seg });
    }
    if (!HANDLE_RE.test(host)) return null;
    u.hash = "";
    return normalizeSocial({ platform: "website", handle: host, url: `${u.origin}${u.pathname === "/" ? "/" : u.pathname}` });
  } catch {
    return null;
  }
}

/** Proof code the creator places in that profile's bio (manual ownership check). */
export const newProofCode = () => `mnk-${randomBytes(4).toString("hex")}`;
