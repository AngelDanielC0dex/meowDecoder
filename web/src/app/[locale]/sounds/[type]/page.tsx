import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing, type AppLocale } from "@/i18n/routing";
import { buildPageMetadata, SITE_URL } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { VOCALIZATIONS, getVocalization } from "@/content/vocalizations";
import { Button } from "@/presentation/components/ui/Button";

/** Pre-render every (locale × vocalization) page at build time. */
export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    VOCALIZATIONS.map((v) => ({ locale, type: v.slug })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; type: string }>;
}): Promise<Metadata> {
  const { locale, type } = await params;
  const voc = getVocalization(type);
  if (!voc) return {};
  const i18n = voc.i18n[locale as AppLocale];
  return buildPageMetadata({
    locale: locale as AppLocale,
    pathWithoutLocale: `/sounds/${type}`,
    title: `${i18n.name} — MeowDecoder`,
    description: i18n.shortMeaning,
    ogType: "article",
  });
}

/**
 * Programmatic SEO page. NOT thin content: each page is unique, curated, and
 * sourced from the typed knowledge base (single source of truth shared with
 * the result UI). Includes FAQ, breadcrumbs and internal links — real value,
 * no combinatorial filler.
 */
export default async function SoundPage({
  params,
}: {
  params: Promise<{ locale: string; type: string }>;
}) {
  const { locale, type } = await params;
  setRequestLocale(locale);
  const voc = getVocalization(type);
  if (!voc) notFound();
  const appLocale = locale as AppLocale;
  const i18n = voc.i18n[appLocale];
  const t = await getTranslations("nav");

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "MeowDecoder", item: `${SITE_URL}/${locale}` },
      {
        "@type": "ListItem",
        position: 2,
        name: i18n.name,
        item: `${SITE_URL}/${locale}/sounds/${type}`,
      },
    ],
  };

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: i18n.faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const others = VOCALIZATIONS.filter((v) => v.slug !== voc.slug);

  return (
    <>
      <JsonLd data={breadcrumbLd} />
      <JsonLd data={faqLd} />

      <div className="mx-auto max-w-3xl px-4 py-10">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-ink-600">
          <ol className="flex gap-2">
            <li>
              <Link href="/" className="hover:text-brand-700">
                {t("home")}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-ink-900">
              {i18n.name}
            </li>
          </ol>
        </nav>

        <article>
          <header>
            <span aria-hidden="true" className="text-5xl">
              {voc.emoji}
            </span>
            <h1 className="mt-3 text-display font-extrabold">{i18n.name}</h1>
            <p className="mt-3 text-subtitle text-ink-600">{i18n.shortMeaning}</p>
          </header>

          <section className="mt-8">
            <p className="leading-relaxed text-ink-900">{i18n.description}</p>
          </section>

          <section className="mt-8" aria-labelledby="contexts">
            <h2 id="contexts" className="text-title font-bold">
              {appLocale === "es" ? "Contextos habituales" : "Common contexts"}
            </h2>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {i18n.contexts.map((c) => (
                <li
                  key={c}
                  className="rounded-lg border border-brand-100 px-4 py-3 text-ink-900"
                >
                  {c}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-10" aria-labelledby="faq">
            <h2 id="faq" className="text-title font-bold">
              {appLocale === "es" ? "Preguntas frecuentes" : "Frequently asked questions"}
            </h2>
            <dl className="mt-4 space-y-4">
              {i18n.faqs.map((f) => (
                <div key={f.q} className="rounded-xl border border-brand-100 p-4">
                  <dt className="font-semibold">{f.q}</dt>
                  <dd className="mt-2 text-ink-600">{f.a}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="mt-10 rounded-2xl bg-brand-50 p-6 text-center">
            <h2 className="text-lg font-semibold">
              {appLocale === "es"
                ? `¿Tu gato hace este sonido?`
                : `Does your cat make this sound?`}
            </h2>
            <Link href="/analyze" className="mt-4 inline-block">
              <Button size="lg">🎙️ {appLocale === "es" ? "Analízalo ahora" : "Analyze it now"}</Button>
            </Link>
          </section>

          <nav aria-label={t("sounds")} className="mt-10">
            <h2 className="text-sm font-semibold text-ink-900">
              {appLocale === "es" ? "Otras vocalizaciones" : "Other vocalizations"}
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {others.map((v) => (
                <li key={v.slug}>
                  <Link
                    href={`/sounds/${v.slug}`}
                    className="rounded-full border border-brand-100 px-4 py-2 text-sm hover:border-brand-500"
                  >
                    {v.emoji} {v.i18n[appLocale].name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </article>
      </div>
    </>
  );
}
