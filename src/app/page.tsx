import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { homeJsonLd, socialOpenGraph } from "@/config/seo";
import { Closing } from "@/components/home/Closing";
import { Discover } from "@/components/home/Discover";
import { Faq } from "@/components/home/Faq";
import { ForCreators } from "@/components/home/ForCreators";
import { Hero } from "@/components/home/Hero";
import { HowItWorks } from "@/components/home/HowItWorks";
import { Memberships } from "@/components/home/Memberships";
import { Privacy } from "@/components/home/Privacy";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";

// Resolved against metadataBase, so tracking parameters (?utm_…, ?fbclid…) never reach the canonical.
export const metadata: Metadata = { alternates: { canonical: `${brand.siteUrl}/` }, openGraph: { ...socialOpenGraph, url: `${brand.siteUrl}/` } };

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        // Static, server-built JSON; "<" is escaped so the data can't close the tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd).replace(/</g, "\\u003c") }}
      />
      <SiteHeader overlay />
      <main id="main" tabIndex={-1} className="outline-none">
        <span id="top" />
        <Hero />
        <Discover />
        <HowItWorks />
        <Memberships />
        <ForCreators />
        <Privacy />
        <Faq />
        <Closing />
      </main>
      <SiteFooter />
    </>
  );
}
