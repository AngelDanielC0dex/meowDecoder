import type { FeedbackId, SessionId, CatId } from "../shared/ids";
import type { VocalizationClass } from "../analysis/vocalization";
import type { AcousticFeatures } from "../analysis/features";

export type FeedbackVerdict = "correct" | "partially-correct" | "incorrect";

/**
 * A user correction. Stored with the features that produced the prediction so
 * future per-cat personalization and global retraining can use it without
 * re-processing audio (which may no longer exist).
 */
export interface FeedbackEntry {
  readonly id: FeedbackId;
  readonly sessionId: SessionId;
  readonly catId: CatId | null;
  readonly createdAt: number;
  readonly verdict: FeedbackVerdict;
  readonly predictedClass: VocalizationClass;
  /** What the user says it actually was (required when verdict !== correct). */
  readonly correctedClass: VocalizationClass | null;
  readonly features: AcousticFeatures;
  readonly modelVersion: string;
  /** Whether the user consented to share this (audio + labels) for retraining. */
  readonly sharedForTraining: boolean;
}

export function validateFeedback(
  verdict: FeedbackVerdict,
  correctedClass: VocalizationClass | null,
): string | null {
  if (verdict !== "correct" && correctedClass === null) {
    return "feedback/correction-required";
  }
  return null;
}
