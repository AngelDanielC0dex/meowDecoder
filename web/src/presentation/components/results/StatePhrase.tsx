"use client";

import { useEffect, useState } from "react";
import { getPhrasesForState, getRandomPhrase, isEmotionalState } from "@/content/state-phrases";
import type { AppLocale } from "@/i18n/routing";

/**
 * Warm, human-readable interpretation phrase for the cat's state. Reflects the
 * CURRENT understanding: the model's prediction, or the user's correction once
 * they fix it (driven by the `cls` prop from ResultCard).
 *
 * Consistency: when a `seed` is given (AnalysisSession.phraseSeed) the phrase is
 * chosen deterministically (`phrases[seed % n]`), so the same session shows the
 * same phrase in the result and in history. Without a seed (legacy sessions) it
 * falls back to a random pick.
 *
 * Hydration-safe: the choice runs in an effect (client-only), never during
 * render, so server and client never disagree. Renders nothing for non-emotional
 * classes (e.g. unknown).
 */
export function StatePhrase({
  cls,
  locale,
  seed,
}: {
  cls: string;
  locale: AppLocale;
  seed?: number | undefined;
}) {
  const [phrase, setPhrase] = useState("");

  useEffect(() => {
    if (!isEmotionalState(cls)) {
      setPhrase("");
      return;
    }
    if (seed == null) {
      setPhrase(getRandomPhrase(cls, locale));
      return;
    }
    const phrases = getPhrasesForState(cls, locale);
    setPhrase(phrases.length ? (phrases[seed % phrases.length] ?? "") : "");
  }, [cls, locale, seed]);

  if (!phrase) return null;

  return (
    <p
      aria-live="polite"
      className="rounded-xl border-l-4 border-brand-400 bg-brand-50/60 px-4 py-3 text-center text-subtitle font-medium text-balance text-brand-900"
    >
      <span aria-hidden="true" className="mr-1 text-brand-400">
        “
      </span>
      {phrase}
      <span aria-hidden="true" className="ml-1 text-brand-400">
        ”
      </span>
    </p>
  );
}
