/**
 * Single source of truth for the product's identity.
 * To rebrand, change this file (and the logo files under public/images/brand,
 * plus the app icons in src/app, if the mark changes). Nothing else in the app should
 * hard-code the name, domain, or sender identity.
 */
export const brand = {
  /** Display name used in prose, titles and emails. */
  name: "DivaFans",
  /** Short descriptor that follows the name in the homepage title. */
  descriptor: "Your World. Your Fans. Your Rules.",
  tagline: "Exclusive content, memberships and conversations with creators",
  /** Meta and social description. */
  description: "Exclusive content. Real connections. A private world for creators and their fans.",
  /**
   * Public canonical origin for SEO and social metadata (metadataBase, canonical,
   * robots, sitemap). Operational links (invitations, emails) use APP_URL instead.
   */
  siteUrl: "https://www.divafans.io",
  /** Social preview card (public/og-divafans.jpg). */
  ogImage: { url: "/og-divafans.jpg", width: 1200, height: 630, type: "image/jpeg", alt: "DivaFans — Your World. Your Fans. Your Rules." },
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
  emailSenderName: "DivaFans",
  /**
   * Issuer label shown in authenticator apps for new MFA enrolments.
   * It is a label only: existing enrolments keep their old label and their codes still work.
   */
  mfaIssuer: "DivaFans",
  /** Prefix for cookie and storage keys. Kept from the old name: changing it signs everyone out. */
  cookiePrefix: "mk",
} as const;

export const pageTitle = (page?: string) => (page ? `${page} | ${brand.name}` : `${brand.name} | ${brand.descriptor}`);
