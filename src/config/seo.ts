import type { Metadata } from "next";
import { brand, pageTitle } from "@/config/brand";

/**
 * Shared social metadata. Next.js replaces (does not merge) a parent's
 * openGraph/twitter when a page sets its own, so pages spread these.
 */
const title = pageTitle();

export const socialOpenGraph = {
  type: "website",
  siteName: brand.name,
  locale: "en_US",
  title,
  description: brand.description,
  images: [brand.ogImage],
} satisfies NonNullable<Metadata["openGraph"]>;

export const socialTwitter = {
  card: "summary_large_image",
  title,
  description: brand.description,
  images: [{ url: brand.ogImage.url, alt: brand.ogImage.alt }],
} satisfies NonNullable<Metadata["twitter"]>;

/** Homepage structured data: the organisation and the website. */
export const homeJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${brand.siteUrl}/#organization`, name: brand.name, url: `${brand.siteUrl}/`, logo: `${brand.siteUrl}/icons/icon-512.png` },
    { "@type": "WebSite", "@id": `${brand.siteUrl}/#website`, name: brand.name, url: `${brand.siteUrl}/`, description: brand.description, publisher: { "@id": `${brand.siteUrl}/#organization` } },
  ],
};
