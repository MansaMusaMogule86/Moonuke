import "server-only";
import { z } from "zod";

/**
 * Server environment, validated once. Never import from client components.
 * Production refuses to start with unsafe or missing settings (see
 * instrumentation.ts and `pnpm env:check`). Every variable is server-only;
 * nothing is exposed with NEXT_PUBLIC_.
 */
const DEV_SECRET = "dev-only-secret-do-not-use-in-production-0123456789";

const trustedProxy = z
  .string()
  .regex(/^(none|vercel|cloudflare|hops:[1-9])$/, "TRUSTED_PROXY must be none | vercel | cloudflare | hops:<1-9>");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  APP_SECRET: z.string().min(32, "APP_SECRET must be at least 32 characters").optional(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  TRUSTED_PROXY: trustedProxy.default("none"),
  EMAIL_TRANSPORT: z.enum(["dev", "smtp", "disabled"]).default("dev"),
  SMTP_URL: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
});

export type Env = z.infer<typeof schema> & { APP_SECRET: string };

/** Problems that make a configuration unsafe for production. */
export function productionProblems(e: z.infer<typeof schema>): string[] {
  const p: string[] = [];
  if (!e.APP_SECRET) p.push("APP_SECRET must be set (32+ random characters).");
  if (e.APP_SECRET === DEV_SECRET) p.push("APP_SECRET is the development default.");
  if (!e.APP_URL.startsWith("https://")) p.push("APP_URL must use https://.");
  if (!process.env.TRUSTED_PROXY) p.push("TRUSTED_PROXY must be set explicitly (none | vercel | cloudflare | hops:N).");
  if (e.EMAIL_TRANSPORT === "dev") p.push("EMAIL_TRANSPORT=dev is not allowed in production (use smtp or disabled).");
  if (e.EMAIL_TRANSPORT === "smtp" && (!e.SMTP_URL || !e.EMAIL_FROM)) p.push("EMAIL_TRANSPORT=smtp requires SMTP_URL and EMAIL_FROM.");
  return p;
}

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const raw = {
    ...process.env,
    // Back-compat with the Phase 2 variable name.
    APP_SECRET: process.env.APP_SECRET ?? process.env.MOONUKE_SECRET,
  };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  if (parsed.data.NODE_ENV === "production") {
    let problems = productionProblems(parsed.data);
    // Explicit opt-in for running a production build on localhost (CI, local QA).
    // Only relaxes the https / dev-email rules, and only for a localhost APP_URL.
    if (process.env.ALLOW_LOCAL_PRODUCTION === "true") {
      const host = new URL(parsed.data.APP_URL).hostname;
      if (host !== "localhost" && host !== "127.0.0.1") throw new Error("ALLOW_LOCAL_PRODUCTION requires a localhost APP_URL.");
      problems = problems.filter((m) => !m.startsWith("APP_URL") && !m.startsWith("EMAIL_TRANSPORT=dev"));
      if (!problems.length) console.warn("[env] ALLOW_LOCAL_PRODUCTION=true — production build running on localhost. Never use this in a real deployment.");
    }
    if (problems.length) throw new Error(`Unsafe production configuration:\n- ${problems.join("\n- ")}`);
  }
  cached = { ...parsed.data, APP_SECRET: parsed.data.APP_SECRET ?? DEV_SECRET };
  return cached;
}

/** For tests only. */
export function _resetEnvCache() {
  cached = null;
}

export const databaseUrl = () => env().DATABASE_URL;
export const appSecret = () => env().APP_SECRET;
export const appUrl = () => env().APP_URL.replace(/\/$/, "");
export const isProd = () => process.env.NODE_ENV === "production";
