import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { logMel } from "@/infrastructure/inference/log-mel";

/**
 * JS↔Python feature parity. The fixtures are produced by the training repo
 * (training/scripts/generate_parity_fixtures.py). Both sides regenerate the
 * same signals from a shared recipe; here we recompute log-mel in TS and assert
 * it matches Python's output. This guards the single most dangerous silent bug
 * in browser ML: feature drift between train and inference.
 */

const SAMPLE_RATE = 16000;

/** mulberry32 — identical to the Python generator. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSignal(kind: string, n: number): Float32Array {
  const pcm = new Float32Array(n);
  if (kind === "tone_440") {
    for (let i = 0; i < n; i++) pcm[i] = 0.8 * Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE);
  } else if (kind === "tone_900") {
    for (let i = 0; i < n; i++) pcm[i] = 0.6 * Math.sin((2 * Math.PI * 900 * i) / SAMPLE_RATE);
  } else if (kind === "chirp") {
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const f = 300 + ((1200 - 300) * i) / (n - 1);
      phase += f;
      pcm[i] = 0.7 * Math.sin((2 * Math.PI * phase) / SAMPLE_RATE);
    }
  } else if (kind === "noise") {
    const rng = mulberry32(7);
    for (let i = 0; i < n; i++) pcm[i] = (rng() * 2 - 1) * 0.5;
  }
  return pcm;
}

interface Fixture {
  sampleRate: number;
  nSamples: number;
  cases: Array<{ kind: string; nMels: number; nFrames: number; logMel: number[] }>;
}

describe("log-mel JS/Python parity", () => {
  const path = join(__dirname, "../fixtures/parity.json");
  const fixture = JSON.parse(readFileSync(path, "utf8")) as Fixture;

  for (const c of fixture.cases) {
    it(`matches Python for "${c.kind}"`, () => {
      const pcm = makeSignal(c.kind, fixture.nSamples);
      const mel = logMel(pcm, c.nMels, c.nFrames);
      expect(mel.length).toBe(c.logMel.length);

      let maxDiff = 0;
      for (let i = 0; i < mel.length; i++) {
        maxDiff = Math.max(maxDiff, Math.abs(mel[i]! - c.logMel[i]!));
      }
      // Tolerance covers float32 vs float64 + rounding to 4 decimals in the fixture.
      expect(maxDiff).toBeLessThan(0.02);
    });
  }
});
