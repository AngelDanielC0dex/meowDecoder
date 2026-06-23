import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Keep user-data and API surfaces out of crawlers.
      disallow: [
        "/api/",
        "/*/analyze",
        "/*/cats",
        "/*/history",
        "/*/medical",
        "/*/cards",
        "/*/admin",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
