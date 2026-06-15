"use client";

import { useTranslations } from "next-intl";

/**
 * Contextual affiliate slot — honest by construction:
 *  - All copy comes from i18n (`ads` namespace), never hardcoded per language.
 *  - NEVER renders on clinically sensitive classes (yowl/growl/hiss): we do not
 *    monetize signals that may indicate pain or distress.
 *  - No dead links: the CTA only renders when a real affiliate `href` is passed.
 *  - Toggleable via NEXT_PUBLIC_ADS_ENABLED ("false" disables it everywhere).
 *  - Clearly labeled "sponsored" and marked rel="sponsored" for crawlers.
 */
const CLINICAL_CLASSES = new Set(["yowl", "growl", "hiss"]);
const AD_EMOJI: Record<string, string> = {
  meow: "🐟",
  purr: "🛏️",
  trill: "🧶",
  unknown: "🍖",
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

  if (!ADS_ENABLED) return null;
  // Never advertise over a potential-distress vocalization.
  if (CLINICAL_CLASSES.has(predictedClass)) return null;

  const key = AD_EMOJI[predictedClass] ? predictedClass : "unknown";

  return (
    <aside
      aria-label={t("sponsored")}
      className="my-6 rounded-xl border border-brand-200 bg-brand-50 p-4 shadow-sm"
    >
      <div className="flex items-center gap-3">
        <span className="text-3xl" aria-hidden="true">
          {AD_EMOJI[key]}
        </span>
        <div>
          <h4 className="flex items-center gap-2 text-sm font-bold text-brand-900">
            {t(`${key}.title`)}
            <span className="rounded bg-brand-700 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
              {t("sponsored")}
            </span>
          </h4>
          <p className="mt-1 text-sm text-ink-700">{t(`${key}.desc`)}</p>
        </div>
      </div>
      {href && (
        <a
          href={href}
          rel="sponsored noopener"
          target="_blank"
          className="mt-3 block w-full rounded-lg border border-brand-200 bg-white py-2 text-center text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50"
        >
          {t("cta")}
        </a>
      )}
    </aside>
  );
}
