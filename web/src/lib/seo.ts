import type { Metadata } from "next";
import { routing, type AppLocale } from "@/i18n/routing";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://meowdecoder.app";

/**
 * Builds canonical + hreflang alternates for a localized path.
 *
 * The canonical is ALWAYS self-referential to the current locale — every
 * localized page is its own canonical, never a duplicate of another language.
 * (A previous version pointed every canonical at the default locale, which
 * told crawlers that /en/* duplicated /es/* and risked de-indexing English.)
 */
export function buildAlternates(
  pathWithoutLocale: string,
  locale: AppLocale,
): Metadata["alternates"] {
  const clean = pathWithoutLocale === "/" ? "" : pathWithoutLocale;
  const languages: Record<string, string> = {};
  for (const l of routing.locales) {
    languages[l] = `${SITE_URL}/${l}${clean}`;
  }
  languages["x-default"] = `${SITE_URL}/${routing.defaultLocale}${clean}`;
  return {
    canonical: `${SITE_URL}/${locale}${clean}`,
    languages,
  };
}

interface PageMetaInput {
  locale: AppLocale;
  pathWithoutLocale: string;
  title: string;
  description: string;
  ogType?: "website" | "article";
}

export function buildPageMetadata(input: PageMetaInput): Metadata {
  const url = `${SITE_URL}/${input.locale}${input.pathWithoutLocale === "/" ? "" : input.pathWithoutLocale}`;
  return {
    title: input.title,
    description: input.description,
    alternates: buildAlternates(input.pathWithoutLocale, input.locale),
    openGraph: {
      type: input.ogType ?? "website",
      title: input.title,
      description: input.description,
      url,
      siteName: "MeowDecoder",
      locale: input.locale,
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
    },
  };
}
