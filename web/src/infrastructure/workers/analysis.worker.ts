/// <reference lib="webworker" />
/**
 * Analysis worker: everything CPU-heavy happens here, never on the main thread.
 * Input: mono 16 kHz PCM (already decoded/resampled natively on main thread,
 * because decodeAudioData/OfflineAudioContext are not available in workers).
 */
import { serveRpc } from "./rpc";
import { peakNormalize } from "../dsp/normalize";
import { detectSegments, segmentScore } from "../dsp/vad";
import { extractFeatures } from "../dsp/features";
import { SAMPLE_RATE } from "../dsp/constants";
import type { AnalyzedSegment } from "@/domain/analysis/features";

export interface AnalyzePayload {
  pcm: Float32Array;
}

export interface AnalyzeResult {
  segments: AnalyzedSegment[];
  bestSegmentPcm: Float32Array;
  recordingDurationS: number;
}

function analyze(
  payload: AnalyzePayload,
  progress: (stage: string) => void,
): { result: AnalyzeResult; transfer: Transferable[] } {
  const pcm = payload.pcm;
  const recordingDurationS = pcm.length / SAMPLE_RATE;

  progress("trimming");
  peakNormalize(pcm);

  progress("segmenting");
  const raw = detectSegments(pcm);
  if (raw.length === 0) {
    const empty = new Float32Array(0);
    return {
      result: { segments: [], bestSegmentPcm: empty, recordingDurationS },
      transfer: [empty.buffer],
    };
  }

  progress("extracting-features");
  const scored = raw
    .map((seg) => ({ seg, score: segmentScore(pcm, seg) }))
    .sort((a, b) => b.score - a.score);

  const segments: AnalyzedSegment[] = scored.map(({ seg }) => ({
    startS: seg.startSample / SAMPLE_RATE,
    endS: seg.endSample / SAMPLE_RATE,
    features: extractFeatures(pcm.subarray(seg.startSample, seg.endSample)),
  }));

  const best = scored[0]!.seg;
  // Copy (not subarray) so the transfer doesn't detach the source buffer mid-use.
  const bestSegmentPcm = pcm.slice(best.startSample, best.endSample);

  return {
    result: { segments, bestSegmentPcm, recordingDurationS },
    transfer: [bestSegmentPcm.buffer],
  };
}

serveRpc(self as DedicatedWorkerGlobalScope, {
  analyze: (payload: AnalyzePayload, progress) => analyze(payload, progress),
});
