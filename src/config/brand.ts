/**
 * Single source of truth for the product's identity.
 * "Moonuke" is a working name: to rebrand, change this file (and the symbol
 * artwork in components/brand/Symbol.tsx if the mark changes). Nothing else
 * in the app should hard-code the name, domain, or sender identity.
 */
export const brand = {
  /** Display name used in prose, titles and emails. */
  name: "Moonuke",
  /** Short descriptor that follows the name in page titles. */
  descriptor: "The Private Creator Club",
  tagline: "A private creator club",
  description:
    "An invitation-only club for creators and their most devoted members. Alias-first privacy, VIP rooms, and locked content. Adults 18+.",
  /**
   * Wordmark letters. `moonIndex` is the letter drawn as a hairline "new moon"
   * circle (the second O of MOONUKE). Set to null for a plain wordmark.
   */
  wordmark: { text: "MOONUKE", moonIndex: 2 as number | null },
  /** How the platform owner is referred to in the UI. */
  houseName: "The House",
  /** Default sender display name for transactional email. */
  emailSenderName: "Moonuke",
  /** Prefix for TOTP issuer labels in authenticator apps. */
  mfaIssuer: "Moonuke",
  /** Prefix for cookie and storage keys. Changing it signs everyone out. */
  cookiePrefix: "mk",
} as const;

export const pageTitle = (page?: string) => (page ? `${page} · ${brand.name}` : `${brand.name} — ${brand.descriptor}`);
