import type { MetadataRoute } from "next";
import { brand } from "@/config/brand";
import { isIndexable } from "@/server/env";

export const dynamic = "force-dynamic";

// The homepage is the only public page; creators and posts are members-only by design.
export default function sitemap(): MetadataRoute.Sitemap {
  return isIndexable() ? [{ url: `${brand.siteUrl}/` }] : [];
}
