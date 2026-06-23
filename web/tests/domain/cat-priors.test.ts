import { describe, it, expect } from "vitest";
import {
  applyCatPriors,
  emptyCatPriors,
  reinforceCatPriors,
} from "@/domain/analysis/cat-priors";
import type { ClassScore } from "@/domain/analysis/classification";

const ambiguous: ClassScore[] = [
  { cls: "atencion", probability: 0.3 },
  { cls: "trinos", probability: 0.28 },
  { cls: "feliz_contento", probability: 0.12 },
  { cls: "advertencia", probability: 0.1 },
  { cls: "enfadado", probability: 0.08 },
  { cls: "llamada_apareamiento", probability: 0.07 },
  { cls: "dolor", probability: 0.03 },
  { cls: "descansando", probability: 0.01 },
  { cls: "pelea", probability: 0.004 },
  { cls: "llamada_madre", probability: 0.006 },
  { cls: "unknown", probability: 0 },
];

describe("per-cat priors", () => {
  it("is a no-op while priors are uniform (new cat behaves like the global model)", () => {
    const out = applyCatPriors(ambiguous, emptyCatPriors());
    for (const s of ambiguous) {
      const o = out.find((x) => x.cls === s.cls)!;
      expect(o.probability).toBeCloseTo(s.probability, 5);
    }
  });

  it("shifts an ambiguous call toward a repeatedly-corrected class", () => {
    let priors = emptyCatPriors();
    for (let i = 0; i < 8; i++) priors = reinforceCatPriors(priors, "trinos");

    const out = [...applyCatPriors(ambiguous, priors)].sort(
      (a, b) => b.probability - a.probability,
    );
    expect(out[0]!.cls).toBe("trinos");
  });

  it("does NOT flip a clear, confident prediction after a single correction", () => {
    const clear: ClassScore[] = [
      { cls: "feliz_contento", probability: 0.9 },
      { cls: "atencion", probability: 0.05 },
      { cls: "trinos", probability: 0.02 },
      { cls: "advertencia", probability: 0.01 },
      { cls: "enfadado", probability: 0.005 },
      { cls: "dolor", probability: 0.005 },
      { cls: "descansando", probability: 0.005 },
      { cls: "pelea", probability: 0.002 },
      { cls: "llamada_madre", probability: 0.001 },
      { cls: "llamada_apareamiento", probability: 0.001 },
      { cls: "unknown", probability: 0.001 },
    ];
    const priors = reinforceCatPriors(emptyCatPriors(), "atencion");
    const out = [...applyCatPriors(clear, priors)].sort(
      (a, b) => b.probability - a.probability,
    );
    expect(out[0]!.cls).toBe("feliz_contento");
  });

  it("keeps the distribution normalized to ~1", () => {
    const priors = reinforceCatPriors(emptyCatPriors(), "feliz_contento");
    const sum = applyCatPriors(ambiguous, priors).reduce((s, x) => s + x.probability, 0);
    expect(sum).toBeCloseTo(1, 5);
  });
});