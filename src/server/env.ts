import "server-only";

/**
 * Server environment. Never import from client components.
 * Secrets are read lazily so `next build` does not need them.
 */
const DEV_SECRET = "dev-only-secret-do-not-use-in-production-0123456789";

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
  return url;
}

export function appSecret(): string {
  const s = process.env.MOONUKE_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("MOONUKE_SECRET must be set to at least 32 characters in production.");
  }
  return DEV_SECRET;
}

export const isProd = () => process.env.NODE_ENV === "production";
