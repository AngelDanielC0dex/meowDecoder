import {
  FRAME_SIZE,
  HOP_SIZE,
  MERGE_GAP_S,
  MIN_SEGMENT_S,
  SAMPLE_RATE,
  SEGMENT_PAD_S,
  MAX_SEGMENT_S,
  VAD_HANGOVER_S,
} from "./constants";
import { frameRms } from "./normalize";

export interface RawSegment {
  /** Sample offsets into the source PCM. */
  readonly startSample: number;
  readonly endSample: number;
}

/**
 * Adaptive energy VAD + silence-based segmentation.
 *
 * Decision (vs WebRTC VAD / Silero): cat vocalizations are short, loud events
 * over comparatively steady domestic noise. An adaptive RMS threshold —
 * noise floor estimated from the recording itself (10th percentile) plus a
 * dynamic-range margin — with a hangover is predictable, dependency-free and
 * runs in microseconds. Neural VADs are trained on human speech, weigh ~1 MB,
 * and bring no demonstrated benefit for this signal class. Revisit only with
 * evidence from real-world failure telemetry.
 */
export function detectSegments(pcm: Float32Array): RawSegment[] {
  const rms = frameRms(pcm, FRAME_SIZE, HOP_SIZE);
  if (rms.length === 0) return [];

  const sorted = Float64Array.from(rms).sort();
  const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  const noiseFloor = p(0.1);
  const loud = p(0.95);

  // Threshold sits 25% of the way up the recording's dynamic range,
  // with an absolute floor so digital silence never triggers.
  const threshold = Math.max(noiseFloor + 0.25 * (loud - noiseFloor), 0.008);

  const hangoverFrames = Math.round((VAD_HANGOVER_S * SAMPLE_RATE) / HOP_SIZE);
  const active = new Uint8Array(rms.length);
  let hang = 0;
  for (let i = 0; i < rms.length; i++) {
    if (rms[i]! >= threshold) {
      active[i] = 1;
      hang = hangoverFrames;
    } else if (hang > 0) {
      active[i] = 1;
      hang--;
    }
  }

  // Frames → contiguous runs
  const runs: Array<{ start: number; end: number }> = [];
  let runStart = -1;
  for (let i = 0; i <= active.length; i++) {
    const on = i < active.length && active[i] === 1;
    if (on && runStart < 0) runStart = i;
    if (!on && runStart >= 0) {
      runs.push({ start: runStart, end: i });
      runStart = -1;
    }
  }

  // Merge runs separated by short gaps (a meow with a micro-pause is one event)
  const mergeGapFrames = Math.round((MERGE_GAP_S * SAMPLE_RATE) / HOP_SIZE);
  const merged: Array<{ start: number; end: number }> = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && run.start - last.end <= mergeGapFrames) last.end = run.end;
    else merged.push({ ...run });
  }

  const minFrames = Math.round((MIN_SEGMENT_S * SAMPLE_RATE) / HOP_SIZE);
  const padSamples = Math.round(SEGMENT_PAD_S * SAMPLE_RATE);
  const maxSamples = Math.round(MAX_SEGMENT_S * SAMPLE_RATE);

  return merged
    .filter((r) => r.end - r.start >= minFrames)
    .map((r) => {
      const start = Math.max(0, r.start * HOP_SIZE - padSamples);
      const end = Math.min(pcm.length, r.end * HOP_SIZE + FRAME_SIZE + padSamples);
      return { startSample: start, endSample: Math.min(end, start + maxSamples) };
    });
}

/** Energy×duration score used to pick the most informative segment. */
export function segmentScore(pcm: Float32Array, seg: RawSegment): number {
  let energy = 0;
  for (let i = seg.startSample; i < seg.endSample; i++) energy += pcm[i]! * pcm[i]!;
  return energy; // sum of squares already favors longer & louder
}
