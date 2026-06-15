import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { buildPageMetadata } from "@/lib/seo";
import { AnalyzePanel } from "@/presentation/components/analyze/AnalyzePanel";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    ...buildPageMetadata({
      locale: locale as AppLocale,
      pathWithoutLocale: "/analyze",
      title: t("analyzeTitle"),
      description: t("analyzeDescription"),
    }),
    // The analyzer is an app surface, not a content page: keep it out of the index.
    robots: { index: false, follow: true },
  };
}

export default async function AnalyzePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("analyze");

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-title font-bold">{t("title")}</h1>
      <AnalyzePanel />
    </div>
  );
}
