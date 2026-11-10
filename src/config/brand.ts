/**
 * Single source of truth for the product's identity.
 * The product was renamed from "Moonuke" to "Diva Fans". To rebrand again,
 * change this file (and the monogram artwork in components/brand/Symbol.tsx
 * and app/icon.svg if the mark changes). Nothing else in the app should
 * hard-code the name, domain, or sender identity.
 */
export const brand = {
  /** Display name used in prose, titles and emails. */
  name: "Diva Fans",
  /** Short descriptor that follows the name in page titles. */
  descriptor: "The Private Creator Club",
  tagline: "A private creator club",
  description:
    "An invitation-only club for creators and their most devoted members. Alias-first privacy, VIP rooms, and locked content.",
  /** Wordmark letters, rendered in Bodoni capitals. */
  wordmark: { text: "DIVA FANS" },
  /** How the platform owner is referred to in the UI. */
  houseName: "The House",
  /** Default sender display name for transactional email. */
  emailSenderName: "Diva Fans",
  /**
   * Issuer label shown in authenticator apps for new MFA enrolments.
   * It is a label only: existing enrolments keep their old label and their codes still work.
   */
  mfaIssuer: "Diva Fans",
  /** Prefix for cookie and storage keys. Kept from the old name: changing it signs everyone out. */
  cookiePrefix: "mk",
} as const;

export const pageTitle = (page?: string) => (page ? `${page} · ${brand.name}` : `${brand.name} — ${brand.descriptor}`);
