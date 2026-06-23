import { describe, it, expect } from "vitest";
import { classifyFeatures } from "@/infrastructure/inference/heuristic-engine";
import type { AcousticFeatures } from "@/domain/analysis/features";
import { EMOTIONAL_STATES } from "@/content/state-phrases";

/**
 * Heuristic baseline test for the 10-class v2 taxonomy.
 */

// Representative acoustic feature profiles for each class.
// These are simplified profiles that should trigger the heuristic scorer.
const FEATURE_PROFILES: Record<string, Partial<AcousticFeatures>> = {
  feliz_contento: { f0Hz: 350, f0StartHz: 350, f0EndHz: 350, f0RangeHz: 20, voicedRatio: 0.85, spectralCentroidHz: 1200, spectralFlatness: 0.04, durationS: 1.5, amRateHz: null, amStrength: 0.05, rms: 0.25, zeroCrossingRate: 600 },
  trinos: { f0Hz: 600, f0StartHz: 450, f0EndHz: 750, f0RangeHz: 300, voicedRatio: 0.8, spectralCentroidHz: 2000, spectralFlatness: 0.04, durationS: 0.35, amRateHz: null, amStrength: 0, rms: 0.25, zeroCrossingRate: 900 },
  enfadado: { f0Hz: 150, f0StartHz: 140, f0EndHz: 160, f0RangeHz: 40, voicedRatio: 0.8, spectralCentroidHz: 1100, spectralFlatness: 0.06, durationS: 1.5, amRateHz: null, amStrength: 0, rms: 0.35, zeroCrossingRate: 400 },
  pelea: { f0Hz: 500, f0StartHz: 300, f0EndHz: 800, f0RangeHz: 500, voicedRatio: 0.55, spectralCentroidHz: 3500, spectralFlatness: 0.25, durationS: 0.8, amRateHz: null, amStrength: 0, rms: 0.45, zeroCrossingRate: 1500 },
  llamada_madre: { f0Hz: 500, f0StartHz: 650, f0EndHz: 400, f0RangeHz: 250, voicedRatio: 0.85, spectralCentroidHz: 1800, spectralFlatness: 0.04, durationS: 1.0, amRateHz: null, amStrength: 0, rms: 0.25, zeroCrossingRate: 800 },
  llamada_apareamiento: { f0Hz: 500, f0StartHz: 300, f0EndHz: 700, f0RangeHz: 400, voicedRatio: 0.75, spectralCentroidHz: 2500, spectralFlatness: 0.1, durationS: 3.0, amRateHz: null, amStrength: 0, rms: 0.35, zeroCrossingRate: 1000 },
  dolor: { f0Hz: 750, f0StartHz: 600, f0EndHz: 900, f0RangeHz: 300, voicedRatio: 0.85, spectralCentroidHz: 3200, spectralFlatness: 0.08, durationS: 0.8, amRateHz: null, amStrength: 0, rms: 0.4, zeroCrossingRate: 1200 },
  descansando: { f0Hz: 80, f0StartHz: 78, f0EndHz: 82, f0RangeHz: 10, voicedRatio: 0.5, spectralCentroidHz: 500, spectralFlatness: 0.03, durationS: 4.0, amRateHz: 26, amStrength: 0.8, rms: 0.15, zeroCrossingRate: 250 },
  advertencia: { f0Hz: null, f0StartHz: null, f0EndHz: null, f0RangeHz: 100, voicedRatio: 0.08, spectralCentroidHz: 5000, spectralFlatness: 0.75, durationS: 0.7, amRateHz: null, amStrength: 0, rms: 0.35, zeroCrossingRate: 3500 },
  atencion: { f0Hz: 500, f0StartHz: 420, f0EndHz: 580, f0RangeHz: 160, voicedRatio: 0.85, spectralCentroidHz: 1800, spectralFlatness: 0.04, durationS: 0.8, amRateHz: null, amStrength: 0, rms: 0.3, zeroCrossingRate: 800 },
};

function makeFeatures(cls: string): AcousticFeatures {
  const profile = FEATURE_PROFILES[cls] ?? FEATURE_PROFILES["atencion"]!;
  return {
    durationS: profile.durationS ?? 1.0,
    rms: profile.rms ?? 0.3,
    f0Hz: profile.f0Hz ?? null,
    f0StartHz: profile.f0StartHz ?? null,
    f0EndHz: profile.f0EndHz ?? null,
    f0RangeHz: profile.f0RangeHz ?? 100,
    voicedRatio: profile.voicedRatio ?? 0.5,
    spectralCentroidHz: profile.spectralCentroidHz ?? 2000,
    spectralFlatness: profile.spectralFlatness ?? 0.1,
    zeroCrossingRate: profile.zeroCrossingRate ?? 800,
    amRateHz: profile.amRateHz ?? null,
    amStrength: profile.amStrength ?? 0,
  };
}

function macroF1(results: Array<{ truth: string; predicted: string }>, classes: readonly string[]): number {
  let f1Sum = 0;
  for (const cls of classes) {
    const tp = results.filter((r) => r.truth === cls && r.predicted === cls).length;
    const fp = results.filter((r) => r.truth !== cls && r.predicted === cls).length;
    const fn = results.filter((r) => r.truth === cls && r.predicted !== cls).length;
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    f1Sum += precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  }
  return f1Sum / classes.length;
}

describe("heuristic baseline for 10-class taxonomy", () => {
  const EVAL_CLASSES = EMOTIONAL_STATES;

  it("heuristic correctly classifies representative profiles for each class", () => {
    let correct = 0;
    for (const cls of EVAL_CLASSES) {
      const features = makeFeatures(cls);
      const result = classifyFeatures(features, "heuristic-dsp", "heuristic-2.0.0");
      // The primary prediction should be the expected class OR unknown (for low-confidence edge cases)
      if (result.primary.cls === cls || (result.primary.cls === "unknown" && result.alternatives[0]?.cls === cls)) {
        correct++;
      }
    }
    // At least 8 of 10 classes should be correctly identified
    expect(correct).toBeGreaterThanOrEqual(8);
  });

  it("heuristic baseline has not rotted (macro-F1 ≥ 0.50 on profiles)", () => {
    const results = EVAL_CLASSES.map((cls) => {
      const features = makeFeatures(cls);
      const result = classifyFeatures(features, "heuristic-dsp", "heuristic-2.0.0");
      const predicted =
        result.primary.cls === "unknown" ? (result.alternatives[0]?.cls ?? "unknown") : result.primary.cls;
      return { truth: cls, predicted };
    });
    const f1 = macroF1(results, EVAL_CLASSES);
    expect(f1).toBeGreaterThanOrEqual(0.5);
  });

  it("advertencia (hiss) is always classified as advertencia or unknown-with-advertencia", () => {
    const features = makeFeatures("advertencia");
    const result = classifyFeatures(features, "heuristic-dsp", "heuristic-2.0.0");
    const predicted = result.primary.cls === "unknown" ? result.alternatives[0]?.cls : result.primary.cls;
    expect(predicted).toBe("advertencia");
  });
});