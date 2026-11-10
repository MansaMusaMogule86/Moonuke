/**
 * Single source of truth for the product's identity.
 * The product was renamed from "Moonuke" to "Diva Fans". To rebrand again,
 * change this file (and the logo files under public/images/brand, plus the
 * app icons in src/app, if the mark changes). Nothing else in the app should
 * hard-code the name, domain, or sender identity.
 */
export const brand = {
  /** Display name used in prose, titles and emails. */
  name: "Diva Fans",
  /** Short descriptor that follows the name in page titles. */
  descriptor: "Closer to the creators you love",
  tagline: "Exclusive content, memberships and conversations with creators",
  description:
    "A membership platform where creators share exclusive content, memberships and conversations with the fans who follow them. Joining is by invitation.",
  /** Wordmark letters, rendered in Bodoni capitals. */
  wordmark: { text: "DIVA FANS" },
  /**
   * Approved logo art, on pure black (not transparent): render with the `logo-art` utility.
   * `logo` is the full lockup with its empty margin trimmed; `monogram` is the DF mark cropped from it.
   * Both derive from public/images/brand/diva-fans-logo.png (see docs/ASSETS.md).
   */
  logo: { src: "/images/brand/diva-fans-logo-trimmed.png", width: 1081, height: 877 },
  monogram: { src: "/images/brand/diva-fans-monogram.png", width: 738, height: 738 },
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
