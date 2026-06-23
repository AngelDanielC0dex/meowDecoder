"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useAccess } from "@/presentation/hooks/useAccess";
import { useCats } from "@/presentation/hooks/useCats";
import { container } from "@/presentation/state/composition";
import { SignInGate } from "@/presentation/components/auth/SignInGate";
import { Button } from "@/presentation/components/ui/Button";
import { CARD_TEMPLATES, MAX_BIO_LENGTH, catAgeYears, type CardTemplate } from "@/domain/cat/cat";
import { zodiacSignForDate, ZODIAC_EMOJI } from "@/domain/cat/zodiac";
import { CARD_WIDTH, CARD_HEIGHT, drawCatCard, type CardData } from "./card-render";
import { ShareCard } from "./ShareCard";
import type { CatId } from "@/domain/shared/ids";
import type { AppLocale } from "@/i18n/routing";
import { optimizeImage, IMAGE_PRESETS, ImageOptimizeError } from "@/infrastructure/media/optimize-image";

/**
 * Presentation-card designer: pick a cat, add a photo, choose one of three
 * designs, write a short bio and optionally show the (birth-date-derived)
 * horoscope, then download the card as a PNG. Registered-only. The card is
 * drawn on a <canvas> (see card-render.ts) which is BOTH the live preview and
 * the export, so what you see is exactly what downloads.
 */
