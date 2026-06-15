import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { VOCALIZATIONS } from "@/content/vocalizations";
import { SITE_URL } from "@/lib/seo";

/**
 * Sitemap with per-URL hreflang alternates (Google's recommended way to
 * declare localized variants). Only public, indexable pages are listed —
 * app surfaces (analyze/cats/history) are intentionally excluded.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const publicPaths = ["", ...VOCALIZATIONS.map((v) => `/sounds/${v.slug}`)];

  return publicPaths.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: `${SITE_URL}/${locale}${path}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: path === "" ? 1 : 0.7,
      alternates: {
        languages: {
          ...Object.fromEntries(
            routing.locales.map((l) => [l, `${SITE_URL}/${l}${path}`]),
          ),
          "x-default": `${SITE_URL}/${routing.defaultLocale}${path}`,
        },
      },
    })),
  );
}
