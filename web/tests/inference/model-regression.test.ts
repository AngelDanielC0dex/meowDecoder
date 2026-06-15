import { describe, it, expect } from "vitest";
import { extractFeatures } from "@/infrastructure/dsp/features";
import { logMel } from "@/infrastructure/inference/log-mel";
import { classifyFeatures } from "@/infrastructure/inference/heuristic-engine";
import { MODEL_INPUT, MODEL_OUTPUT_CLASSES } from "@/domain/analysis/contract";
import type { VocalizationClass } from "@/domain/analysis/vocalization";
import { loadWeights, runModel } from "../helpers/model-runner";
import { EVAL_CLASSES, makeEvalSignal, mulberry32 } from "../helpers/signals";

/**
 * REGRESSION GATE: the published model must match or beat the heuristic
 * baseline on a deterministic, held-out evaluation set (same parametric family
 * as training, UNSEEN seeds — measures generalization, not memorization).
 *
 * If a future model export drops below the baseline, this fails and the model
 * must not ship. The baseline itself is also pinned to a floor so it can't
 * silently rot.
 */

const PER_CLASS = 8;
const SEED_BASE = 990_000; // disjoint from training seeds (1000..1005)

interface EvalResult {
  truth: VocalizationClass;
  predicted: VocalizationClass;
}

function macroF1(results: EvalResult[], classes: readonly VocalizationClass[]): number {
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

describe("model vs heuristic baseline (regression gate)", () => {
  const weights = loadWeights();

  // Build the deterministic eval set once.
  const evalSet: Array<{ truth: VocalizationClass; pcm: Float32Array }> = [];
  EVAL_CLASSES.forEach((cls, ci) => {
    for (let k = 0; k < PER_CLASS; k++) {
      const rng = mulberry32(SEED_BASE + ci * 100 + k);
      evalSet.push({ truth: cls, pcm: makeEvalSignal(cls, rng) });
    }
  });

  // Compare raw classifier competence (argmax). The unknown policy is a
  // uniform product layer applied to BOTH engines, so for the baseline we
  // recover the demoted top class when the policy emitted `unknown`.
  const heuristicResults: EvalResult[] = evalSet.map(({ truth, pcm }) => {
    const c = classifyFeatures(extractFeatures(pcm), "h", "h");
    const predicted =
      c.primary.cls === "unknown" ? (c.alternatives[0]?.cls ?? "unknown") : c.primary.cls;
    return { truth, predicted };
  });

  const modelResults: EvalResult[] = evalSet.map(({ truth, pcm }) => {
    const mel = logMel(pcm, MODEL_INPUT.nMels, MODEL_INPUT.nFrames);
    const probs = runModel(weights, mel, MODEL_INPUT.nMels, MODEL_INPUT.nFrames);
    const argmax = probs.indexOf(Math.max(...probs));
    return { truth, predicted: MODEL_OUTPUT_CLASSES[argmax] ?? "unknown" };
  });

  const baselineF1 = macroF1(heuristicResults, EVAL_CLASSES);
  const modelF1 = macroF1(modelResults, EVAL_CLASSES);

  it(`model (${modelF1.toFixed(3)}) >= baseline (${baselineF1.toFixed(3)}) - 0.02`, () => {
    expect(modelF1).toBeGreaterThanOrEqual(baselineF1 - 0.02);
  });

  it("model clears the absolute quality floor (macro-F1 ≥ 0.70)", () => {
    expect(modelF1).toBeGreaterThanOrEqual(0.7);
  });

  it("baseline itself has not rotted (macro-F1 ≥ 0.50)", () => {
    // The heuristic is the safety net — if it degrades, fallback quality does too.
    expect(baselineF1).toBeGreaterThanOrEqual(0.5);
  });
}, 60_000);
