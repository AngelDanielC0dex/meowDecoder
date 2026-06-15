import { describe, it, expect } from "vitest";
import { detectSegments } from "@/infrastructure/dsp/vad";
import { SAMPLE_RATE } from "@/infrastructure/dsp/constants";

/** Builds: [silence][tone burst][silence] in samples. */
function makeBurst(silenceS: number, burstS: number, freq = 600): Float32Array {
  const sil = Math.round(silenceS * SAMPLE_RATE);
  const burst = Math.round(burstS * SAMPLE_RATE);
  const pcm = new Float32Array(sil * 2 + burst);
  for (let i = 0; i < burst; i++) {
    pcm[sil + i] = 0.6 * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE);
  }
  // low noise floor everywhere
  for (let i = 0; i < pcm.length; i++) pcm[i]! += (Math.random() - 0.5) * 0.002;
  return pcm;
}

describe("vad/segmentation", () => {
  it("returns no segments for near-silence", () => {
    const pcm = new Float32Array(SAMPLE_RATE);
    for (let i = 0; i < pcm.length; i++) pcm[i] = (Math.random() - 0.5) * 0.001;
    expect(detectSegments(pcm)).toHaveLength(0);
  });

  it("isolates a single burst and trims surrounding silence", () => {
    const pcm = makeBurst(0.5, 0.6);
    const segs = detectSegments(pcm);
    expect(segs.length).toBe(1);
    const seg = segs[0]!;
    const startS = seg.startSample / SAMPLE_RATE;
    const endS = seg.endSample / SAMPLE_RATE;
    // Burst sits in [0.5, 1.1]s; allow padding tolerance.
    expect(startS).toBeGreaterThan(0.3);
    expect(startS).toBeLessThan(0.6);
    expect(endS).toBeGreaterThan(1.0);
    // Burst ends ~1.1s; hangover (128ms) + padding (100ms) + frame legitimately
    // extend the segment to ~1.36s. That trailing margin is intentional.
    expect(endS).toBeLessThan(1.45);
  });

  it("separates two bursts with a long gap", () => {
    const a = makeBurst(0.3, 0.4);
    const gap = new Float32Array(Math.round(0.6 * SAMPLE_RATE));
    for (let i = 0; i < gap.length; i++) gap[i] = (Math.random() - 0.5) * 0.002;
    const b = makeBurst(0.3, 0.4, 900);
    const pcm = new Float32Array(a.length + gap.length + b.length);
    pcm.set(a, 0);
    pcm.set(gap, a.length);
    pcm.set(b, a.length + gap.length);
    expect(detectSegments(pcm).length).toBe(2);
  });
});
