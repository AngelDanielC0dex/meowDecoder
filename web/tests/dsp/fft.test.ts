import { describe, it, expect } from "vitest";
import { fftInPlace, powerSpectrum } from "@/infrastructure/dsp/fft";

describe("fft", () => {
  it("rejects non-power-of-two sizes", () => {
    expect(() => fftInPlace(new Float64Array(3), new Float64Array(3))).toThrow();
  });

  it("puts a pure tone's energy in the right bin", () => {
    const n = 512;
    const sr = 16000;
    const freq = 1000;
    const frame = new Float32Array(n);
    for (let i = 0; i < n; i++) frame[i] = Math.sin((2 * Math.PI * freq * i) / sr);
    const spec = powerSpectrum(frame);

    let peakBin = 0;
    let peak = 0;
    for (let k = 0; k < spec.length; k++) {
      if (spec[k]! > peak) {
        peak = spec[k]!;
        peakBin = k;
      }
    }
    const peakHz = (peakBin * sr) / n;
    // Within one bin (~31 Hz) of 1000 Hz.
    expect(Math.abs(peakHz - freq)).toBeLessThan(sr / n);
  });

  it("matches a naive DFT on a small random frame", () => {
    const n = 8;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    const x = [0.2, -0.5, 0.7, 0.1, -0.3, 0.9, -0.1, 0.4];
    x.forEach((v, i) => (re[i] = v));
    fftInPlace(re, im);

    for (let k = 0; k < n; k++) {
      let dr = 0;
      let di = 0;
      for (let t = 0; t < n; t++) {
        const ang = (-2 * Math.PI * k * t) / n;
        dr += x[t]! * Math.cos(ang);
        di += x[t]! * Math.sin(ang);
      }
      expect(re[k]!).toBeCloseTo(dr, 6);
      expect(im[k]!).toBeCloseTo(di, 6);
    }
  });
});
