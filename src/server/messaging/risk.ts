import { checkText } from "@/server/ai/safety";

/**
 * Message risk scoring — configurable, rule-based, explainable. NOT a machine
 * learning classifier. Each rule adds points; the total decides:
 *   score >= REJECT  → refused (sender sees why, nothing stored)
 *   score >= HOLD    → stored as 'held' (recipient can't see it) and queued for house review
 *   otherwise        → sent
 * Hard rules (minors, non-consent, contact details, links) always reject.
 */
export const RISK = {
  REJECT: 100,
  HOLD: 60,
  rules: {
    contact: 100, // emails, phone numbers, @handles for other apps
    link: 100, // URLs and bare domains
    offPlatformPayment: 100, // asking to pay or talk elsewhere
    minorsOrNonConsent: 1000,
    threat: 70,
    scam: 70,
    harassment: 40,
    shouting: 10,
    repetition: 10,
    burstDuplicate: 60, // same text to many conversations in a short window
    newAccount: 10,
  },
} as const;

export type RiskRule = keyof typeof RISK.rules;
export type RiskResult = { score: number; action: "send" | "hold" | "reject"; rules: RiskRule[]; message: string | null };

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /(?:\+?\d[\s().-]*){8,}\d/;
const HANDLE_ELSEWHERE = /(^|\s)@[A-Za-z0-9._]{3,}/;
const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]{2,}\.(?:com|net|org|io|me|co|app|link|ly|gg|xyz|info|biz|tv|to|cc|ru|cn)\b/i;
const OFF_PLATFORM = /\b(whats\s?app|telegram|signal\s+me|snap\s?chat|kik|wechat|cash\s?app|venmo|paypal|zelle|onlyfans|fansly|text\s+me|call\s+me|dm\s+me\s+on)\b/i;
const THREAT = /\b(i(?:'| a)?ll\s+(?:kill|hurt|find)\s+you|kill\s+yourself|kys|i\s+know\s+where\s+you\s+live|you(?:'| wi)ll\s+regret|leak\s+your|dox(?:x)?(?:ing)?|swat(?:ting)?)\b/i;
const SCAM = /\b(gift\s?cards?|wire\s+transfer|western\s+union|crypto\s+wallet|seed\s+phrase|send\s+(?:me\s+)?(?:money|btc|usdt|eth)|investment\s+opportunity|double\s+your|verify\s+your\s+account)\b/i;
const HARASS = /\b(bitch|whore|slut|retard|ugly\s+(?:cow|pig))\b/i;

export function scoreMessage(body: string, ctx: { recentSameBody: number; accountAgeHours: number }): RiskResult {
  const rules: RiskRule[] = [];
  const text = body.normalize("NFKC");
  const safety = checkText(text);
  if (!safety.ok) rules.push("minorsOrNonConsent");
  if (EMAIL.test(text) || PHONE.test(text) || HANDLE_ELSEWHERE.test(text)) rules.push("contact");
  if (LINK.test(text)) rules.push("link");
  if (OFF_PLATFORM.test(text)) rules.push("offPlatformPayment");
  if (THREAT.test(text)) rules.push("threat");
  if (SCAM.test(text)) rules.push("scam");
  if (HARASS.test(text)) rules.push("harassment");
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 12 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.8) rules.push("shouting");
  if (/(.)\1{9,}/.test(text)) rules.push("repetition");
  if (ctx.recentSameBody >= 3) rules.push("burstDuplicate");
  if (ctx.accountAgeHours < 24) rules.push("newAccount");

  const score = rules.reduce((n, r) => n + RISK.rules[r], 0);
  const action = score >= RISK.REJECT ? "reject" : score >= RISK.HOLD ? "hold" : "send";
  let message: string | null = null;
  if (action === "reject") {
    message = rules.includes("minorsOrNonConsent")
      ? "That message can't be sent. Remove any reference to minors, youth or non-consent."
      : rules.includes("contact") || rules.includes("link") || rules.includes("offPlatformPayment")
        ? "Keep conversations here: links, contact details and other apps or payment services can't be shared."
        : "That message can't be sent.";
  }
  return { score, action, rules, message };
}