export function CardDesigner() {
  const t = useTranslations("cards");
  const tz = useTranslations("zodiac");
  const locale = useLocale() as AppLocale;
  const { isRegistered, status } = useAccess();
  const { cats, update } = useCats();

  const [catId, setCatId] = useState<CatId | null>(null);
  const [birthDate, setBirthDate] = useState("");
  const [bio, setBio] = useState("");
  const [template, setTemplate] = useState<CardTemplate>("classic");
  const [showHoroscope, setShowHoroscope] = useState(false);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [saved, setSaved] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cat = cats.find((c) => c.id === catId) ?? null;

  // Load the selected cat's saved card settings + photo.
  useEffect(() => {
    if (!cat) return;
    setBirthDate(cat.birthDate ?? "");
    setBio(cat.bio ?? "");
    setTemplate(cat.cardTemplate);
    setShowHoroscope(cat.showHoroscope);
    setSaved(false);
    let revoked: string | null = null;
    void container.catPhotos.get(cat.id).then((blob) => {
      if (!blob) {
        setPhoto(null);
        return;
      }
      const url = URL.createObjectURL(blob);
      revoked = url;
      const img = new Image();
      img.onload = () => setPhoto(img);
      img.src = url;
    });
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [cat?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build the localized fact lines + horoscope, then (re)draw the card.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !cat) return;

    const facts: string[] = [];
    const age = catAgeYears({ birthDate: birthDate || null, birthYear: cat.birthYear });
    if (age !== null) facts.push(t("ageYears", { count: age }));
    if (birthDate) {
      facts.push(t("bornOn", { date: new Date(birthDate).toLocaleDateString(locale, { dateStyle: "long" }) }));
    }
    if (cat.breed) facts.push(cat.breed);

    const sign = showHoroscope ? zodiacSignForDate(birthDate || null) : null;
    const data: CardData = {
      name: cat.name,
      photo,
      facts,
      bio: bio.trim() || null,
      horoscope: sign
        ? { emoji: ZODIAC_EMOJI[sign], sign: tz(sign), phrase: tz(`${sign}_phrase`) }
        : null,
      brand: "MeowDecoder",
    };
    drawCatCard(ctx, data, template);
  }, [cat, birthDate, bio, template, showHoroscope, photo, locale, t, tz]);

  if (status === "loading") return null;
  if (!isRegistered) return <SignInGate context="cats" />;

  if (cats.length === 0) {
    return <p className="rounded-xl border border-brand-100 bg-brand-50/40 p-6 text-center text-ink-600">{t("noCats")}</p>;
  }

  async function onPhoto(file: File | undefined) {
    if (!file || !catId) return;
    try {
      const blob = await optimizeImage(file, IMAGE_PRESETS.card);
      await container.catPhotos.put(catId, blob);
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        setPhoto(img);
        URL.revokeObjectURL(url);
      };
      img.src = url;
    } catch (e) {
      // Undecodable/oversized image → keep the previous photo silently.
      if (!(e instanceof ImageOptimizeError)) throw e;
    }
  }

  async function save() {
    if (!cat) return;
    await update(cat.id, {
      name: cat.name,
      birthDate: birthDate || null,
      bio: bio.trim() || null,
      cardTemplate: template,
      showHoroscope,
    });
    setSaved(true);
  }

  function download() {
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(cat?.name ?? "cat").toLowerCase().replace(/\s+/g, "-")}-card.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  /** The current card as a PNG blob (for the Web Share API). */
  function getPng(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const canvas = canvasRef.current;
      if (!canvas) return resolve(null);
      canvas.toBlob((blob) => resolve(blob), "image/png");
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_minmax(320px,420px)]">
      {/* Controls */}
      <div className="flex flex-col gap-5">
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t("selectCat")}</span>
          <select
            value={catId ?? ""}
            onChange={(e) => setCatId(e.target.value ? (e.target.value as CatId) : null)}
            className="min-h-11 w-full rounded-lg border border-brand-200 bg-surface px-3"
          >
            <option value="">{t("pickCat")}</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        {cat && (
          <>
            <label className="text-sm">
              <span className="mb-1 block font-medium">{t("photo")}</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => void onPhoto(e.target.files?.[0])}
                className="block w-full text-sm text-ink-600 file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-brand-600 file:px-4 file:font-medium file:text-white"
              />
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium">{t("birthDate")}</span>
              <input
                type="date"
                value={birthDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setBirthDate(e.target.value)}
                className="min-h-11 w-full rounded-lg border border-brand-200 bg-surface px-3"
              />
            </label>

            <fieldset>
              <legend className="mb-1 text-sm font-medium">{t("design")}</legend>
              <div role="radiogroup" aria-label={t("design")} className="flex flex-wrap gap-2">
                {CARD_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl}
                    type="button"
                    role="radio"
                    aria-checked={template === tpl}
                    onClick={() => setTemplate(tpl)}
                    className={`min-h-11 rounded-xl px-4 text-sm font-medium transition-colors ${
                      template === tpl
                        ? "bg-brand-600 text-white"
                        : "bg-brand-50 text-brand-700 ring-1 ring-brand-200 dark:text-brand-300"
                    }`}
                  >
                    {t(`template_${tpl}`)}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="text-sm">
              <span className="mb-1 block font-medium">{t("bio")}</span>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={MAX_BIO_LENGTH}
                rows={3}
                placeholder={t("bioPlaceholder")}
                className="w-full rounded-lg border border-brand-200 bg-surface p-3 text-sm"
              />
              <span className="mt-1 block text-right text-xs text-ink-400">
                {bio.length}/{MAX_BIO_LENGTH}
              </span>
            </label>

            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={showHoroscope}
                onChange={(e) => setShowHoroscope(e.target.checked)}
                className="size-4 accent-brand-600"
              />
              <span>
                {t("showHoroscope")}
                {showHoroscope && !birthDate && (
                  <span className="mt-0.5 block text-xs text-ink-400">{t("horoscopeNeedsDate")}</span>
                )}
              </span>
            </label>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void save()}>{saved ? t("saved") : t("save")}</Button>
              <Button variant="secondary" onClick={download}>⬇ {t("download")}</Button>
            </div>

            <ShareCard
              payload={{ n: cat.name, d: birthDate || null, b: bio.trim() || null, t: template, h: showHoroscope }}
              getPng={getPng}
            />
          </>
        )}
      </div>

      {/* Live preview = the exported canvas (scaled down responsively). */}
      <div className="lg:sticky lg:top-24">
        <canvas
          ref={canvasRef}
          width={CARD_WIDTH}
          height={CARD_HEIGHT}
          aria-label={t("previewAlt", { name: cat?.name ?? "" })}
          className="mx-auto h-auto w-full max-w-[420px] rounded-2xl border border-brand-100 shadow-sm"
        />
      </div>
    </div>
  );
}
