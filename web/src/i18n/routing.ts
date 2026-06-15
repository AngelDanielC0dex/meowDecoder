import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["es", "en"],
  defaultLocale: "es",
  // Always prefix (/es, /en): one canonical URL shape, unambiguous hreflang.
  localePrefix: "always",
});

export type AppLocale = (typeof routing.locales)[number];
