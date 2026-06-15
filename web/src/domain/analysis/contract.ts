import type { Classification } from "./classification";

/**
 * ============================================================================
 * MODEL CONTRACT v1 — FROZEN
 * ============================================================================
 * The single source of truth binding the DSP pipeline, every inference engine
 * (heuristic + ONNX), the training pipeline (training/config.yaml) and the
 * published manifest (web/public/models/manifest.json). Changing ANY value here
 * is a breaking change: bump the manifest `schemaVersion` and add a migration
 * path. The contract test (tests/inference/model-contract.test.ts) enforces
 * consistency between this file and the published artifacts.
 *
 * Full prose specification: docs/model-contract.md
 */

/** INPUT: mono PCM @ 16 kHz → standardized log-mel (per-example mean 0, std 1). */
export const MODEL_INPUT = {
  kind: "log-mel",
  sampleRate: 16_000,
  nMels: 64,
  nFrames: 96,
  /** Analysis window the nFrames cover: (96-1)*256+512 samples = 1.552 s. */
  windowS: 1.552,
  /** ONNX tensor: float32 [batch, 1, nMels, nFrames]; names are frozen. */
  tensorInputName: "input",
  tensorOutputName: "probs",
} as const;

/**
 * OUTPUT: probability distribution over exactly these classes, IN THIS ORDER.
 * Index i of the output tensor ↔ MODEL_OUTPUT_CLASSES[i]. `unknown` is NOT a
 * model output — it is a product-level decision applied via thresholds below.
 */
export const MODEL_OUTPUT_CLASSES = [
  "meow",
  "purr",
  "trill",
  "hiss",
  "growl",
  "yowl",
] as const;

/**
 * CONFIDENCE THRESHOLDS (apply identically to every engine):
 * - certainty "high":   top-1 ≥ 0.70 AND (top-1 − top-2) ≥ 0.15
 * - certainty "medium": top-1 ≥ 0.45
 * - certainty "low":    top-1 < 0.45
 * - ambiguous flag:     certainty "low" OR (top-1 − top-2) < 0.15
 */
export const CONFIDENCE = {
  high: 0.7,
  low: 0.45,
  ambiguityMargin: 0.15,
} as const;

/**
 * UNKNOWN BEHAVIOR: when certainty is "low", the product MUST NOT present a
 * class as the answer. The original top class is demoted to first alternative
 * and `unknown` becomes primary, preserving the real top-1 probability so the
 * UI can still show how weak the best guess was. Honesty is part of the
 * contract, not a UI nicety.
 */
export function applyUnknownPolicy(c: Classification): Classification {
  if (c.certainty !== "low" || c.primary.cls === "unknown") return c;
  return {
    ...c,
    primary: { cls: "unknown", probability: c.primary.probability },
    alternatives: [c.primary, ...c.alternatives].slice(0, 2),
    ambiguous: true,
  };
}
