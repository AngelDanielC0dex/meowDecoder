import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { routing, type AppLocale } from "@/i18n/routing";
import { getLegalDoc } from "@/content/legal";
import { buildAlternates, SITE_URL } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";

type DocKind = "terms" | "privacy";
const KINDS: DocKind[] = ["terms", "privacy"];

/** Pre-render terms/privacy for both locales (SSG). */
export function generateStaticParams() {
  return routing.locales.flatMap((locale) => KINDS.map((doc) => ({ locale, doc })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; doc: string }>;
}): Promise<Metadata> {
  const { locale, doc } = await params;
  if (!KINDS.includes(doc as DocKind)) return {};
  const d = getLegalDoc(doc as DocKind, locale as AppLocale);
  return {
    title: `${d.title} — MeowDecoder`,
    description: d.intro,
    alternates: buildAlternates(`/legal/${doc}`, locale as AppLocale),
  };
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ locale: string; doc: string }>;
}) {
  const { locale, doc } = await params;
  if (!KINDS.includes(doc as DocKind)) notFound();
  setRequestLocale(locale);
  const d = getLegalDoc(doc as DocKind, locale as AppLocale);

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "MeowDecoder", item: `${SITE_URL}/${locale}` },
      { "@type": "ListItem", position: 2, name: d.title, item: `${SITE_URL}/${locale}/legal/${doc}` },
    ],
  };

  return (
    <article className="mx-auto max-w-2xl px-4 py-10">
      <JsonLd data={breadcrumbLd} />
      <h1 className="text-title font-bold">{d.title}</h1>
      <p className="mt-1 text-sm text-ink-600">
        {locale === "es" ? "Última actualización" : "Last updated"}: {d.updated}
      </p>
      <p className="mt-4 text-ink-700">{d.intro}</p>
      <div className="mt-8 flex flex-col gap-6">
        {d.sections.map((s) => (
          <section key={s.heading}>
            <h2 className="text-lg font-semibold text-ink-900">{s.heading}</h2>
            {s.body.map((p, i) => (
              <p key={i} className="mt-2 text-ink-700">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>
    </article>
  );
}
