"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRecorder } from "@/presentation/hooks/useRecorder";
import { Button } from "@/presentation/components/ui/Button";
import { MAX_DURATION_S } from "@/infrastructure/audio/decode";
import { LevelMeter } from "./LevelMeter";

export function Recorder({ onCaptured }: { onCaptured: (blob: Blob) => void }) {
  const t = useTranslations("analyze");
  const { status, level, start, stop, cancel } = useRecorder();
  const [remainingS, setRemainingS] = useState(MAX_DURATION_S);

  const handleStop = useCallback(async () => {
    const blob = await stop();
    if (blob) onCaptured(blob);
  }, [stop, onCaptured]);

  // Enforce the max recording duration: count down once per second while
  // recording and auto-stop at zero so the captured clip never exceeds the
  // decoder's limit (MAX_DURATION_S). Mirrors the upload-side cap.
  useEffect(() => {
    if (status !== "recording") {
      setRemainingS(MAX_DURATION_S);
      return;
    }
    const startedAt = Date.now();
    const id = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const left = Math.max(0, Math.ceil(MAX_DURATION_S - elapsed));
      setRemainingS(left);
      if (left <= 0) {
        clearInterval(id);
        void handleStop();
      }
    }, 250);
    return () => clearInterval(id);
  }, [status, handleStop]);

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <p className="text-ink-600">{t("recordHint")}</p>

      {status === "recording" ? (
        <div className="flex w-full max-w-sm flex-col gap-4">
          <p className="font-medium text-brand-700" role="status" aria-live="polite">
            <span className="mr-2 inline-block h-3 w-3 animate-pulse rounded-full bg-red-600 align-middle" />
            {t("recording")} <span className="font-mono tabular-nums">{t("recordingCountdown", { seconds: remainingS })}</span>
          </p>
          <LevelMeter level={level} />
          <div className="flex justify-center gap-3">
            <Button size="lg" onClick={handleStop}>
              {t("stopRecording")}
            </Button>
            <Button size="lg" variant="ghost" onClick={cancel}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <Button size="lg" onClick={start} disabled={status === "requesting"}>
            {status === "requesting" ? t("analyzing") : `🎙️ ${t("startRecording")}`}
          </Button>
          <p className="text-xs text-ink-600">{t("recordLimitsHint", { seconds: MAX_DURATION_S })}</p>
        </div>
      )}

      {status === "denied" && (
        <p role="alert" className="max-w-sm text-sm text-red-700 dark:text-red-300">
          {t("errorMicDenied")}
        </p>
      )}
      {status === "error" && (
        <p role="alert" className="max-w-sm text-sm text-red-700 dark:text-red-300">
          {t("errorGeneric")}
        </p>
      )}
    </div>
  );
}
