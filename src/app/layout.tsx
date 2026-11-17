import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import { Providers } from "@/components/Providers";
import { brand, pageTitle } from "@/config/brand";
import { socialOpenGraph, socialTwitter } from "@/config/seo";
import { localeDirection } from "@/lib/i18n";
import { getLocaleCookie } from "@/server/auth/request";
import { env, isIndexable } from "@/server/env";
import "./globals.css";

// Brand fonts self-hosted (OFL: Bodoni Moda + Jost, latin subsets) so the
// production build never downloads at build time. Same families, weights,
// and CSS variables as the previous next/font/google setup.
const bodoni = localFont({
  src: [
    { path: "./fonts/bodoni-normal-400-latin.woff2", weight: "400", style: "normal" },
    { path: "./fonts/bodoni-normal-500-latin.woff2", weight: "500", style: "normal" },
    { path: "./fonts/bodoni-italic-400-latin.woff2", weight: "400", style: "italic" },
    { path: "./fonts/bodoni-italic-500-latin.woff2", weight: "500", style: "italic" },
  ],
  variable: "--font-bodoni",
  display: "swap",
});

const jost = localFont({
  src: [
    { path: "./fonts/jost-normal-300-latin.woff2", weight: "300", style: "normal" },
    { path: "./fonts/jost-normal-400-latin.woff2", weight: "400", style: "normal" },
    { path: "./fonts/jost-normal-500-latin.woff2", weight: "500", style: "normal" },
  ],
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
  themeColor: "#080709",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading request headers makes every page dynamic, which per-request CSP
  // nonces require. Next.js applies the nonce from the CSP header to its scripts.
  await headers();
  const locale = await getLocaleCookie();
  return (
    // suppressHydrationWarning: browser extensions and inline pre-hydration scripts
    // add attributes to <html> and <body> (e.g. Grammarly's data-gr-* flags,
    // data-trendtrack-*) that React would otherwise flag as a hydration mismatch.
    // It applies one level deep, so it is needed on both elements; React keeps the
    // DOM value instead of re-rendering them.
    <html lang={locale} dir={localeDirection(locale)} className={`${bodoni.variable} ${jost.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
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
