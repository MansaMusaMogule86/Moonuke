import "server-only";
import { z } from "zod";

/**
 * Server environment, validated once. Never import from client components.
 * Production refuses to start with unsafe or missing settings (see
 * instrumentation.ts and `pnpm env:check`). Every variable is server-only;
 * nothing is exposed with NEXT_PUBLIC_, except the Supabase project URL and
 * publishable key, which Supabase designs to be public.
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
  EMAIL_TRANSPORT: z.enum(["dev", "smtp", "resend", "disabled"]).default("dev"),
  SMTP_URL: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  // Resend (EMAIL_TRANSPORT=resend). Server-only: never prefix with NEXT_PUBLIC_.
  RESEND_API_KEY: z.string().regex(/^re_[A-Za-z0-9_]{16,}$/, "RESEND_API_KEY must be a Resend API key (re_…)").optional(),
  // Sender addresses by purpose (bare addresses on a domain verified in the provider).
  WELCOME_EMAIL_FROM: z.email("WELCOME_EMAIL_FROM must be an email address").optional(),
  SECURITY_EMAIL_FROM: z.email("SECURITY_EMAIL_FROM must be an email address").optional(),
  // Platform security alerts go here (default: the owner account's email).
  SECURITY_EMAIL_TO: z.email("SECURITY_EMAIL_TO must be an email address").optional(),
  // Live security notifications stay OFF until approved: alerts are still recorded and shown in /admin/security.
  SECURITY_ALERTS_ENABLED: z.enum(["true", "false"]).optional(),
  SECURITY_DIGEST_TIMEZONE: z
    .string()
    .refine((tz) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } }, "SECURITY_DIGEST_TIMEZONE must be an IANA time zone")
    .optional(),
  // AI-assisted profile drafting. "template" is local and free; "anthropic" is opt-in and billed by Anthropic.
  AI_PROVIDER: z.enum(["template", "anthropic", "disabled"]).default("template"),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().regex(/^claude-[a-z0-9-]+$/).default("claude-opus-5-5"),
  // Phase 8 feature flags. All default OFF and are enforced server-side
  // (src/server/flags.ts). Turning one on in production is refused until the
  // owner approves the provider (see productionProblems).
  FEATURE_PAYMENTS: z.enum(["on", "off"]).default("off"),
  FEATURE_UPLOADS: z.enum(["on", "off"]).default("off"),
  AUTH_PROVIDER: z.enum(["own", "supabase"]).default("own"),
  // Supabase project (prepared, not active: AUTH_PROVIDER stays "own" until A3 is approved).
  // Public by design; never put the secret or service-role key in a NEXT_PUBLIC_ variable.
  NEXT_PUBLIC_SUPABASE_URL: z.string().regex(/^https:\/\/[a-z0-9]{20}\.supabase\.co$/, "NEXT_PUBLIC_SUPABASE_URL must be https://<project-ref>.supabase.co").optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().regex(/^sb_publishable_[A-Za-z0-9_-]{20,}$/, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a publishable key (sb_publishable_…), never a secret key").optional(),
  STORAGE_PROVIDER: z.enum(["none", "mock"]).default("none"),
  SCAN_PROVIDER: z.enum(["none", "mock"]).default("none"),
  // Phase 10: age assurance and geographic restrictions. OFF until the owner
  // approves a vendor and the jurisdictions (L-1, L-2, P-2).
  FEATURE_AGE_ASSURANCE: z.enum(["on", "off"]).default("off"),
  AGE_PROVIDER: z.enum(["none", "mock"]).default("none"),
  FEATURE_GEO_RESTRICTIONS: z.enum(["on", "off"]).default("off"),
  // Phase 11: restricted moderator role. OFF until the owner approves staff (A1, B-6).
  FEATURE_MODERATORS: z.enum(["on", "off"]).default("off"),
  // Creator invite links: a creator's stable /join/<handle> link can create a FAN
  // account. OFF by default, so the invitation-only rule (owner approval for every
  // account) stands until the owner explicitly turns it on.
  FEATURE_CREATOR_REFERRALS: z.enum(["on", "off"]).default("off"),
  // Google Search Console HTML-tag verification token (the content="…" value only).
  GOOGLE_SITE_VERIFICATION: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/, "GOOGLE_SITE_VERIFICATION must be the token from Search Console's HTML tag").optional(),
});

export type Env = z.infer<typeof schema> & { APP_SECRET: string };

/** Live security emails are off unless SECURITY_ALERTS_ENABLED is exactly "true". */
export const securityAlertsEnabled = () => env().SECURITY_ALERTS_ENABLED === "true";

