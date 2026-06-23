import { getTranslations, setRequestLocale } from "next-intl/server";
import { HistoryList } from "@/presentation/components/history/HistoryList";
import { AssistantChat } from "@/presentation/components/assistant/AssistantChat";
import { AdRailsLayout } from "@/presentation/components/ads/AdRailsLayout";
import { isEnabled } from "@/server/flags";

export const metadata = { robots: { index: false, follow: false } };

export default async function HistoryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("history");
  // The AI assistant only exists when the premium system is on; otherwise the
  // chatbot is not rendered at all (registered users still get full history).
  const premiumEnabled = await isEnabled("premium.enabled");
  return (
    <AdRailsLayout>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="mb-6 text-title font-bold">{t("title")}</h1>
        <HistoryList />

        {premiumEnabled && (
          <section aria-labelledby="history-assistant" className="mt-12 border-t border-brand-100 pt-8">
            <h2 id="history-assistant" className="mb-1 text-title font-bold">
              {t("assistantTitle")}
            </h2>
            <p className="mb-6 text-ink-600">{t("assistantSubtitle")}</p>
            <AssistantChat lockedMode="meow" />
          </section>
        )}
      </div>
    </AdRailsLayout>
  );
}
