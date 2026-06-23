"use client";

import { useTranslations } from "next-intl";
import type { EmotionalState } from "@/content/state-phrases";
import { STATE_TO_AD_CATEGORY, type AdCategory } from "@/content/state-phrases";
import { usePremium } from "@/presentation/hooks/usePremium";

/**
 * Contextual affiliate slot — honest by construction:
 *  - Ads are grouped into 3 macro-categories (wellbeing, alert, natural),
 *    never personalized to individual emotional states.
 *  - Alert-category ads (pain/fight/warning) prioritize veterinary services
 *    and pet insurance — never exploit distress.
 *  - All copy comes from i18n (`ads` namespace), never hardcoded per language.
 *  - No dead links: the CTA only renders when a real affiliate `href` is passed.
 *  - Toggleable via NEXT_PUBLIC_ADS_ENABLED ("false" disables it everywhere).
 *  - Clearly labeled "sponsored" and marked rel="sponsored" for crawlers.
 */
const CATEGORY_EMOJI: Record<AdCategory, string> = {
  wellbeing: "🐱",
  alert: "🩺",
  natural: "📚",
};

const ADS_ENABLED = process.env.NEXT_PUBLIC_ADS_ENABLED !== "false";

export function ContextualAd({
  predictedClass,
  href,
}: {
  predictedClass: string;
  href?: string;
}) {
  const t = useTranslations("ads");
  const isPremium = usePremium();

  if (!ADS_ENABLED || isPremium) return null;

  const category = STATE_TO_AD_CATEGORY[predictedClass as EmotionalState] ?? "natural";
  const emoji = CATEGORY_EMOJI[category];

  return (
    <aside
      aria-label={t("sponsored")}
      className="my-6 rounded-xl border border-brand-200 bg-brand-50 p-4 shadow-sm"
    >
      <div className="flex items-center gap-3">
        <span className="text-3xl" aria-hidden="true">{emoji}</span>
        <div>
          <h4 className="flex items-center gap-2 text-sm font-bold text-brand-900">
            {t(`${category}.title`)}
            <span className="rounded bg-brand-700 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
              {t("sponsored")}
            </span>
          </h4>
          <p className="mt-1 text-sm text-ink-700">{t(`${category}.desc`)}</p>
        </div>
      </div>
      {href && (
        <a
          href={href}
          rel="sponsored noopener"
          target="_blank"
          className="mt-3 block w-full rounded-lg border border-brand-200 bg-white py-2 text-center text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50 dark:bg-brand-100 dark:text-brand-300"
        >
          {t("cta")}
        </a>
      )}
    </aside>
  );
}