import type { AcousticFeatures } from "@/domain/analysis/features";
import {
  AM_MAX_HZ,
  AM_MIN_HZ,
  F0_MAX_HZ,
  F0_MIN_HZ,
  FRAME_SIZE,
  HOP_SIZE,
  SAMPLE_RATE,
} from "./constants";
import { powerSpectrum } from "./fft";
import { frameRms } from "./normalize";

/**
 * Feature extraction for one segment of mono 16 kHz PCM.
 * Pure, deterministic, dependency-free — the parity fixtures in tests/
 * pin its behavior so the heuristic classifier stays stable.
 */
export function extractFeatures(pcm: Float32Array): AcousticFeatures {
  const durationS = pcm.length / SAMPLE_RATE;

  let sumSq = 0;
  for (let i = 0; i < pcm.length; i++) sumSq += pcm[i]! * pcm[i]!;
  const rms = Math.sqrt(sumSq / Math.max(1, pcm.length));

  const f0Track = trackF0(pcm);
  const voiced = f0Track.filter((f): f is number => f !== null);
  const voicedRatio = f0Track.length > 0 ? voiced.length / f0Track.length : 0;

  const f0Hz = voiced.length > 0 ? median(voiced) : null;
  const f0StartHz = voiced[0] ?? null;
  const f0EndHz = voiced[voiced.length - 1] ?? null;
  const f0RangeHz = voiced.length > 0 ? Math.max(...voiced) - Math.min(...voiced) : 0;

  const { centroidHz, flatness } = spectralStats(pcm);
  const zcr = zeroCrossingRate(pcm);
  const am = amplitudeModulation(pcm);

  return {
    durationS,
    rms,
    f0Hz,
    f0StartHz,
    f0EndHz,
    f0RangeHz,
    voicedRatio,
    spectralCentroidHz: centroidHz,
    spectralFlatness: flatness,
    zeroCrossingRate: zcr,
    amRateHz: am.rateHz,
    amStrength: am.strength,
  };
}

/* ------------------------------------------------------------------ */

const F0_FRAME = 1024; // longer frame → reliable autocorrelation down to 50 Hz
const F0_HOP = 512;
const VOICING_THRESHOLD = 0.45; // normalized autocorr peak below this = unvoiced

/** Per-frame f0 via normalized autocorrelation; null = unvoiced frame. */
export function trackF0(pcm: Float32Array): Array<number | null> {
  const minLag = Math.floor(SAMPLE_RATE / F0_MAX_HZ);
  const maxLag = Math.ceil(SAMPLE_RATE / F0_MIN_HZ);
  const frames = Math.max(0, Math.floor((pcm.length - F0_FRAME) / F0_HOP) + 1);
  const out: Array<number | null> = [];

  for (let f = 0; f < frames; f++) {
    const start = f * F0_HOP;
    let energy = 0;
    for (let i = 0; i < F0_FRAME; i++) energy += pcm[start + i]! * pcm[start + i]!;
    if (energy < 1e-6) {
      out.push(null);
      continue;
    }

    // Normalize every lag by the lag-0 energy (e0), NOT by the per-lag windowed
    // energy. Per-lag normalization makes a pure tone correlate ~1 at every
    // multiple of its period, so the search locks onto a sub-harmonic. Dividing
    // by the fixed e0 lets correlation decay with lag, so the fundamental
    // (shortest true period) wins.
    let bestLag = 0;
    let bestCorr = 0;
    for (let lag = minLag; lag <= maxLag && lag < F0_FRAME; lag++) {
      let corr = 0;
      for (let i = 0; i < F0_FRAME - lag; i++) {
        corr += pcm[start + i]! * pcm[start + i + lag]!;
      }
      const norm = corr / (energy + 1e-12);
      if (norm > bestCorr) {
        bestCorr = norm;
        bestLag = lag;
      }
    }
    out.push(bestCorr >= VOICING_THRESHOLD && bestLag > 0 ? SAMPLE_RATE / bestLag : null);
  }
  return out;
}

