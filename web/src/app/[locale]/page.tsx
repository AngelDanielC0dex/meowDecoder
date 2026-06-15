import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing, type AppLocale } from "@/i18n/routing";
import { buildPageMetadata, SITE_URL } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { VOCALIZATIONS } from "@/content/vocalizations";
import { Button } from "@/presentation/components/ui/Button";
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

/**
 * Landing page. Server-rendered, statically generated, ZERO client JS for the
 * content itself — the model and worker never load here. This keeps LCP low
 * and gives crawlers full content without executing scripts.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const appLocale = locale as AppLocale;
  const accountsEnabled = await isEnabled("accounts.enabled");

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

  return (
    <>
      <JsonLd data={webAppLd} />

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-4 py-[var(--spacing-section)] text-center">
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
              <p className="font-semibold text-brand-900">{t("accountCtaTitle")}</p>
              <p className="mt-1 text-ink-600">{t("accountCtaBody")}</p>
              <Link
                href="/auth/signin"
                className="mt-2 inline-block font-medium text-brand-700 hover:underline"
              >
                {t("accountCtaLink")} →
              </Link>
            </div>
          )}
        </div>
        <p className="mt-4 text-sm text-ink-600">🔒 {t("privacyNote")}</p>
      </section>

      {/* How it works */}
      <section id="how" className="bg-brand-50/40 py-[var(--spacing-section)]">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-title font-bold text-center">{t("howItWorksTitle")}</h2>
          <ol className="mt-10 grid gap-6 sm:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <li key={n} className="rounded-2xl bg-surface p-6 shadow-sm">
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
      <section className="mx-auto max-w-5xl px-4 py-[var(--spacing-section)]">
        <h2 className="text-title font-bold">{t("soundsTitle")}</h2>
        <p className="mt-2 text-ink-600">{t("soundsSubtitle")}</p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {VOCALIZATIONS.map((v) => (
            <li key={v.slug}>
              <Link
                href={`/sounds/${v.slug}`}
                className="block h-full rounded-2xl border border-brand-100 p-5 transition-colors hover:border-brand-500 hover:bg-brand-50"
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
      </section>

      {/* Science / transparency */}
      <section className="bg-ink-900 py-[var(--spacing-section)] text-white">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-title font-bold">{t("scienceTitle")}</h2>
          <p className="mt-4 text-pretty leading-relaxed text-brand-50">{t("scienceBody")}</p>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-3xl px-4 py-[var(--spacing-section)] text-center">
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
