"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import type { AnalysisSession } from "@/domain/analysis/session";
import type { CertaintyLevel } from "@/domain/analysis/classification";
import { getVocalizationByClass } from "@/content/vocalizations";
import { formatProbability, formatHz, formatDuration } from "@/presentation/formatters";
import { ConfidenceBar } from "./ConfidenceBar";
import { FeedbackForm } from "./FeedbackForm";
import { ContextualAd } from "./ContextualAd";
import { StatePhrase } from "./StatePhrase";
import { Button } from "@/presentation/components/ui/Button";
import type { VocalizationClass } from "@/domain/analysis/vocalization";
import type { AppLocale } from "@/i18n/routing";

const CERTAINTY_KEY: Record<CertaintyLevel, "certaintyHigh" | "certaintyMedium" | "certaintyLow"> =
  {
    high: "certaintyHigh",
    medium: "certaintyMedium",
    low: "certaintyLow",
  };

export function ResultCard({
  session,
  onAnalyzeAnother,
}: {
  session: AnalysisSession;
  onAnalyzeAnother: () => void;
}) {
  const t = useTranslations("result");
  const locale = useLocale() as AppLocale;
  const [showTech, setShowTech] = useState(false);
  const { classification, segment } = session;
  const { primary, alternatives, certainty, ambiguous } = classification;

  // The state shown in the interpretation phrase: the model's prediction, or the
  // user's correction once they fix it (registered users via the feedback form).
  const [shownClass, setShownClass] = useState<string>(primary.cls);

  const content = getVocalizationByClass(primary.cls);
  const i18n = content?.i18n[locale];
  const f = segment.features;
  const isUnknown = primary.cls === "unknown";

  return (
    <article
      aria-labelledby="result-heading"
      className="flex flex-col gap-6 rounded-2xl border border-brand-100 bg-surface p-6 shadow-sm sm:p-8"
    >
      <header className="text-center">
        <p className="text-sm uppercase tracking-wide text-ink-600">{t("primaryLabel")}</p>
        <h2 id="result-heading" className="mt-1 text-title font-bold">
          <span aria-hidden="true" className="mr-2 text-4xl">
            {content?.emoji ?? "❓"}
          </span>
          {i18n?.name ?? primary.cls}
        </h2>
        {i18n && <p className="mt-2 text-subtitle text-ink-600">{i18n.shortMeaning}</p>}
      </header>

      {/* Human interpretation phrase — varies per result and follows a correction.
          Seeded so it stays identical when this session is revisited in history. */}
      <StatePhrase cls={shownClass} locale={locale} seed={session.phraseSeed} />

      {isUnknown ? (
        <div role="alert" className="rounded-lg bg-amber-50 dark:bg-amber-950/50 dark:text-amber-100 p-4 text-sm text-amber-900">
          <p className="font-semibold">⚠️ {t("unknownTitle")}</p>
          <p className="mt-1">{t("unknownHint")}</p>
        </div>
      ) : (
        ambiguous && (
          <p role="alert" className="rounded-lg bg-amber-50 dark:bg-amber-950/50 dark:text-amber-100 p-3 text-sm text-amber-900">
            ⚠️ {t("ambiguousWarning")}
          </p>
        )
      )}

      <ConfidenceBar
        probability={primary.probability}
        certainty={certainty}
        label={`${t("confidence")} — ${t(CERTAINTY_KEY[certainty])}`}
      />

      <ContextualAd predictedClass={primary.cls} />

      {alternatives.length > 0 && (
        <section aria-labelledby="alt-heading" className="rounded-xl bg-brand-50/40 p-4">
          <h3 id="alt-heading" className="mb-2 text-sm font-semibold">
            {t("alternatives")}
          </h3>
          <ul className="space-y-2">
            {alternatives.map((alt) => {
              const altContent = getVocalizationByClass(alt.cls);
              return (
                <li key={alt.cls} className="flex items-center justify-between text-sm">
                  <span>
                    {altContent?.emoji} {altContent?.i18n[locale].name ?? alt.cls}
                  </span>
                  <span className="font-mono text-ink-600">
                    {formatProbability(alt.probability)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {i18n && (
        <section aria-labelledby="context-heading">
          <h3 id="context-heading" className="mb-1 text-sm font-semibold">
            {t("contextTitle")}
          </h3>
          <p className="text-ink-600">{i18n.description}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {i18n.contexts.map((c) => (
              <li
                key={c}
                className="rounded-full bg-brand-50 px-3 py-1 text-xs text-brand-700"
              >
                {c}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div>
        <button
          type="button"
          aria-expanded={showTech}
          onClick={() => setShowTech((s) => !s)}
          className="text-sm font-medium text-brand-700 underline hover:text-brand-800"
        >
          {t("technicalDetails")}
        </button>
        {showTech && (
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-ink-200/40 p-3 text-sm">
            <dt className="text-ink-600">{t("duration")}</dt>
            <dd className="font-mono">{formatDuration(f.durationS)}</dd>
            <dt className="text-ink-600">{t("pitch")}</dt>
            <dd className="font-mono">{formatHz(f.f0Hz)}</dd>
            <dt className="text-ink-600">{t("brightness")}</dt>
            <dd className="font-mono">{formatHz(f.spectralCentroidHz)}</dd>
            <dt className="text-ink-600">{t("modulation")}</dt>
            <dd className="font-mono">{formatHz(f.amRateHz)}</dd>
            <dt className="text-ink-600">{t("engineLabel")}</dt>
            <dd className="font-mono">{classification.modelVersion}</dd>
          </dl>
        )}
      </div>

      <FeedbackForm
        session={session}
        onCorrected={(cls: VocalizationClass) => setShownClass(cls)}
      />

      <p className="text-center text-xs text-ink-600">{t("notScience")}</p>

      <Button size="lg" onClick={onAnalyzeAnother} className="self-center">
        {t("analyzeAnother")}
      </Button>
    </article>
  );
}
