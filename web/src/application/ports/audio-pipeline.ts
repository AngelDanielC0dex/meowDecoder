import type { AnalyzedSegment } from "@/domain/analysis/features";
import type { Result } from "@/domain/shared/result";

export type PipelineStage =
  | "decoding"
  | "resampling"
  | "trimming"
  | "segmenting"
  | "extracting-features"
  | "classifying";

export interface PipelineProgress {
  readonly stage: PipelineStage;
}

export interface PipelineOutput {
  /** All detected vocalization segments, best first. */
  readonly segments: readonly AnalyzedSegment[];
  /** PCM (mono, 16 kHz) of the best segment, ready for inference. */
  readonly bestSegmentPcm: Float32Array;
  readonly recordingDurationS: number;
}

/**
 * Audio pipeline port. The implementation runs DSP inside a Web Worker;
 * the application layer neither knows nor cares.
 */
export interface AudioPipeline {
  process(
    audio: Blob,
    onProgress?: (p: PipelineProgress) => void,
  ): Promise<Result<PipelineOutput>>;
}
