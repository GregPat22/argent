import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { isSiteIndexable } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return isSiteIndexable() ? [{ url: SITE_URL }] : [];
}
