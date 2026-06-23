import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing, type AppLocale } from "@/i18n/routing";
import { buildPageMetadata, SITE_URL } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { VOCALIZATIONS } from "@/content/vocalizations";
import { FAQ } from "@/content/faq";
import { Button } from "@/presentation/components/ui/Button";
import { PremiumPlans } from "@/presentation/components/premium/PremiumPlans";
import { FreeTiers } from "@/presentation/components/home/FreeTiers";
import { SectionDots } from "@/presentation/components/home/SectionDots";
import { CatFace } from "@/presentation/components/decor/CatFace";
import { RopeCat } from "@/presentation/components/decor/RopeCat";
import { isEnabled } from "@/server/flags";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return buildPageMetadata({
    locale: locale as AppLocale,
    pathWithoutLocale: "/",
    title: t("homeTitle"),
    description: t("homeDescription"),
  });
}

/** Shared shape for the landing's full-height, scroll-snapping sections.
 *  `min-h-[100svh]` (small-viewport height) keeps each section a full screen on
 *  mobile without the URL-bar jump; `snap-start` opts the section into the gentle
 *  (proximity) snap declared on <html>; tall content (the sounds grid, FAQ) can
 *  still overflow naturally because it is a min-height, not a fixed height. */
const SECTION = "flex min-h-[calc(100svh_-_var(--header-h))] snap-start flex-col justify-center";

