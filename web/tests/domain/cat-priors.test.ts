import { describe, it, expect } from "vitest";
import {
  applyCatPriors,
  emptyCatPriors,
  reinforceCatPriors,
} from "@/domain/analysis/cat-priors";
import type { ClassScore } from "@/domain/analysis/classification";

// An intentionally ambiguous distribution: meow barely beats trill.
const ambiguous: ClassScore[] = [
  { cls: "meow", probability: 0.3 },
  { cls: "trill", probability: 0.28 },
  { cls: "purr", probability: 0.12 },
  { cls: "hiss", probability: 0.1 },
  { cls: "growl", probability: 0.08 },
  { cls: "yowl", probability: 0.07 },
  { cls: "unknown", probability: 0.05 },
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
    for (let i = 0; i < 8; i++) priors = reinforceCatPriors(priors, "trill");

    const out = [...applyCatPriors(ambiguous, priors)].sort(
      (a, b) => b.probability - a.probability,
    );
    expect(out[0]!.cls).toBe("trill");
  });

  it("does NOT flip a clear, confident prediction after a single correction", () => {
    const clear: ClassScore[] = [
      { cls: "purr", probability: 0.9 },
      { cls: "meow", probability: 0.05 },
      { cls: "trill", probability: 0.02 },
      { cls: "hiss", probability: 0.01 },
      { cls: "growl", probability: 0.01 },
      { cls: "yowl", probability: 0.005 },
      { cls: "unknown", probability: 0.005 },
    ];
    const priors = reinforceCatPriors(emptyCatPriors(), "meow");
    const out = [...applyCatPriors(clear, priors)].sort(
      (a, b) => b.probability - a.probability,
    );
    expect(out[0]!.cls).toBe("purr");
  });

  it("keeps the distribution normalized to ~1", () => {
    const priors = reinforceCatPriors(emptyCatPriors(), "purr");
    const sum = applyCatPriors(ambiguous, priors).reduce((s, x) => s + x.probability, 0);
    expect(sum).toBeCloseTo(1, 5);
  });
});
