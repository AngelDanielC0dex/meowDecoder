import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { VOCALIZATIONS } from "@/content/vocalizations";

export async function SiteFooter() {
  const t = await getTranslations();
  return (
    <footer className="mt-[var(--spacing-section)] border-t border-brand-100 bg-brand-50/40">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div>
          <p className="font-bold text-brand-700">MeowDecoder</p>
          <p className="mt-2 text-sm text-ink-600">{t("meta.tagline")}</p>
        </div>
        <nav aria-label={t("nav.sounds")}>
          <h2 className="text-sm font-semibold text-ink-900">{t("nav.sounds")}</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {VOCALIZATIONS.map((v) => (
              <li key={v.slug}>
                <Link href={`/sounds/${v.slug}`} className="text-ink-600 hover:text-brand-700">
                  {v.emoji} {v.slug}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="self-end text-xs text-ink-600">
          {t("result.notScience")}
        </p>
      </div>
    </footer>
  );
}
