import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { logMel } from "@/infrastructure/inference/log-mel";
import { MODEL_INPUT } from "@/domain/analysis/contract";
import { loadWeights, runModel } from "../helpers/model-runner";
import { makeParitySignal } from "../helpers/signals";

/**
 * Closes the verification chain for the PUBLISHED model:
 * the probs in model-parity.json were produced by the real ONNX Runtime
 * session on the parity signals. Here we recompute features (TS log-mel) and
 * the forward pass (TS runner from exported weights) and require agreement.
 * Passing ⇒ TS features + TS runner ≡ ONNX artifact, end to end.
 */

interface ModelParityFixture {
  modelVersion: string;
  classes: string[];
  cases: Array<{ kind: string; probs: number[] }>;
}

describe("model output parity (TS ↔ ONNX Runtime)", () => {
  const fixture = JSON.parse(
    readFileSync(join(__dirname, "../fixtures/model-parity.json"), "utf8"),
  ) as ModelParityFixture;
  const weights = loadWeights();
  const nSamples = (MODEL_INPUT.nFrames - 1) * 256 + 512;

  it("fixture and weights agree on model version", () => {
    expect(weights.modelVersion).toBe(fixture.modelVersion);
    expect(weights.classes).toEqual(fixture.classes);
  });

  for (const c of fixture.cases) {
    it(`matches ONNX Runtime probs for "${c.kind}"`, () => {
      const pcm = makeParitySignal(c.kind, nSamples);
      const mel = logMel(pcm, MODEL_INPUT.nMels, MODEL_INPUT.nFrames);
      const probs = runModel(weights, mel, MODEL_INPUT.nMels, MODEL_INPUT.nFrames);

      expect(probs.length).toBe(c.probs.length);
      let maxDiff = 0;
      for (let i = 0; i < probs.length; i++) {
        maxDiff = Math.max(maxDiff, Math.abs(probs[i]! - c.probs[i]!));
      }
      // Covers float32(JS) vs float64(NumPy) feature drift + fixture rounding.
      expect(maxDiff).toBeLessThan(0.02);
      // The argmax must never flip.
      const argmaxTs = probs.indexOf(Math.max(...probs));
      const argmaxOrt = c.probs.indexOf(Math.max(...c.probs));
      expect(argmaxTs).toBe(argmaxOrt);
    });
  }
});
