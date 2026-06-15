"use client";

import { useTranslations } from "next-intl";
import { useRecorder } from "@/presentation/hooks/useRecorder";
import { Button } from "@/presentation/components/ui/Button";
import { LevelMeter } from "./LevelMeter";

export function Recorder({ onCaptured }: { onCaptured: (blob: Blob) => void }) {
  const t = useTranslations("analyze");
  const { status, level, start, stop, cancel } = useRecorder();

  const handleStop = async () => {
    const blob = await stop();
    if (blob) onCaptured(blob);
  };

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <p className="text-ink-600">{t("recordHint")}</p>

      {status === "recording" ? (
        <div className="flex w-full max-w-sm flex-col gap-4">
          <p className="font-medium text-brand-700" role="status" aria-live="polite">
            <span className="mr-2 inline-block h-3 w-3 animate-pulse rounded-full bg-red-600 align-middle" />
            {t("recording")}
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
        <Button size="lg" onClick={start} disabled={status === "requesting"}>
          {status === "requesting" ? t("analyzing") : `🎙️ ${t("startRecording")}`}
        </Button>
      )}

      {status === "denied" && (
        <p role="alert" className="max-w-sm text-sm text-red-700">
          {t("errorMicDenied")}
        </p>
      )}
      {status === "error" && (
        <p role="alert" className="max-w-sm text-sm text-red-700">
          {t("errorGeneric")}
        </p>
      )}
    </div>
  );
}
