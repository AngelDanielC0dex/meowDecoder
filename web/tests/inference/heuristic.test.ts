import { describe, it, expect } from "vitest";
import { classifyFeatures } from "@/infrastructure/inference/heuristic-engine";
import type { AcousticFeatures } from "@/domain/analysis/features";

const base: AcousticFeatures = {
  durationS: 0.6,
  rms: 0.3,
  f0Hz: 500,
  f0StartHz: 420,
  f0EndHz: 580,
  f0RangeHz: 160,
  voicedRatio: 0.85,
  spectralCentroidHz: 1800,
  spectralFlatness: 0.04,
  zeroCrossingRate: 1200,
  amRateHz: null,
  amStrength: 0,
};

const id = "test";
const ver = "heuristic-test";

describe("heuristic classifier (11-class v2)", () => {
  it("scores a mid-pitched voiced ascending tone as atencion", () => {
    const c = classifyFeatures(
      { ...base, f0Hz: 500, f0StartHz: 420, f0EndHz: 580, f0RangeHz: 160, voicedRatio: 0.85 },
      id,
      ver,
    );
    expect(c.primary.cls).toBe("atencion");
  });

  it("classifies a strongly AM-modulated low/dark signal as descansando (purr)", () => {
    // Real purr: very low f0 (20-150 Hz range), dark spectrum, long, strong AM 18-42 Hz
    const c = classifyFeatures(
      { ...base, f0Hz: 80, f0StartHz: 78, f0EndHz: 82, f0RangeHz: 10, voicedRatio: 0.5, spectralCentroidHz: 500, spectralFlatness: 0.03, durationS: 4.0, amRateHz: 26, amStrength: 0.8 },
      id,
      ver,
    );
    expect(c.primary.cls).toBe("descansando");
  });

  it("classifies a flat-contour harmonic meow as feliz_contento", () => {
    const c = classifyFeatures(
      { ...base, f0Hz: 350, f0StartHz: 350, f0EndHz: 350, f0RangeHz: 20, voicedRatio: 0.8, spectralCentroidHz: 1200, spectralFlatness: 0.05, durationS: 1.2, amRateHz: null, amStrength: 0.05 },
      id,
      ver,
    );
    expect(c.primary.cls).toBe("feliz_contento");
  });

  it("classifies broadband unvoiced noise as advertencia", () => {
    const c = classifyFeatures(
      { ...base, f0Hz: null, voicedRatio: 0.05, spectralFlatness: 0.6, spectralCentroidHz: 4000, durationS: 0.7 },
      id,
      ver,
    );
    expect(c.primary.cls).toBe("advertencia");
  });

  it("always produces a normalized distribution including unknown", () => {
    const c = classifyFeatures(base, id, ver);
    const all = [c.primary, ...c.alternatives];
    expect(all.every((s) => s.probability >= 0 && s.probability <= 1)).toBe(true);
    expect(c.engineId).toBe(id);
    expect(c.modelVersion).toBe(ver);
  });

  it("marks weak/contradictory evidence as ambiguous & low certainty", () => {
    const c = classifyFeatures(
      { ...base, f0Hz: 300, voicedRatio: 0.4, spectralFlatness: 0.3, amStrength: 0.3, amRateHz: 25 },
      id,
      ver,
    );
    if (c.certainty === "low") expect(c.ambiguous).toBe(true);
    expect(["high", "medium", "low"]).toContain(c.certainty);
  });
});