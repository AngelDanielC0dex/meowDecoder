/**
 * In-place iterative radix-2 FFT (Cooley–Tukey).
 *
 * Why hand-rolled: we need exactly one operation (real-input magnitude spectrum
 * of 512-sample frames). A dependency (fft.js, kissfft-wasm) buys nothing here
 * and adds supply-chain surface. ~60 lines, covered by parity tests against
 * known DFT results.
 */
export function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n !== im.length || (n & (n - 1)) !== 0) {
    throw new Error(`FFT size must be a power of two, got ${n}`);
  }

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k]!;
        const uIm = im[i + k]!;
        const vRe = re[i + k + len / 2]! * curRe - im[i + k + len / 2]! * curIm;
        const vIm = re[i + k + len / 2]! * curIm + im[i + k + len / 2]! * curRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

// Reusable scratch buffers (single-threaded worker; one FFT in flight at a
// time). Avoids allocating two Float64Array(n) per frame — ~96 frames per
// inference plus the spectral-stats pass — cutting GC churn on low-end mobile.
let scratchRe: Float64Array | null = null;
let scratchIm: Float64Array | null = null;

/** Power spectrum (|X|²) of a real signal frame. Returns n/2+1 bins. */
export function powerSpectrum(frame: Float32Array): Float64Array {
  const n = frame.length;
  if (!scratchRe || scratchRe.length !== n) {
    scratchRe = new Float64Array(n);
    scratchIm = new Float64Array(n);
  }
  const re = scratchRe;
  const im = scratchIm!;
  im.fill(0); // re is fully overwritten by the window loop below; im must reset
  // Hann window: reduces spectral leakage for centroid/flatness estimates.
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    re[i] = frame[i]! * w;
  }
  fftInPlace(re, im);
  const out = new Float64Array(n / 2 + 1);
  for (let k = 0; k <= n / 2; k++) {
    out[k] = re[k]! * re[k]! + im[k]! * im[k]!;
  }
  return out;
}
