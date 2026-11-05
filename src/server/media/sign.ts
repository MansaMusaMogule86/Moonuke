import "server-only";
import { hmac, safeEqual } from "@/server/auth/crypto";

export const MEDIA_TTL_SEC = 5 * 60;

/**
 * Short-lived media URL bound to one viewer, one asset and an expiry.
 * The media route re-validates the session and the entitlement as well, so a
 * leaked URL is useless to anyone else and to the viewer after expiry.
 */
export function signMediaUrl(postId: string, index: number, viewerId: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + MEDIA_TTL_SEC;
  const sig = hmac(`media:${postId}:${index}:${viewerId}:${exp}`);
  return `/api/media/${postId}/${index}?exp=${exp}&sig=${sig}`;
}

export function verifyMediaSignature(
  postId: string,
  index: number,
  viewerId: string,
  exp: number,
  sig: string,
  now = Date.now(),
): boolean {
  if (!Number.isFinite(exp) || exp < Math.floor(now / 1000)) return false;
  if (exp > Math.floor(now / 1000) + MEDIA_TTL_SEC + 5) return false;
  return safeEqual(sig, hmac(`media:${postId}:${index}:${viewerId}:${exp}`));
}
