import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { decodeCardShare } from "@/domain/cat/card-share";
import { PublicCardView } from "@/presentation/components/cards/PublicCardView";

type Params = { params: Promise<{ locale: string }>; searchParams: Promise<{ d?: string }> };

export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const { locale } = await params;
  const { d } = await searchParams;
  const payload = typeof d === "string" ? decodeCardShare(d) : null;
  const t = await getTranslations({ locale, namespace: "cards" });
  return {
    title: payload ? `${payload.n} — MeowDecoder` : t("title"),
    // Shareable but ephemeral per-user data: NOT in robots.txt so social crawlers
    // can read the link preview, but noindex so it never lands in search.
    robots: { index: false, follow: false },
  };
}

export default async function PublicCardPage({ params, searchParams }: Params) {
  const { locale } = await params;
  const { d } = await searchParams;
  setRequestLocale(locale);
  const payload = typeof d === "string" ? decodeCardShare(d) : null;
  const t = await getTranslations("cards");

  if (!payload) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-5xl" aria-hidden="true">🐱</p>
        <h1 className="mt-3 text-title font-bold">{t("invalidShareTitle")}</h1>
        <p className="mt-2 text-ink-600">{t("invalidShareBody")}</p>
        <Link
          href="/cards"
          className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-5 font-semibold text-white"
        >
          {t("makeYours")}
        </Link>
      </div>
    );
  }

  return <PublicCardView payload={payload} />;
}
