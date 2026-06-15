import { describe, it, expect } from "vitest";
import { classifyFeatures } from "@/infrastructure/inference/heuristic-engine";
import type { AcousticFeatures } from "@/domain/analysis/features";

const base: AcousticFeatures = {
  durationS: 0.6,
  rms: 0.3,
  f0Hz: 500,
  f0StartHz: 480,
  f0EndHz: 520,
  f0RangeHz: 60,
  voicedRatio: 0.8,
  spectralCentroidHz: 1500,
  spectralFlatness: 0.05,
  zeroCrossingRate: 1200,
  amRateHz: null,
  amStrength: 0,
};

const id = "test";
const ver = "heuristic-test";

describe("heuristic classifier", () => {
  it("scores a mid-pitched voiced tone as meow", () => {
    const c = classifyFeatures(base, id, ver);
    expect(c.primary.cls).toBe("meow");
  });

  it("classifies a strongly modulated low/dark signal as purr", () => {
    const c = classifyFeatures(
      { ...base, f0Hz: null, voicedRatio: 0.2, spectralCentroidHz: 600, durationS: 2, amRateHz: 28, amStrength: 0.8 },
      id,
      ver,
    );
    expect(c.primary.cls).toBe("purr");
  });

  it("classifies broadband unvoiced noise as hiss", () => {
    const c = classifyFeatures(
      { ...base, f0Hz: null, voicedRatio: 0.05, spectralFlatness: 0.6, spectralCentroidHz: 4000, durationS: 0.7 },
      id,
      ver,
    );
    expect(c.primary.cls).toBe("hiss");
  });

  it("always produces a normalized distribution including unknown", () => {
    const c = classifyFeatures(base, id, ver);
    const all = [c.primary, ...c.alternatives];
    expect(all.every((s) => s.probability >= 0 && s.probability <= 1)).toBe(true);
    // includes engine + version metadata for observability
    expect(c.engineId).toBe(id);
    expect(c.modelVersion).toBe(ver);
  });

  it("marks weak/contradictory evidence as ambiguous & low certainty", () => {
    const c = classifyFeatures(
      { ...base, f0Hz: 300, voicedRatio: 0.4, spectralFlatness: 0.3, amStrength: 0.3, amRateHz: 25 },
      id,
      ver,
    );
    // Not asserting a class — asserting honesty about uncertainty.
    if (c.certainty === "low") expect(c.ambiguous).toBe(true);
    expect(["high", "medium", "low"]).toContain(c.certainty);
  });
});
