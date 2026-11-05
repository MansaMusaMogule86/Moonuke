import { isIP } from "node:net";

export type TrustedProxy = "none" | "vercel" | "cloudflare" | `hops:${number}`;
type HeaderGetter = { get(name: string): string | null };

/**
 * Resolve the client IP from request headers according to the deployment's
 * proxy topology. Forwarding headers are client-controlled unless a trusted
 * proxy overwrites them, so we only read the header that proxy guarantees:
 *
 * - none:        trust nothing (local dev / direct exposure) → null
 * - vercel:      x-real-ip (set by Vercel's edge), else first x-forwarded-for hop
 * - cloudflare:  cf-connecting-ip (set by Cloudflare)
 * - hops:N:      N trusted proxies each append to X-Forwarded-For; the client
 *                is the Nth entry from the right. Anything left of it is spoofable.
 *
 * Returns null when no trustworthy, well-formed IP is available.
 */
export function clientIp(h: HeaderGetter, mode: TrustedProxy): string | null {
  const valid = (v: string | null | undefined) => {
    const ip = v?.trim();
    return ip && isIP(ip) ? ip : null;
  };
  switch (true) {
    case mode === "none":
      return null;
    case mode === "vercel":
      return valid(h.get("x-real-ip")) ?? valid(h.get("x-forwarded-for")?.split(",")[0]);
    case mode === "cloudflare":
      return valid(h.get("cf-connecting-ip"));
    case mode.startsWith("hops:"): {
      const n = Number(mode.slice(5));
      const chain = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (!Number.isInteger(n) || n < 1 || chain.length < n) return null;
      return valid(chain[chain.length - n]);
    }
    default:
      return null;
  }
}
