/**
 * Shared creator naming module.
 *
 * Every creator on DivaFans appears publicly as "Diva [chosen name]"
 * (for example: "Diva Miriam", "Diva Britney", "Diva Jade", "Diva مريم").
 *
 * The "Diva" prefix is fixed and non-removable. The editable portion after
 * "Diva" is stored separately (`creator_name`) and formatted through
 * `formatCreatorPublicName` so duplicate prefixes ("Diva Diva Miriam")
 * can never occur.
 */

export const CREATOR_NAME_PREFIX = "Diva" as const;
export const NEUTRAL_CREATOR_FALLBACK = "Diva Creator" as const;
export const CREATOR_CHOSEN_NAME_MAX_LENGTH = 50;
export const CREATOR_DISPLAY_NAME_MAX_LENGTH = 60;

const CONTROL_OR_BIDI_RE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
const HAS_CONTROL_OR_BIDI_RE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/;
const LEADING_DIVA_PREFIX_RE = /^diva(?:[\s:._·—–-]+|$)/i;
const VALID_CHOSEN_NAME_RE = /^[\p{L}\p{N}](?:[\p{L}\p{N}\p{M} ._'’-]*[\p{L}\p{N}\p{M}])?$/u;

const RESERVED_CHOSEN_NAMES = new Set([
  "admin",
  "administrator",
  "owner",
  "moderator",
  "support",
  "divafans",
  "the house",
  "house",
  "system",
  "official",
  "staff",
  "null",
  "undefined",
]);

/**
 * Extracts and normalizes the editable creator name portion after "Diva".
 * - Normalizes Unicode to NFC (preserving Arabic and other scripts).
 * - Removes control/invisible formatting characters.
 * - Trims and collapses internal whitespace runs to a single space.
 * - Strips any leading "Diva" prefix(es) case-insensitively so entering
 *   "Diva Miriam" or "diva  Diva Miriam" yields "Miriam".
 */
export function normalizeCreatorChosenName(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "";
  let s = raw
    .normalize("NFC")
    .replace(CONTROL_OR_BIDI_RE, "")
    .replace(/\s+/g, " ")
    .trim();

  while (LEADING_DIVA_PREFIX_RE.test(s)) {
    s = s.replace(LEADING_DIVA_PREFIX_RE, "").trim();
  }

  return s;
}

/**
 * Produces the complete public display name ("Diva [chosen name]").
 * Never exposes an email address and falls back to a neutral temporary label
 * ("Diva Creator") if no valid chosen name is present.
 */
export function formatCreatorPublicName(rawOrChosenName: string | null | undefined): string {
  const chosen = normalizeCreatorChosenName(rawOrChosenName);
  if (!chosen || chosen.includes("@")) {
    return NEUTRAL_CREATOR_FALLBACK;
  }
  const sliced = chosen.slice(0, CREATOR_CHOSEN_NAME_MAX_LENGTH).trim();
  if (!sliced) {
    return NEUTRAL_CREATOR_FALLBACK;
  }
  return `${CREATOR_NAME_PREFIX} ${sliced}`;
}

export type CreatorNameValidationResult =
  | { ok: true; chosenName: string; publicName: string }
  | { ok: false; error: string };

/**
 * Server- and client-safe validation for a creator's editable name portion.
 */
export function validateCreatorChosenName(raw: string | null | undefined): CreatorNameValidationResult {
  if (typeof raw !== "string") {
    return { ok: false, error: "Enter the name to show after Diva." };
  }
  if (HAS_CONTROL_OR_BIDI_RE.test(raw)) {
    return { ok: false, error: "Creator name contains invalid control characters." };
  }
  if (/[<>]/.test(raw)) {
    return { ok: false, error: "Creator name cannot contain HTML or angle brackets." };
  }

  const chosenName = normalizeCreatorChosenName(raw);
  if (!chosenName) {
    return { ok: false, error: "Enter the name to show after Diva." };
  }
  if (chosenName.includes("@")) {
    return { ok: false, error: "Use a public creator name, not an email address." };
  }
  if (chosenName.length > CREATOR_CHOSEN_NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `Keep the name after Diva to ${CREATOR_CHOSEN_NAME_MAX_LENGTH} characters or fewer.`,
    };
  }
  if (!VALID_CHOSEN_NAME_RE.test(chosenName)) {
    return {
      ok: false,
      error: "Use letters or numbers (spaces, hyphens, dots, and apostrophes are allowed inside the name).",
    };
  }
  if (RESERVED_CHOSEN_NAMES.has(chosenName.toLowerCase())) {
    return { ok: false, error: "That name is reserved. Please choose another name." };
  }

  return {
    ok: true,
    chosenName,
    publicName: `${CREATOR_NAME_PREFIX} ${chosenName}`,
  };
}