function spectralStats(pcm: Float32Array): { centroidHz: number; flatness: number } {
  const frames = Math.max(1, Math.floor((pcm.length - FRAME_SIZE) / HOP_SIZE) + 1);
  const bins = FRAME_SIZE / 2 + 1;
  const avg = new Float64Array(bins);
  let counted = 0;

  for (let f = 0; f < frames; f++) {
    const start = f * HOP_SIZE;
    if (start + FRAME_SIZE > pcm.length) break;
    const spec = powerSpectrum(pcm.subarray(start, start + FRAME_SIZE));
    for (let k = 0; k < bins; k++) avg[k]! += spec[k]!;
    counted++;
  }
  if (counted === 0) return { centroidHz: 0, flatness: 1 };
  for (let k = 0; k < bins; k++) avg[k]! /= counted;

  // Restrict to 100 Hz – 8 kHz: below is rumble, above is empty at sr=16k.
  const binHz = SAMPLE_RATE / FRAME_SIZE;
  const lo = Math.max(1, Math.round(100 / binHz));
  const hi = bins - 1;

  let num = 0;
  let den = 0;
  let logSum = 0;
  let linSum = 0;
  let n = 0;
  for (let k = lo; k <= hi; k++) {
    const p = avg[k]! + 1e-12;
    num += k * binHz * p;
    den += p;
    logSum += Math.log(p);
    linSum += p;
    n++;
  }
  const centroidHz = den > 0 ? num / den : 0;
  const flatness = Math.exp(logSum / n) / (linSum / n + 1e-12);
  return { centroidHz, flatness: Math.min(1, flatness) };
}

function zeroCrossingRate(pcm: Float32Array): number {
  if (pcm.length < 2) return 0;
  let crossings = 0;
  for (let i = 1; i < pcm.length; i++) {
    if ((pcm[i - 1]! >= 0) !== (pcm[i]! >= 0)) crossings++;
  }
  return crossings / (pcm.length / SAMPLE_RATE);
}

const ENV_HOP = 32; // 2 ms → envelope sampled at 500 Hz, fine enough for 15–45 Hz AM
const ENV_WIN = 64;

/** Detects periodic amplitude modulation (purr signature: pulses at ~20–40 Hz). */
export function amplitudeModulation(pcm: Float32Array): {
  rateHz: number | null;
  strength: number;
} {
  const env = frameRms(pcm, ENV_WIN, ENV_HOP);
  if (env.length < 64) return { rateHz: null, strength: 0 };

  // Remove DC so autocorrelation measures modulation, not overall level
  let mean = 0;
  for (let i = 0; i < env.length; i++) mean += env[i]!;
  mean /= env.length;
  const centered = new Float64Array(env.length);
  for (let i = 0; i < env.length; i++) centered[i] = env[i]! - mean;

  const envRate = SAMPLE_RATE / ENV_HOP; // 500 Hz
  const minLag = Math.floor(envRate / AM_MAX_HZ);
  const maxLag = Math.ceil(envRate / AM_MIN_HZ);

  let e0 = 0;
  for (let i = 0; i < centered.length; i++) e0 += centered[i]! * centered[i]!;
  if (e0 < 1e-12) return { rateHz: null, strength: 0 };

  let bestLag = 0;
  let bestCorr = 0;
  for (let lag = minLag; lag <= maxLag && lag < centered.length; lag++) {
    let corr = 0;
    for (let i = 0; i < centered.length - lag; i++) corr += centered[i]! * centered[i + lag]!;
    const norm = corr / e0;
    if (norm > bestCorr) {
      bestCorr = norm;
      bestLag = lag;
    }
  }
  if (bestLag === 0 || bestCorr < 0.2) return { rateHz: null, strength: Math.max(0, bestCorr) };
  return { rateHz: envRate / bestLag, strength: Math.min(1, bestCorr) };
}

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}
