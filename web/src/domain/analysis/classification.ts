import type { VocalizationClass } from "./vocalization";
import { CONFIDENCE } from "./contract";

export interface ClassScore {
  readonly cls: VocalizationClass;
  /** Calibrated probability 0..1. Scores across classes sum to ~1. */
  readonly probability: number;
}

export type CertaintyLevel = "high" | "medium" | "low";

export interface Classification {
  readonly primary: ClassScore;
  /** Next most likely classes, descending, excluding primary. */
  readonly alternatives: readonly ClassScore[];
  readonly certainty: CertaintyLevel;
  /** True when top-1/top-2 margin is small or confidence is low: UI must warn. */
  readonly ambiguous: boolean;
  /** Engine that produced this result (for observability and A/B). */
  readonly engineId: string;
  /** Model/ruleset version, e.g. "heuristic-1" or "cnn-onnx-2026.06.0". */
  readonly modelVersion: string;
}

// Thresholds are part of the frozen model contract (see contract.ts).
const HIGH_CONFIDENCE = CONFIDENCE.high;
const LOW_CONFIDENCE = CONFIDENCE.low;
const AMBIGUITY_MARGIN = CONFIDENCE.ambiguityMargin;

/**
 * Derives certainty/ambiguity from raw class scores.
 * Pure domain logic: identical for heuristic and ML engines, so the UI
 * behaves consistently regardless of the engine.
 */
export function buildClassification(
  scores: readonly ClassScore[],
  engineId: string,
  modelVersion: string,
): Classification {
  const sorted = [...scores].sort((a, b) => b.probability - a.probability);
  const primary = sorted[0] ?? { cls: "unknown" as VocalizationClass, probability: 1 };
  const alternatives = sorted.slice(1, 3).filter((s) => s.probability >= 0.05);

  const second = sorted[1]?.probability ?? 0;
  const margin = primary.probability - second;

  const certainty: CertaintyLevel =
    primary.probability >= HIGH_CONFIDENCE && margin >= AMBIGUITY_MARGIN
      ? "high"
      : primary.probability >= LOW_CONFIDENCE
        ? "medium"
        : "low";

  return {
    primary,
    alternatives,
    certainty,
    ambiguous: certainty === "low" || margin < AMBIGUITY_MARGIN,
    engineId,
    modelVersion,
  };
}
