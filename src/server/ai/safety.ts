/**
 * Guardrails for AI-assisted profile copy. Applied to BOTH the creator's
 * inputs and every suggestion, regardless of provider.
 *
 * Hard blocks: anything sexualising minors or implying youth, and
 * non-consent themes. These are refused outright — never "rewritten".
 * Profile copy is also kept free of contact details and links (off-platform
 * solicitation and doxxing risk).
 */
const MINOR_TERMS =
  /\b(teen|teens|teenage|teenager|underage|under-age|minor|minors|schoolgirl|schoolboy|school\s*girl|school\s*boy|barely\s*legal|jail\s*bait|jailbait|loli|lolita|shota|child|children|kid|kids|preteen|pre-teen|little\s*girl|little\s*boy|young\s*girl|young\s*boy|high\s*school|middle\s*school|daddy'?s\s*little)\b/i;
const AGE_UNDER_18 = /\b(1[0-7]|[1-9])\s*(yo|y\/o|y\.o\.|yrs?\s*old|years?\s*old|year-old)\b/i;
const NON_CONSENT = /\b(rape|raped|non-?consensual|drugged|forced|coerced|unconscious|asleep\s*sex|hidden\s*cam|spy\s*cam|upskirt|revenge)\b/i;

export type SafetyVerdict = { ok: true } | { ok: false; reason: "minors" | "non_consent" };

export function checkText(...parts: (string | undefined | null)[]): SafetyVerdict {
  const text = parts.filter(Boolean).join(" \n ");
  if (MINOR_TERMS.test(text) || AGE_UNDER_18.test(text)) return { ok: false, reason: "minors" };
  if (NON_CONSENT.test(text)) return { ok: false, reason: "non_consent" };
  return { ok: true };
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const PHONE = /(?:\+?\d[\s().-]*){7,}\d/g;
const HANDLE = /(^|\s)@[A-Za-z0-9._]{2,}/g;

/** Remove contact details and links from generated copy; normalise whitespace; cap length. */
export function sanitizeCopy(s: string, max: number): string {
  return s
    .replace(EMAIL, "")
    .replace(URL_RE, "")
    .replace(PHONE, "")
    .replace(HANDLE, "$1")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}
