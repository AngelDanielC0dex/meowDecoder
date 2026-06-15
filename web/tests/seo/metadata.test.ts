import { describe, it, expect } from "vitest";
import { buildPageMetadata, SITE_URL } from "@/lib/seo";
import { routing } from "@/i18n/routing";

/**
 * Guards the SEO regression that previously pointed every page's canonical at
 * the default locale (de-indexing risk for non-default languages).
 * The canonical MUST be self-referential per locale, and x-default MUST exist.
 */
const PUBLIC_PATHS = ["/", "/sounds/meow", "/sounds/purr"];

describe("SEO metadata alternates", () => {
  for (const locale of routing.locales) {
    for (const path of PUBLIC_PATHS) {
      it(`canonical is self-referential for ${locale} ${path}`, () => {
        const meta = buildPageMetadata({
          locale,
          pathWithoutLocale: path,
          title: "t",
          description: "d",
        });
        const clean = path === "/" ? "" : path;
        const expected = `${SITE_URL}/${locale}${clean}`;
        expect(meta.alternates?.canonical).toBe(expected);
      });

      it(`x-default and both locales are declared for ${locale} ${path}`, () => {
        const meta = buildPageMetadata({
          locale,
          pathWithoutLocale: path,
          title: "t",
          description: "d",
        });
        const langs = meta.alternates?.languages ?? {};
        expect(langs["x-default"]).toBeDefined();
        for (const l of routing.locales) {
          expect(langs[l]).toBeDefined();
        }
      });
    }
  }
});