/**
 * Landing page. Server-rendered, statically generated, ZERO client JS for the
 * content itself — the model and worker never load here. This keeps LCP low
 * and gives crawlers full content without executing scripts. The only client
 * island is the decorative <SectionDots> navigator.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const appLocale = locale as AppLocale;
  const accountsEnabled = await isEnabled("accounts.enabled");
  // The landing changes shape with the premium switch: premium showcase when on,
  // a free-focused tier comparison when off (the default until Stripe is wired).
  const premiumEnabled = await isEnabled("premium.enabled");

  const webAppLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "MeowDecoder",
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Web",
    url: `${SITE_URL}/${locale}`,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    description: t("heroSubtitle"),
  };

  const organizationLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "MeowDecoder",
    url: SITE_URL,
    logo: `${SITE_URL}/icon`,
  };

  const websiteLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "MeowDecoder",
    url: `${SITE_URL}/${locale}`,
    inLanguage: locale,
  };

  const faqItems = FAQ[appLocale];
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };

  return (
    <>
      <JsonLd data={webAppLd} />
      <JsonLd data={organizationLd} />
      <JsonLd data={websiteLd} />
      <JsonLd data={faqLd} />

      <SectionDots />
      <RopeCat />

      {/* Hero */}
      <section id="hero" className={`relative overflow-hidden ${SECTION}`}>
        <div aria-hidden="true" className="hero-glow absolute inset-0 -z-10" />
        <div className="mx-auto max-w-4xl px-4 py-12 text-center">
          <div className="mb-8 flex justify-center">
            <CatFace sizePx={148} />
          </div>
          <h1 className="text-display font-extrabold tracking-tight text-balance">
            {t("heroTitle")}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-subtitle text-ink-600 text-pretty">
            {t("heroSubtitle")}
          </p>
          <div className="mt-8 flex flex-col items-center gap-4">
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/analyze">
                <Button size="lg">🎙️ {t("ctaPrimary")}</Button>
              </Link>
              <a href="#how">
                <Button size="lg" variant="secondary">
                  {t("ctaSecondary")}
                </Button>
              </a>
            </div>
            {accountsEnabled && (
              <div className="mt-4 max-w-md rounded-xl bg-brand-100/50 p-4 border border-brand-200 text-sm">
                <p className="font-semibold text-brand-900 dark:text-brand-200">{t("accountCtaTitle")}</p>
                <p className="mt-1 text-ink-600">{t("accountCtaBody")}</p>
                <Link
                  href="/auth/signin"
                  className="mt-2 inline-block font-medium text-brand-700 hover:underline dark:text-brand-300"
                >
                  {t("accountCtaLink")} →
                </Link>
              </div>
            )}
          </div>
          <p className="mt-4 text-sm text-ink-600">🔒 {t("privacyNote")}</p>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className={`border-y border-brand-100 bg-brand-50/40 ${SECTION}`}>
        <div className="mx-auto w-full max-w-5xl px-4 py-12">
          <h2 className="text-title font-bold text-center">{t("howItWorksTitle")}</h2>
          <ol className="mt-10 grid gap-6 sm:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <li
                key={n}
                className="interactive rounded-2xl border border-transparent bg-surface p-6 shadow-sm"
              >
                <span
                  aria-hidden="true"
                  className="flex size-10 items-center justify-center rounded-full bg-brand-600 font-bold text-white"
                >
                  {n}
                </span>
                <h3 className="mt-4 text-lg font-semibold">{t(`step${n}Title`)}</h3>
                <p className="mt-2 text-ink-600">{t(`step${n}Body`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Sounds */}
      <section id="sounds" className={`mx-auto w-full max-w-6xl px-4 ${SECTION}`}>
        <div className="py-12">
          <h2 className="text-title font-bold">{t("soundsTitle")}</h2>
          <p className="mt-2 text-ink-600">{t("soundsSubtitle")}</p>
          {/* 1 → 2 → 3 → 4 columns: the 10-sound grid uses wide screens better. */}
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {VOCALIZATIONS.map((v) => (
              <li key={v.slug}>
                <Link
                  href={`/sounds/${v.slug}`}
                  className="interactive block h-full rounded-2xl border border-brand-100 p-5 hover:border-brand-400 hover:bg-brand-50/60"
                >
                  <span aria-hidden="true" className="text-3xl">
                    {v.emoji}
                  </span>
                  <h3 className="mt-3 text-lg font-semibold">{v.i18n[appLocale].name}</h3>
                  <p className="mt-1 text-sm text-ink-600">{v.i18n[appLocale].shortMeaning}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Monetization section, ad-free (marketing, not an ad): the premium
          showcase when premium is enabled, otherwise the free-tier comparison. */}
      <div id="plans" className={SECTION}>
        {premiumEnabled ? (
          <PremiumPlans locale={appLocale} />
        ) : (
          <FreeTiers accountsEnabled={accountsEnabled} />
        )}
      </div>

      {/* Science / transparency — an intentionally dark band in BOTH themes, so
          it uses constant colors (not the theme tokens, which would invert). */}
      <section
        id="science"
        className={`border-t border-white/10 bg-[#1c1917] text-white ${SECTION}`}
      >
        <div className="mx-auto w-full max-w-3xl px-4 py-12">
          <h2 className="text-title font-bold">{t("scienceTitle")}</h2>
          <p className="mt-4 text-pretty leading-relaxed text-stone-200">{t("scienceBody")}</p>
        </div>
      </section>

      {/* FAQ — native <details> accordion: accessible, zero client JS, and the
          same copy feeds the FAQPage JSON-LD above (single source). */}
      <section
        id="faq"
        aria-labelledby="faq-heading"
        className={`mx-auto w-full max-w-3xl px-4 ${SECTION}`}
      >
        <div className="py-12">
          <h2 id="faq-heading" className="text-title font-bold">
            {t("faqTitle")}
          </h2>
          <div className="mt-8 flex flex-col gap-3">
            {faqItems.map((f) => (
              <details
                key={f.question}
                className="rounded-xl border border-brand-100 bg-surface p-4 open:bg-brand-50/40"
              >
                <summary className="cursor-pointer list-none font-semibold text-ink-900 marker:hidden">
                  {f.question}
                </summary>
                <p className="mt-2 text-ink-600">{f.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="cta" className={`mx-auto w-full max-w-3xl px-4 text-center ${SECTION}`}>
        <Link href="/analyze">
          <Button size="lg">🐾 {t("ctaPrimary")}</Button>
        </Link>
      </section>
    </>
  );
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}
