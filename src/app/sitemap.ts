import type { MetadataRoute } from "next";
import { appUrl, isIndexable } from "@/server/env";

export const dynamic = "force-dynamic";

// The homepage is the only public page; creators and posts are members-only by design.
export default function sitemap(): MetadataRoute.Sitemap {
  return isIndexable() ? [{ url: `${appUrl()}/` }] : [];
}
