"use client";

import { useTranslations } from "next-intl";
import type { PipelineStage } from "@/application/ports/audio-pipeline";

const STAGE_ORDER: PipelineStage[] = [
  "decoding",
  "resampling",
  "trimming",
  "segmenting",
  "extracting-features",
  "classifying",
];

const STAGE_KEY: Record<PipelineStage, string> = {
  decoding: "stageDecoding",
  resampling: "stageResampling",
  trimming: "stageTrimming",
  segmenting: "stageSegmenting",
  "extracting-features": "stageExtracting",
  classifying: "stageClassifying",
};

export function PipelineProgress({ stage }: { stage: PipelineStage | null }) {
  const t = useTranslations("analyze");
  const currentIndex = stage ? STAGE_ORDER.indexOf(stage) : 0;
  const pct = Math.round(((currentIndex + 1) / STAGE_ORDER.length) * 100);

  return (
    <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
      <div
        className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-brand-100"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-brand-500 transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-sm text-ink-600">{stage ? t(STAGE_KEY[stage]) : t("analyzing")}</p>
    </div>
  );
}
