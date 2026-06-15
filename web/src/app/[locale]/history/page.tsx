import { getTranslations, setRequestLocale } from "next-intl/server";
import { HistoryList } from "@/presentation/components/history/HistoryList";

export const metadata = { robots: { index: false, follow: false } };

export default async function HistoryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("history");
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-title font-bold">{t("title")}</h1>
      <HistoryList />
    </div>
  );
}
