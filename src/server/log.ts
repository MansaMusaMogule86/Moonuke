/**
 * Structured server logging: one JSON object per line, so any log drain can
 * parse it. Redacts anything that looks like a credential or contact detail
 * before it is written. Never log request bodies.
 */
type Level = "info" | "warn" | "error";

const SECRET_KEY = /pass|token|secret|sig|cookie|authorization|otp|code|hash|key|email/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARERISH = /\b[A-Za-z0-9_-]{32,}\b/g;

export function redact(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.replace(EMAIL, "[email]").replace(BEARERISH, "[redacted]").slice(0, 500);
  if (depth > 3) return "[…]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      out[k] = SECRET_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 200);
}

export function log(level: Level, event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...(redact(fields) as object) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
