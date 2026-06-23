import { describe, it, expect } from "vitest";
import {
  applyCatPriors,
  emptyCatPriors,
  reinforceCatPriors,
  type CatPriors,
} from "@/domain/analysis/cat-priors";
import type { ClassScore } from "@/domain/analysis/classification";

describe("applyCatPriors", () => {
  it("is a no-op while priors are uniform (normalized input unchanged)", () => {
    const scores: ClassScore[] = [
      { cls: "enfadado", probability: 0.6 },
      { cls: "dolor", probability: 0.4 },
    ];
    const out = applyCatPriors(scores, emptyCatPriors());
    expect(out.find((s) => s.cls === "enfadado")!.probability).toBeCloseTo(0.6, 5);
    expect(out.find((s) => s.cls === "dolor")!.probability).toBeCloseTo(0.4, 5);
  });

  it("clamp prevents extreme priors from overturning clearly strong evidence", () => {
    let priors: CatPriors = emptyCatPriors();
    for (let i = 0; i < 200; i++) priors = reinforceCatPriors(priors, "dolor");

    const scores: ClassScore[] = [
      { cls: "enfadado", probability: 0.85 }, // clear acoustic winner
      { cls: "dolor", probability: 0.05 }, // the cat's most-corrected class
    ];
    const out = applyCatPriors(scores, priors);
    const winner = out.find((s) => s.cls === "enfadado")!;
    const favorite = out.find((s) => s.cls === "dolor")!;
    expect(winner.probability).toBeGreaterThan(favorite.probability);
  });
});
