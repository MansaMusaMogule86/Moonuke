import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Bodoni_Moda, Jost } from "next/font/google";
import { Providers } from "@/components/Providers";
import { brand, pageTitle } from "@/config/brand";
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

export const metadata: Metadata = {
  title: { default: pageTitle(), template: `%s · ${brand.name}` },
  description:
    `${brand.name} is ${brand.description.charAt(0).toLowerCase()}${brand.description.slice(1)}`,
  robots: { index: true, follow: true },
  openGraph: { title: brand.name, description: brand.descriptor, type: "website" },
};

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
    <html lang="en" className={`${bodoni.variable} ${jost.variable}`}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-gold focus:px-5 focus:py-3 focus:text-ink"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
        <div aria-hidden className="mk-film" />
      </body>
    </html>
  );
}
