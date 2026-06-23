"use client";

import { useTranslations } from "next-intl";
import { usePremium } from "@/presentation/hooks/usePremium";

/**
 * Full-width interstitial ad used at two "moments of value":
 *  - while a prediction is computing (the loading experience), and
 *  - while the user is correcting a result.
 * Renders nothing for Premium users or when ads are disabled. Reserves a fixed
 * block (min-height) so the surrounding UI never shifts (CLS 0). Optional
 * `children` let us surface the cat's interpretation phrase inside the slot.
 */
const ADS_ENABLED = process.env.NEXT_PUBLIC_ADS_ENABLED !== "false";

export function InterstitialAd({
  label,
  children,
}: {
  label?: string;
  children?: React.ReactNode;
}) {
  const t = useTranslations("ads");
  const isPremium = usePremium();
  if (!ADS_ENABLED || isPremium) return null;

  return (
    <aside
      aria-label={t("advertisement")}
      className="flex min-h-[180px] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-brand-200 bg-brand-50/40 p-4 text-center"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-600">
        {t("advertisement")}
      </span>
      {children}
      <span className="text-xs text-ink-600">{label ?? t("placeholder")}</span>
    </aside>
  );
}
