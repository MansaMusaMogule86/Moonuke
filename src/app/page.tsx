import { Circle } from "@/components/home/Circle";
import { Closing } from "@/components/home/Closing";
import { ForCreators } from "@/components/home/ForCreators";
import { Hero } from "@/components/home/Hero";
import { Privacy } from "@/components/home/Privacy";
import { Ribbon } from "@/components/home/Ribbon";
import { Tiers } from "@/components/home/Tiers";
import { Vault } from "@/components/home/Vault";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import type { Metadata } from "next";

// Resolved against metadataBase, so tracking parameters (?utm_…, ?fbclid…) never reach the canonical.
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="outline-none">
        <span id="top" />
        <Hero />
        <Ribbon />
        <Circle />
        <Tiers />
        <Vault />
        <Privacy />
        <ForCreators />
        <Closing />
      </main>
      <SiteFooter />
    </>
  );
}
