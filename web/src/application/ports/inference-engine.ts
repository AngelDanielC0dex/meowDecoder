import type { AcousticFeatures } from "@/domain/analysis/features";
import type { Classification } from "@/domain/analysis/classification";
import type { CatPriors } from "@/domain/analysis/cat-priors";
import type { Result } from "@/domain/shared/result";

/**
 * Inference port. The product is engine-agnostic by design: the heuristic DSP
 * engine ships first, the ONNX CNN plugs in later, and both can run in A/B.
 */
export interface InferenceInput {
  /** Mono PCM at 16 kHz of the selected segment. */
  readonly pcm: Float32Array;
  readonly sampleRate: 16000;
  /** Features already computed by the pipeline (heuristic engine consumes these). */
  readonly features: AcousticFeatures;
  /** Optional per-cat learned priors, blended into the score distribution. */
  readonly priors?: CatPriors;
}

export interface InferenceEngine {
  readonly id: string;
  readonly modelVersion: string;
  /** Idempotent; lazy-loads weights on first call. Safe to call eagerly to warm up. */
  ready(): Promise<Result<void>>;
  classify(input: InferenceInput): Promise<Result<Classification>>;
  dispose(): void;
}
