import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { isSiteIndexable } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    // Allow crawlers to read preview pages' noindex metadata, too.
    rules: { userAgent: "*", allow: "/" },
    ...(isSiteIndexable()
      ? { sitemap: new URL("sitemap.xml", SITE_URL).href }
      : {}),
  };
}
