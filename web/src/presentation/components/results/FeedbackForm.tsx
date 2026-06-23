"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import type { AnalysisSession } from "@/domain/analysis/session";
import type { FeedbackVerdict } from "@/domain/feedback/feedback";
import type { VocalizationClass } from "@/domain/analysis/vocalization";
import { CORRECTABLE_CLASSES } from "@/domain/analysis/vocalization";
import { recordFeedback } from "@/application/use-cases/record-feedback";
import { getVocalizationByClass } from "@/content/vocalizations";
import { container } from "@/presentation/state/composition";
import { Button } from "@/presentation/components/ui/Button";
import { Turnstile } from "@marsidev/react-turnstile";
import { submitFeedbackAction } from "@/server/actions/submit-feedback";
import { useAuth } from "@/presentation/hooks/useAuth";
import { SignInGate } from "@/presentation/components/auth/SignInGate";
import { InterstitialAd } from "@/presentation/components/ads/InterstitialAd";
import { StatePhrase } from "./StatePhrase";
import type { AppLocale } from "@/i18n/routing";

export function FeedbackForm({
  session,
  onCorrected,
}: {
  session: AnalysisSession;
  /** Notifies the parent of the corrected class so the UI (e.g. the
   *  interpretation phrase) can reflect the user's fix immediately. */
  onCorrected?: (cls: VocalizationClass) => void;
}) {
  const t = useTranslations("result");
  const locale = useLocale() as AppLocale;
  const { accountsEnabled, isAuthenticated, status } = useAuth();
  const [verdict, setVerdict] = useState<FeedbackVerdict | null>(null);
  const [corrected, setCorrected] = useState<VocalizationClass | "">("");
  const [share, setShare] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const submit = async (v: FeedbackVerdict) => {
    setVerdict(v);
    if (v === "correct") {
      await save(v, null);
    }
  };

  const save = async (v: FeedbackVerdict, correctedClass: VocalizationClass | null) => {
    // Reflect the correction in the parent UI (interpretation phrase) right away.
    if (correctedClass) onCorrected?.(correctedClass);
    // Step 1: Always save locally (IndexedDB) — works offline, no server needed.
    const res = await recordFeedback(
      {
        feedback: container.feedback,
        telemetry: container.telemetry,
        catPriors: container.catPriors,
      },
      { session, verdict: v, correctedClass, shareForTraining: share },
    );

    // Step 2: If we have a Turnstile token, also submit to the server for
    // persistent storage and future model retraining. The server-side action
    // verifies the token against the Cloudflare API before writing to DB.
    if (turnstileToken) {
      await submitFeedbackAction({
        sessionId: session.id,
        verdict: v,
        predictedClass: session.classification.primary.cls,
        correctedClass,
        sharedForTraining: share,
        turnstileToken,
      });
    }

    if (res.ok) setSubmitted(true);
  };

  if (submitted) {
    return (
      <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950/50 dark:text-green-200">
        {t("feedbackThanks")}
      </p>
    );
  }

  // Registered-only feature: anonymous visitors can analyze but not correct, so
  // their corrections can't pollute the training signal. Only gates when the
  // accounts feature is live; otherwise the legacy local-first flow is kept.
  if (accountsEnabled && !isAuthenticated) {
    if (status === "loading") return null;
    return <SignInGate context="correct" />;
  }

  return (
    <fieldset className="rounded-xl border border-brand-100 p-4">
      <legend className="px-1 text-sm font-semibold">{t("feedbackTitle")}</legend>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => submit("correct")}>
          👍 {t("feedbackCorrect")}
        </Button>
        <Button variant="secondary" onClick={() => setVerdict("partially-correct")}>
          🤔 {t("feedbackPartial")}
        </Button>
        <Button variant="secondary" onClick={() => setVerdict("incorrect")}>
          👎 {t("feedbackIncorrect")}
        </Button>
      </div>

      {verdict && verdict !== "correct" && (
        <div className="mt-4 flex flex-col gap-3">
          {/* Mandatory correction-moment ad (free users); surfaces the cat's
              interpretation phrase. Premium users see nothing. */}
          <InterstitialAd>
            <StatePhrase
              cls={session.classification.primary.cls}
              locale={locale}
              seed={session.phraseSeed}
            />
          </InterstitialAd>
          <label className="text-sm">
            <span className="mb-1 block font-medium">{t("feedbackCorrectionPrompt")}</span>
            <select
              value={corrected}
              onChange={(e) => setCorrected(e.target.value as VocalizationClass)}
              className="min-h-11 w-full rounded-lg border border-brand-100 px-3"
            >
              <option value="">—</option>
              {CORRECTABLE_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {getVocalizationByClass(c)?.i18n[locale].name ?? c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={share}
              onChange={(e) => setShare(e.target.checked)}
              className="size-4"
            />
            {t("feedbackShare")}
          </label>

          {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && (
            <div className="my-2 flex justify-center">
              <Turnstile
                siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
                onSuccess={(token) => setTurnstileToken(token)}
              />
            </div>
          )}

          <Button
            disabled={corrected === ""}
            onClick={() => save(verdict, corrected === "" ? null : corrected)}
          >
            {t("feedbackCorrect")}
          </Button>
        </div>
      )}
    </fieldset>
  );
}
