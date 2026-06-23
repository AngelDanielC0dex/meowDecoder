import { getTranslations, getLocale } from "next-intl/server";
import { CAT_CARE_TIPS } from "@/content/cat-care-tips";
import type { AppLocale } from "@/i18n/routing";

/**
 * Six important cat-care safety facts (toxic foods, lethal meds…), shown on the
 * Vaccination page. Server component, zero client JS; content + severity color
 * come from content/cat-care-tips.ts.
 */
export async function CatCareTips() {
  const t = await getTranslations("medical");
  const locale = (await getLocale()) as AppLocale;

  return (
    <section aria-labelledby="care-tips-heading" className="mt-12 border-t border-brand-100 pt-8">
      <h2 id="care-tips-heading" className="mb-1 text-title font-bold">
        {t("tipsTitle")}
      </h2>
      <p className="mb-6 text-ink-600">{t("tipsSubtitle")}</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {CAT_CARE_TIPS.map((tip) => (
          <li
            key={tip.id}
            className={`rounded-xl border p-4 ${
              tip.severity === "danger"
                ? "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/30"
                : "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30"
            }`}
          >
            <p className="flex items-center gap-2 font-semibold text-ink-900">
              <span aria-hidden="true" className="text-xl">
                {tip.emoji}
              </span>
              {tip.title[locale]}
            </p>
            <p className="mt-1 text-sm text-ink-600">{tip.body[locale]}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
