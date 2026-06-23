import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { buildPageMetadata } from "@/lib/seo";
import { CardDesigner } from "@/presentation/components/cards/CardDesigner";
import { AdRailsLayout } from "@/presentation/components/ads/AdRailsLayout";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "cards" });
  return {
    ...buildPageMetadata({
      locale: locale as AppLocale,
      pathWithoutLocale: "/cards",
      title: `${t("title")} — MeowDecoder`,
      description: t("subtitle"),
    }),
    // Private, per-user tool: useful title/sharing metadata, but not indexed.
    robots: { index: false, follow: false },
  };
}

export default async function CardsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("cards");
  return (
    <AdRailsLayout>
      <div className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="mb-1 text-title font-bold">{t("title")}</h1>
        <p className="mb-6 text-ink-600">{t("subtitle")}</p>
        <CardDesigner />
      </div>
    </AdRailsLayout>
  );
}
