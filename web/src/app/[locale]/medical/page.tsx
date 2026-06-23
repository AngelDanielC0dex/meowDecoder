import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { buildPageMetadata } from "@/lib/seo";
import { VaccineChecklist } from "@/presentation/components/medical/VaccineChecklist";
import { CatCareTips } from "@/presentation/components/medical/CatCareTips";
import { AssistantChat } from "@/presentation/components/assistant/AssistantChat";
import { AdRailsLayout } from "@/presentation/components/ads/AdRailsLayout";
import { isEnabled } from "@/server/flags";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "medical" });
  return {
    ...buildPageMetadata({
      locale: locale as AppLocale,
      pathWithoutLocale: "/medical",
      title: `${t("title")} — MeowDecoder`,
      description: t("subtitle"),
    }),
    robots: { index: false, follow: false },
  };
}

export default async function MedicalPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("medical");
  // Medical log is registered-tier; the AI assistant on top of it stays premium,
  // so it only appears when the premium system is enabled.
  const premiumEnabled = await isEnabled("premium.enabled");
  return (
    <AdRailsLayout>
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="mb-1 text-title font-bold">{t("title")}</h1>
        <p className="mb-6 text-ink-600">{t("subtitle")}</p>
        <VaccineChecklist />

        <CatCareTips />

        {premiumEnabled && (
          <section aria-labelledby="medical-assistant" className="mt-12 border-t border-brand-100 pt-8">
            <h2 id="medical-assistant" className="mb-1 text-title font-bold">
              {t("assistantTitle")}
            </h2>
            <p className="mb-6 text-ink-600">{t("assistantSubtitle")}</p>
            <AssistantChat lockedMode="medical" />
          </section>
        )}
      </div>
    </AdRailsLayout>
  );
}