/** Problems that make a configuration unsafe for production. */
export function productionProblems(e: z.infer<typeof schema>): string[] {
  const p: string[] = [];
  if (!e.APP_SECRET) p.push("APP_SECRET must be set (32+ random characters).");
  if (e.APP_SECRET === DEV_SECRET) p.push("APP_SECRET is the development default.");
  if (!e.APP_URL.startsWith("https://")) p.push("APP_URL must use https://.");
  if (!process.env.TRUSTED_PROXY && process.env.VERCEL !== "1") p.push("TRUSTED_PROXY must be set explicitly (none | vercel | cloudflare | hops:N).");
  if (e.EMAIL_TRANSPORT === "dev") p.push("EMAIL_TRANSPORT=dev is not allowed in production (use smtp or disabled).");
  if (e.EMAIL_TRANSPORT === "smtp" && (!e.SMTP_URL || !e.EMAIL_FROM)) p.push("EMAIL_TRANSPORT=smtp requires SMTP_URL and EMAIL_FROM.");
  if (e.EMAIL_TRANSPORT === "resend" && !e.RESEND_API_KEY) p.push("EMAIL_TRANSPORT=resend requires RESEND_API_KEY.");
  if (e.EMAIL_TRANSPORT === "resend" && !(e.EMAIL_FROM || (e.WELCOME_EMAIL_FROM && e.SECURITY_EMAIL_FROM))) {
    p.push("EMAIL_TRANSPORT=resend requires EMAIL_FROM, or both WELCOME_EMAIL_FROM and SECURITY_EMAIL_FROM.");
  }
  if (e.SECURITY_ALERTS_ENABLED === "true" && e.EMAIL_TRANSPORT === "disabled") p.push("SECURITY_ALERTS_ENABLED=true needs a working EMAIL_TRANSPORT.");
  if (e.AI_PROVIDER === "anthropic" && !e.ANTHROPIC_API_KEY) p.push("AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY.");
  // No real provider is integrated or approved, so these can't be enabled in production yet.
  if (e.FEATURE_PAYMENTS === "on") p.push("FEATURE_PAYMENTS=on: no payment provider is integrated or approved (A10).");
  if (e.FEATURE_UPLOADS === "on") p.push("FEATURE_UPLOADS=on: no approved storage and content-safety scanning provider (A10).");
  if (e.STORAGE_PROVIDER === "mock" || e.SCAN_PROVIDER === "mock") p.push("Mock storage/scanning providers are for tests only.");
  if (e.FEATURE_AGE_ASSURANCE === "on") p.push("FEATURE_AGE_ASSURANCE=on: no age-assurance vendor is approved (P-2).");
  if (e.AGE_PROVIDER === "mock") p.push("Mock age-assurance provider is for tests only.");
  if (e.FEATURE_GEO_RESTRICTIONS === "on") p.push("FEATURE_GEO_RESTRICTIONS=on: jurisdictions are not decided (L-1).");
  if (e.FEATURE_MODERATORS === "on") p.push("FEATURE_MODERATORS=on: the moderator role is not approved (A1, B-6).");
  if (e.AUTH_PROVIDER === "supabase") p.push("AUTH_PROVIDER=supabase: the migration is prepared but not approved (A3).");
  return p;
}

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  // On Vercel (VERCEL=1 is set by the platform) the proxy and https domain are known, and with no SMTP configured
  // mail is off rather than the dev outbox. Anything set explicitly still wins. APP_SECRET has no default.
  const prodHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const vercel = process.env.VERCEL === "1" ? { TRUSTED_PROXY: "vercel", EMAIL_TRANSPORT: "disabled", ...(prodHost && { APP_URL: `https://${prodHost}` }) } : {};
  const raw = {
    ...vercel,
    ...process.env,
    // Back-compat with the Phase 2 variable name.
    APP_SECRET: process.env.APP_SECRET,
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
/** Only the live site may be indexed. Vercel previews and local production builds are hidden from search. */
export const isIndexable = () =>
  isProd() && (process.env.VERCEL === "1" ? process.env.VERCEL_ENV === "production" : appUrl().startsWith("https://"));
