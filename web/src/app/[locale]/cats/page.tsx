import { getTranslations, setRequestLocale } from "next-intl/server";
import { CatManager } from "@/presentation/components/cats/CatManager";

// App surface — not indexed (handled globally; this page holds user data only).
export const metadata = { robots: { index: false, follow: false } };

export default async function CatsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("cats");
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-title font-bold">{t("title")}</h1>
      <CatManager />
    </div>
  );
}
