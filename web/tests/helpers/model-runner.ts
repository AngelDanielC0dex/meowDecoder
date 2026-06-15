/**
 * Test-only reference implementation of the published model's forward pass,
 * built from the exported weights fixture (model-weights.json).
 *
 * Verification chain that makes this valid:
 *   ONNX Runtime ≡ NumPy   — gated at export (train_synthetic_model.py)
 *   NumPy ≡ this runner    — gated by model-parity.test.ts (probs fixtures
 *                            were produced by the REAL ONNX session)
 * Therefore conclusions drawn with this runner (e.g. the regression test)
 * hold for the published ONNX artifact, without needing the WASM runtime in CI.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface ModelWeights {
  arch: string;
  eps: number;
  modelVersion: string;
  classes: string[];
  W1: number[][];
  b1: number[];
  W2: number[][];
  b2: number[];
}

export function loadWeights(): ModelWeights {
  const path = join(__dirname, "../fixtures/model-weights.json");
  return JSON.parse(readFileSync(path, "utf8")) as ModelWeights;
}

/** logMelFlat: standardized log-mel, row-major (mel × frames) — exactly what
 * infrastructure/inference/log-mel.ts produces. */
export function runModel(w: ModelWeights, logMelFlat: Float32Array, nMels: number, nFrames: number): number[] {
  // Temporal mean/std pooling per mel band (matches the ONNX graph).
  const pooled = new Float64Array(nMels * 2);
  for (let m = 0; m < nMels; m++) {
    let sum = 0;
    let sumSq = 0;
    for (let t = 0; t < nFrames; t++) {
      const v = logMelFlat[m * nFrames + t]!;
      sum += v;
      sumSq += v * v;
    }
    const mean = sum / nFrames;
    const variance = Math.max(0, sumSq / nFrames - mean * mean);
    pooled[m] = mean;
    pooled[nMels + m] = Math.sqrt(variance + w.eps);
  }

  // Hidden layer
  const nHidden = w.b1.length;
  const h = new Float64Array(nHidden);
  for (let j = 0; j < nHidden; j++) {
    let acc = w.b1[j]!;
    for (let i = 0; i < pooled.length; i++) acc += pooled[i]! * w.W1[i]![j]!;
    h[j] = Math.max(0, acc);
  }

  // Output + softmax
  const nOut = w.b2.length;
  const logits = new Array<number>(nOut);
  let maxLogit = -Infinity;
  for (let k = 0; k < nOut; k++) {
    let acc = w.b2[k]!;
    for (let j = 0; j < nHidden; j++) acc += h[j]! * w.W2[j]![k]!;
    logits[k] = acc;
    if (acc > maxLogit) maxLogit = acc;
  }
  const exps = logits.map((l) => Math.exp(l - maxLogit));
  const total = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / total);
}
