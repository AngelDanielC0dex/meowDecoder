import type { Classification } from "./classification";

/**
 * ============================================================================
 * MODEL CONTRACT v2 — 10 CLASS YAMNet TRANSFER LEARNING
 * ============================================================================
 * The single source of truth binding the DSP pipeline, every inference engine
 * (heuristic + ONNX YAMNet), the training pipeline (training/config.yaml) and
 * the published manifest (web/public/models/manifest.json).
 *
 * BREAKING CHANGE from v1 (6 classes) to v2 (10 classes):
 * - Input changed from log-mel spectrogram to raw waveform (YAMNet processes it)
 * - Output now has 10 classes instead of 6
 * - Temporal smoothing (EMA) is part of the contract
 * - YAMNet ONNX model is loaded alongside the classifier head
 *
 * Changing ANY value here requires a manifest `schemaVersion` bump and a
 * frontend release that supports both versions during migration.
 *
 * Full prose specification: docs/model-contract.md
 */

/** INPUT: mono PCM @ 16 kHz → YAMNet → classifier head (1024-dim embedding). */
export const MODEL_INPUT = {
  kind: "waveform" as const,
  sampleRate: 16_000,
  channels: 1,
  /** YAMNet processes 0.96s frames with 0.48s hop. */
  yamnetFrameS: 0.96,
  yamnetHopS: 0.48,
  embeddingDim: 1024,
  /** Analysis window for temporal smoothing: 3–5 seconds of accumulated frames. */
  smoothingWindowS: 3.0,
} as const;

/**
 * OUTPUT: probability distribution over exactly these 10 classes, IN THIS ORDER.
 * Index i of the output tensor ↔ MODEL_OUTPUT_CLASSES[i]. `unknown` is NOT a
 * model output — it is a product-level decision applied via thresholds below.
 *
 * Mapping from acoustic v1 classes (for backward compatibility):
 *   meow    → feliz_contento (affiliative/brushing meow), atencion (demand meow),
 *             llamada_madre, dolor (distress meow) — context disambiguates
 *   purr    → descansando ONLY. feliz_contento is NOT a purr: in the training
 *             data (CatMeows "brushing") it is a real, voiced, harmonic meow
 *             emitted in a positive context. Do not conflate the two.
 *   trill   → trinos
 *   hiss    → advertencia
 *   growl   → enfadado
 *   yowl    → llamada_apareamiento OR dolor OR pelea (context-dependent)
 */
export const MODEL_OUTPUT_CLASSES = [
  "feliz_contento",
  "trinos",
  "enfadado",
  "pelea",
  "llamada_madre",
  "llamada_apareamiento",
  "dolor",
  "descansando",
  "advertencia",
  "atencion",
] as const;

/**
 * CONFIDENCE THRESHOLDS (apply identically to every engine):
 * - certainty "high":   top-1 ≥ 0.70 AND (top-1 − top-2) ≥ 0.15
 * - certainty "medium": top-1 ≥ 0.45
 * - certainty "low":    top-1 < 0.45
 * - ambiguous flag:     certainty "low" OR (top-1 − top-2) < 0.15
 *
 * With 10 classes (vs 6), the absolute thresholds may need adjustment.
 * Macro-F1 per class during evaluation will inform any threshold tuning.
 */
export const CONFIDENCE = {
  high: 0.7,
  low: 0.45,
  ambiguityMargin: 0.15,
} as const;

/**
 * PER-CLASS CONFIDENCE THRESHOLDS for the YAMNet ONNX engine ONLY.
 * Calibrated on out-of-fold probabilities (training/scripts/calibrate_thresholds.py)
 * at target precision 0.60. If the ONNX model's top-1 probability for a class is
 * below its threshold, the prediction MUST be demoted to `unknown`.
 *
 * DO NOT apply these to the heuristic engine — its score distribution differs.
 * Classes with very high thresholds (advertencia, llamada_*) are
 * "precise but rare": only surfaced when the model is very confident; otherwise
 * `unknown`. These are the Phase-3 data-acquisition targets.
 */
export const ML_CLASS_THRESHOLDS: Record<string, number> = {
  feliz_contento: 0.67,
  trinos: 0.59,
  enfadado: 0.64,
  pelea: 0.78,
  llamada_madre: 0.85,
  llamada_apareamiento: 0.89,
  dolor: 0.2,
  descansando: 0.2,
  advertencia: 0.87,
  atencion: 0.7,
} as const;

/**
 * Demote the primary prediction to `unknown` when its probability is below the
 * per-class ML threshold above. For use by the YAMNet ONNX engine.
 */
export function applyMlClassThresholds(c: Classification): Classification {
  if (c.primary.cls === "unknown") return c;
  const thr = ML_CLASS_THRESHOLDS[c.primary.cls] ?? 0.45;
  if (c.primary.probability >= thr) return c;
  return {
    ...c,
    primary: { cls: "unknown", probability: c.primary.probability },
    alternatives: [c.primary, ...c.alternatives].slice(0, 2),
    ambiguous: true,
    certainty: "low",
  };
}

/**
 * TEMPORAL SMOOTHING PARAMETERS for YAMNet frame-level predictions:
 * - emaAlpha: EMA smoothing factor (0 = infinite memory, 1 = last frame only)
 * - windowS: Minimum accumulated time before emitting a confident prediction
 * - minFrames: Minimum YAMNet frames (~0.48s each) before trusting the result
 */
export const TEMPORAL_SMOOTHING = {
  emaAlpha: 0.3,
  windowS: 3.0,
  minFrames: 6, // ~2.88s at 0.48s per frame
} as const;

/**
 * UNKNOWN BEHAVIOR: when certainty is "low", the product MUST NOT present a
 * class as the answer. The original top class is demoted to first alternative
 * and `unknown` becomes primary, preserving the real top-1 probability so the
 * UI can still show how weak the best guess was.
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