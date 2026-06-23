import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { SiteHeader } from "@/presentation/components/layout/SiteHeader";
import { SiteFooter } from "@/presentation/components/layout/SiteFooter";
import { PawBackground } from "@/presentation/components/decor/PawBackground";
import { AuthSessionProvider } from "@/presentation/state/AuthSessionProvider";
import { FlagsProvider } from "@/presentation/state/FlagsProvider";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/presentation/state/ThemeProvider";
import { getAllFlags } from "@/server/flags";
import "../globals.css";

/** Pre-render both locales at build time (SSG). */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/** Browser chrome theming (address bar) + declared color scheme. The theme-color
 *  is per scheme so the address bar matches light/dark surfaces. */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fffdfa" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1714" },
  ],
  colorScheme: "light dark",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://meowdecoder.app"),
    title: { default: t("homeTitle"), template: `%s` },
    description: t("homeDescription"),
    applicationName: "MeowDecoder",
    robots: { index: true, follow: true },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "nav" });
  const flags = await getAllFlags();

  return (
    // suppressHydrationWarning: the anti-FOUC script toggles the `.dark` class on
    // <html> before React hydrates, so the class legitimately differs from SSR.
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Apply the theme class before first paint to prevent a flash (FOUC). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh flex flex-col">
        {/* Decorative paw-print backdrop behind every page (fixed, aria-hidden). */}
        <PawBackground />
        <ThemeProvider>
          <NextIntlClientProvider>
            <AuthSessionProvider>
              <FlagsProvider
                flags={{
                  premiumEnabled: flags["premium.enabled"],
                  audioDonationEnabled: flags["audioDonation.enabled"],
                }}
              >
                <a href="#main" className="skip-link">
                  {t("skipToContent")}
                </a>
                <SiteHeader />
                {/* No ad rails here: the landing and content pages stay ad-free.
                    Ad rails are added only on tool surfaces (analyze, history) via
                    <AdRailsLayout>. */}
                <main id="main" className="flex-1">
                  {children}
                </main>
                <SiteFooter />
              </FlagsProvider>
            </AuthSessionProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
