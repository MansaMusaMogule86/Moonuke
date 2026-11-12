import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Bodoni_Moda, Jost } from "next/font/google";
import { Providers } from "@/components/Providers";
import { brand, pageTitle } from "@/config/brand";
import { socialOpenGraph, socialTwitter } from "@/config/seo";
import { env, isIndexable } from "@/server/env";
import "./globals.css";

const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500"],
  variable: "--font-bodoni",
  display: "swap",
});

const jost = Jost({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-jost",
  display: "swap",
});

export function generateMetadata(): Metadata {
  const google = env().GOOGLE_SITE_VERIFICATION;
  return {
    // Absolute URLs (canonical, og:image, og:url) resolve against the public domain in every environment.
    metadataBase: new URL(brand.siteUrl),
    title: { default: pageTitle(), template: `%s | ${brand.name}` },
    description: brand.description,
    robots: isIndexable() ? { index: true, follow: true } : { index: false, follow: false },
    applicationName: brand.name,
    appleWebApp: { title: brand.name },
    openGraph: socialOpenGraph,
    twitter: socialTwitter,
    ...(google && { verification: { google } }),
  };
}

export const viewport: Viewport = {
  themeColor: "#050505",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading request headers makes every page dynamic, which per-request CSP
  // nonces require. Next.js applies the nonce from the CSP header to its scripts.
  await headers();
  return (
    // suppressHydrationWarning: browser extensions and inline pre-hydration scripts
    // add attributes to <html> (e.g. data-* flags) that React would otherwise flag as
    // a hydration mismatch. React keeps the DOM value instead of re-rendering <html>.
    <html lang="en" className={`${bodoni.variable} ${jost.variable}`} suppressHydrationWarning>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-gold focus:px-5 focus:py-3 focus:text-ink"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
