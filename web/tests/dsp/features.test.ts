import { describe, it, expect } from "vitest";
import { extractFeatures, trackF0, amplitudeModulation } from "@/infrastructure/dsp/features";
import { SAMPLE_RATE } from "@/infrastructure/dsp/constants";

function tone(freq: number, durS: number, amp = 0.6): Float32Array {
  const n = Math.round(durS * SAMPLE_RATE);
  const pcm = new Float32Array(n);
  for (let i = 0; i < n; i++) pcm[i] = amp * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE);
  return pcm;
}

describe("features", () => {
  it("recovers the fundamental of a steady tone", () => {
    const f0 = trackF0(tone(440, 1.0)).filter((v): v is number => v !== null);
    const median = f0.sort((a, b) => a - b)[Math.floor(f0.length / 2)]!;
    expect(median).toBeGreaterThan(420);
    expect(median).toBeLessThan(460);
  });

  it("reports duration and a plausible centroid", () => {
    const f = extractFeatures(tone(600, 0.8));
    expect(f.durationS).toBeCloseTo(0.8, 1);
    expect(f.f0Hz).not.toBeNull();
    expect(f.spectralCentroidHz).toBeGreaterThan(300);
    // A pure tone is far from white noise.
    expect(f.spectralFlatness).toBeLessThan(0.5);
  });

  it("flags broadband noise as high flatness and unvoiced", () => {
    const n = Math.round(0.8 * SAMPLE_RATE);
    const pcm = new Float32Array(n);
    for (let i = 0; i < n; i++) pcm[i] = (Math.random() - 0.5) * 0.8;
    const f = extractFeatures(pcm);
    expect(f.spectralFlatness).toBeGreaterThan(0.2);
    expect(f.voicedRatio).toBeLessThan(0.5);
  });

  it("detects amplitude modulation in a purr-like envelope", () => {
    const n = Math.round(1.0 * SAMPLE_RATE);
    const pcm = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const carrier = Math.sin((2 * Math.PI * 150 * i) / SAMPLE_RATE);
      const env = 0.5 + 0.5 * Math.sin((2 * Math.PI * 28 * i) / SAMPLE_RATE); // 28 Hz AM
      pcm[i] = 0.6 * carrier * env;
    }
    const am = amplitudeModulation(pcm);
    expect(am.rateHz).not.toBeNull();
    expect(am.rateHz!).toBeGreaterThan(20);
    expect(am.rateHz!).toBeLessThan(36);
  });
});
