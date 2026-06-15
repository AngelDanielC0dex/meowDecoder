import { PEAK_TARGET } from "./constants";

/**
 * Peak normalization to -1 dBFS, in place.
 * Why peak (not loudness/RMS): we need invariance to recording gain and
 * distance for the feature extractors; perceptual loudness is irrelevant here.
 */
export function peakNormalize(pcm: Float32Array): Float32Array {
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) {
    const a = Math.abs(pcm[i]!);
    if (a > peak) peak = a;
  }
  if (peak < 1e-6) return pcm; // silence — avoid amplifying the noise floor
  const gain = PEAK_TARGET / peak;
  for (let i = 0; i < pcm.length; i++) pcm[i]! *= gain;
  return pcm;
}

/** Frame-wise RMS series. */
export function frameRms(pcm: Float32Array, frameSize: number, hopSize: number): Float64Array {
  const frames = Math.max(0, Math.floor((pcm.length - frameSize) / hopSize) + 1);
  const out = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const start = f * hopSize;
    for (let i = 0; i < frameSize; i++) {
      const s = pcm[start + i]!;
      sum += s * s;
    }
    out[f] = Math.sqrt(sum / frameSize);
  }
  return out;
}
