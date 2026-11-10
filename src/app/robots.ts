import type { MetadataRoute } from "next";
import { appUrl, isIndexable } from "@/server/env";

export const dynamic = "force-dynamic";

/**
 * Previews and local builds: nothing may be crawled.
 * Live site: private pages stay out of search through their own noindex tags
 * (blocking them here would stop crawlers from seeing that tag). Only the API
 * and the single-use token links are blocked outright.
 */
export default function robots(): MetadataRoute.Robots {
  if (!isIndexable()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/invite/", "/reset/"] },
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
