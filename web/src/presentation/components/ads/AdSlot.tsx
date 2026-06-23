"use client";

import { useTranslations } from "next-intl";
import { usePremium } from "@/presentation/hooks/usePremium";

/**
 * Reserved, labeled advertising slot. It renders a fixed-size placeholder so the
 * surrounding layout never shifts (no CLS) once a real ad network script fills
 * the slot via `data-ad-slot`. Honest by construction: always visibly labeled
 * "Advertisement", never disguised as content. Hidden for Premium users.
 *
 * Toggle the whole ad system with NEXT_PUBLIC_ADS_ENABLED="false".
 */
const ADS_ENABLED = process.env.NEXT_PUBLIC_ADS_ENABLED !== "false";

export type AdFormat = "vertical" | "horizontal";

const FORMAT_CLASS: Record<AdFormat, string> = {
  // Vertical fills its rail (160px skyscraper, widening to a 300px half-page on
  // ultra-wide screens — the rail sets the width). Horizontal is a fluid
  // leaderboard that grows its height a touch on larger viewports.
  vertical: "min-h-[600px] w-full max-w-[300px]",
  horizontal: "min-h-[90px] w-full max-w-3xl sm:min-h-[100px]",
};

export function AdSlot({
  slotId,
  format = "vertical",
  className = "",
}: {
  slotId: string;
  format?: AdFormat;
  className?: string;
}) {
  const t = useTranslations("ads");
  const isPremium = usePremium();
  if (!ADS_ENABLED || isPremium) return null;

  return (
    <div
      data-ad-slot={slotId}
      aria-label={t("advertisement")}
      className={`flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-brand-200 bg-brand-50/40 p-2 text-center ${FORMAT_CLASS[format]} ${className}`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-600">
        {t("advertisement")}
      </span>
      <span className="text-xs text-ink-600">{t("placeholder")}</span>
    </div>
  );
}
