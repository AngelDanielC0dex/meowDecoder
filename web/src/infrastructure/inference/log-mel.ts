import { FRAME_SIZE, HOP_SIZE, SAMPLE_RATE } from "../dsp/constants";
import { powerSpectrum } from "../dsp/fft";

/**
 * Log-mel spectrogram matching the Python training pipeline
 * (training/src/meowdecoder_training/features.py). The CI parity test pins
 * both implementations to shared reference fixtures — feature mismatch between
 * JS and Python is the #1 silent killer of in-browser ML, so it is tested,
 * not assumed.
 */
export function logMel(pcm: Float32Array, nMels: number, nFrames: number): Float32Array {
  const fb = melFilterbank(nMels, FRAME_SIZE, SAMPLE_RATE);
  const out = new Float32Array(nMels * nFrames);

  // Center-crop / zero-pad the signal to exactly nFrames frames.
  const needed = (nFrames - 1) * HOP_SIZE + FRAME_SIZE;
  const padded = new Float32Array(needed);
  const offset = Math.max(0, Math.floor((pcm.length - needed) / 2));
  padded.set(pcm.subarray(offset, offset + Math.min(needed, pcm.length - offset)));

  for (let t = 0; t < nFrames; t++) {
    const spec = powerSpectrum(padded.subarray(t * HOP_SIZE, t * HOP_SIZE + FRAME_SIZE));
    for (let m = 0; m < nMels; m++) {
      let acc = 0;
      const filt = fb[m]!;
      for (let k = 0; k < spec.length; k++) acc += filt[k]! * spec[k]!;
      out[m * nFrames + t] = Math.log(acc + 1e-6);
    }
  }

  // Per-example standardization (mean 0, std 1) — mirrors training.
  let mean = 0;
  for (let i = 0; i < out.length; i++) mean += out[i]!;
  mean /= out.length;
  let varSum = 0;
  for (let i = 0; i < out.length; i++) varSum += (out[i]! - mean) ** 2;
  const std = Math.sqrt(varSum / out.length) + 1e-6;
  for (let i = 0; i < out.length; i++) out[i] = (out[i]! - mean) / std;

  return out;
}

const hzToMel = (hz: number): number => 2595 * Math.log10(1 + hz / 700);
const melToHz = (mel: number): number => 700 * (10 ** (mel / 2595) - 1);

// The filterbank only depends on (nMels, fftSize, sampleRate) — all constant
// across inferences — so build it once and reuse. Previously it was rebuilt on
// every logMel() call (64 filters × every analysis).
const filterbankCache = new Map<string, Float64Array[]>();

function melFilterbank(nMels: number, fftSize: number, sampleRate: number): Float64Array[] {
  const cacheKey = `${nMels}:${fftSize}:${sampleRate}`;
  const cached = filterbankCache.get(cacheKey);
  if (cached) return cached;

  const nBins = fftSize / 2 + 1;
  const fMin = 50;
  const fMax = sampleRate / 2;
  const melPoints = new Float64Array(nMels + 2);
  const melMin = hzToMel(fMin);
  const melMax = hzToMel(fMax);
  for (let i = 0; i < melPoints.length; i++) {
    melPoints[i] = melToHz(melMin + ((melMax - melMin) * i) / (nMels + 1));
  }
  const binOf = (hz: number) => Math.floor(((fftSize + 1) * hz) / sampleRate);

  const filters: Float64Array[] = [];
  for (let m = 1; m <= nMels; m++) {
    const filt = new Float64Array(nBins);
    const left = binOf(melPoints[m - 1]!);
    const center = binOf(melPoints[m]!);
    const right = binOf(melPoints[m + 1]!);
    for (let k = left; k < center; k++) {
      if (k >= 0 && k < nBins && center !== left) filt[k] = (k - left) / (center - left);
    }
    for (let k = center; k <= right; k++) {
      if (k >= 0 && k < nBins && right !== center) filt[k] = (right - k) / (right - center);
    }
    filters.push(filt);
  }
  filterbankCache.set(cacheKey, filters);
  return filters;
}
