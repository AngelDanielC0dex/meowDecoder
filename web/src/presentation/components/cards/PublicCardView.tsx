"use client";

import { useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { catAgeYears } from "@/domain/cat/cat";
import { zodiacSignForDate, ZODIAC_EMOJI } from "@/domain/cat/zodiac";
import type { CardSharePayload } from "@/domain/cat/card-share";
import { CARD_WIDTH, CARD_HEIGHT, drawCatCard, type CardData } from "./card-render";
import type { AppLocale } from "@/i18n/routing";

/**
 * Read-only public view of a shared card, reconstructed from the URL payload
 * (no photo — it cannot travel in a URL). Reuses the exact same canvas renderer
 * as the designer so a shared card looks identical to the original (sans photo).
 */
export function PublicCardView({ payload }: { payload: CardSharePayload }) {
  const t = useTranslations("cards");
  const tz = useTranslations("zodiac");
  const locale = useLocale() as AppLocale;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    const facts: string[] = [];
    const age = catAgeYears({ birthDate: payload.d, birthYear: null });
    if (age !== null) facts.push(t("ageYears", { count: age }));
    if (payload.d) {
      facts.push(t("bornOn", { date: new Date(payload.d).toLocaleDateString(locale, { dateStyle: "long" }) }));
    }

    const sign = payload.h ? zodiacSignForDate(payload.d) : null;
    const data: CardData = {
      name: payload.n,
      photo: null,
      facts,
      bio: payload.b,
      horoscope: sign ? { emoji: ZODIAC_EMOJI[sign], sign: tz(sign), phrase: tz(`${sign}_phrase`) } : null,
      brand: "MeowDecoder",
    };
    drawCatCard(ctx, data, payload.t);
  }, [payload, locale, t, tz]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 px-4 py-12">
      <canvas
        ref={canvasRef}
        width={CARD_WIDTH}
        height={CARD_HEIGHT}
        aria-label={t("previewAlt", { name: payload.n })}
        className="h-auto w-full max-w-[420px] rounded-2xl border border-brand-100 shadow-sm"
      />
      <Link
        href="/cards"
        className="inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-5 font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
      >
        {t("makeYours")}
      </Link>
    </div>
  );
}
