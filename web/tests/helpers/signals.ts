/**
 * Deterministic signal generators shared across tests.
 * - mulberry32 + parity signals mirror training/scripts/generate_parity_fixtures.py.
 * - The eval generators mirror the *parametric family* of
 *   training/src/meowdecoder_training/synthetic.py (different seeds: the
 *   regression test measures within-family generalization, not memorization).
 */
import { SAMPLE_RATE } from "@/infrastructure/dsp/constants";

export const EVAL_N = (96 - 1) * 256 + 512; // 24832 samples = one model window

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- parity signals (shared recipe with Python) ----------------- */

export function makeParitySignal(kind: string, n: number): Float32Array {
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

/* ---------- evaluation family (mirrors synthetic.py) ------------------- */

type Rng = () => number;
const uni = (rng: Rng, lo: number, hi: number) => lo + (hi - lo) * rng();
/** Box–Muller standard normal from a uniform PRNG. */
function gauss(rng: Rng): number {
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function envelope(n: number, rng: Rng): Float64Array {
  const attack = Math.max(1, Math.floor(n * uni(rng, 0.05, 0.15)));
  const decay = Math.max(1, Math.floor(n * uni(rng, 0.1, 0.3)));
  const env = new Float64Array(n).fill(1);
  for (let i = 0; i < attack; i++) env[i] = i / attack;
  for (let i = 0; i < decay; i++) env[n - 1 - i]! *= i / decay;
  return env;
}

function harmonicTone(freqs: Float64Array, amps: number[], rng: Rng): Float64Array {
  const n = freqs.length;
  const out = new Float64Array(n);
  const phases = amps.map(() => uni(rng, 0, 2 * Math.PI));
  let cum = 0;
  for (let i = 0; i < n; i++) {
    cum += freqs[i]!;
    const base = (2 * Math.PI * cum) / SAMPLE_RATE;
    for (let k = 0; k < amps.length; k++) {
      out[i]! += amps[k]! * Math.sin((k + 1) * base + phases[k]!);
    }
  }
  return out;
}

function place(active: Float64Array, rng: Rng): Float64Array {
  const out = new Float64Array(EVAL_N);
  const margin = EVAL_N - active.length;
  const start = margin > 0 ? Math.floor(uni(rng, 0.2, 0.8) * margin) : 0;
  out.set(active.subarray(0, Math.min(active.length, EVAL_N)), Math.max(0, start));
  return out;
}

function finalize(sig: Float64Array, rng: Rng): Float32Array {
  let peak = 0;
  for (let i = 0; i < sig.length; i++) peak = Math.max(peak, Math.abs(sig[i]!));
  const gain = peak > 1e-9 ? 0.7 / peak : 0;
  const out = new Float32Array(EVAL_N);
  for (let i = 0; i < EVAL_N; i++) out[i] = sig[i]! * gain + 0.005 * gauss(rng);
  return out;
}

export const EVAL_CLASSES = ["meow", "purr", "trill", "hiss", "growl", "yowl"] as const;
export type EvalClass = (typeof EVAL_CLASSES)[number];

export function makeEvalSignal(cls: EvalClass, rng: Rng): Float32Array {
  switch (cls) {
    case "meow": {
      const n = Math.floor(uni(rng, 0.4, 1.2) * SAMPLE_RATE);
      const f0 = uni(rng, 350, 700);
      const contour = uni(rng, -0.25, 0.15);
      const freqs = new Float64Array(n);
      for (let i = 0; i < n; i++) freqs[i] = f0 * (1 + (contour * i) / (n - 1));
      const sig = harmonicTone(freqs, [1.0, 0.5, 0.25], rng);
      const env = envelope(n, rng);
      for (let i = 0; i < n; i++) sig[i]! *= env[i]!;
      return finalize(place(sig, rng), rng);
    }
    case "purr": {
      const n = Math.min(Math.floor(uni(rng, 1.3, 1.55) * SAMPLE_RATE), EVAL_N);
      const f0 = uni(rng, 60, 140);
      const fAm = uni(rng, 20, 35);
      const phase = uni(rng, 0, 2 * Math.PI);
      const freqs = new Float64Array(n).fill(f0);
      const sig = harmonicTone(freqs, [1.0, 0.4], rng);
      const env = envelope(n, rng);
      for (let i = 0; i < n; i++) {
        const am = 0.5 * (1 + Math.sin((2 * Math.PI * fAm * i) / SAMPLE_RATE + phase));
        sig[i]! *= 0.6 * am * env[i]!;
      }
      return finalize(place(sig, rng), rng);
    }
    case "trill": {
      const n = Math.floor(uni(rng, 0.3, 0.9) * SAMPLE_RATE);
      const f0 = uni(rng, 450, 800);
      const depth = uni(rng, 80, 200);
      const fMod = uni(rng, 15, 30);
      const freqs = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        freqs[i] = f0 + depth * Math.sin((2 * Math.PI * fMod * i) / SAMPLE_RATE);
      }
      const sig = harmonicTone(freqs, [1.0, 0.4], rng);
      const env = envelope(n, rng);
      for (let i = 0; i < n; i++) sig[i]! *= env[i]!;
      return finalize(place(sig, rng), rng);
    }
    case "hiss": {
      const n = Math.floor(uni(rng, 0.3, 1.0) * SAMPLE_RATE);
      const a = uni(rng, 0.5, 0.8);
      const sig = new Float64Array(n);
      let prev = 0;
      for (let i = 0; i < n; i++) {
        const x = gauss(rng);
        sig[i] = x - a * prev;
        prev = x;
      }
      const env = envelope(n, rng);
      for (let i = 0; i < n; i++) sig[i]! *= env[i]!;
      return finalize(place(sig, rng), rng);
    }
    case "growl": {
      const n = Math.min(Math.floor(uni(rng, 0.8, 1.5) * SAMPLE_RATE), EVAL_N);
      const f0 = uni(rng, 70, 180);
      const freqs = new Float64Array(n);
      let walk = 0;
      for (let i = 0; i < n; i++) {
        walk += 0.02 * gauss(rng);
        const jitter = 1 + walk / Math.sqrt(i + 1);
        freqs[i] = Math.min(300, Math.max(50, f0 * jitter));
      }
      const sig = harmonicTone(freqs, [1.0, 0.8, 0.6, 0.45, 0.3], rng);
      const env = envelope(n, rng);
      for (let i = 0; i < n; i++) sig[i]! *= env[i]!;
      return finalize(place(sig, rng), rng);
    }
    case "yowl": {
      const n = Math.min(Math.floor(uni(rng, 1.2, 1.55) * SAMPLE_RATE), EVAL_N);
      const fStart = uni(rng, 250, 450);
      const fPeak = uni(rng, 600, 900);
      const fEnd = uni(rng, 300, 500);
      const freqs = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const x = i / (n - 1);
        freqs[i] = fStart + (fPeak - fStart) * Math.sin(Math.PI * x) + (fEnd - fStart) * x;
      }
      const sig = harmonicTone(freqs, [1.0, 0.5], rng);
      const env = envelope(n, rng);
      for (let i = 0; i < n; i++) sig[i]! *= env[i]!;
      return finalize(place(sig, rng), rng);
    }
  }
}
