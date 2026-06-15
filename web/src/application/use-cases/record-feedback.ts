import { err, ok, type Result } from "@/domain/shared/result";
import { newFeedbackId } from "@/domain/shared/ids";
import { validateFeedback, type FeedbackEntry, type FeedbackVerdict } from "@/domain/feedback/feedback";
import type { VocalizationClass } from "@/domain/analysis/vocalization";
import type { AnalysisSession } from "@/domain/analysis/session";
import type { CorrectableClass } from "@/domain/analysis/cat-priors";
import type { CatPriorsRepository, FeedbackRepository } from "../ports/repositories";
import type { Telemetry } from "../ports/telemetry";

export interface RecordFeedbackRequest {
  readonly session: AnalysisSession;
  readonly verdict: FeedbackVerdict;
  readonly correctedClass: VocalizationClass | null;
  readonly shareForTraining: boolean;
}

/**
 * Captures a user correction with everything future learning needs
 * (features + model version), without implementing retraining yet.
 */
export async function recordFeedback(
  deps: {
    feedback: FeedbackRepository;
    telemetry: Telemetry;
    catPriors?: CatPriorsRepository;
  },
  req: RecordFeedbackRequest,
): Promise<Result<FeedbackEntry>> {
  const invalid = validateFeedback(req.verdict, req.correctedClass);
  if (invalid) return err({ code: invalid, message: invalid });

  const entry: FeedbackEntry = {
    id: newFeedbackId(),
    sessionId: req.session.id,
    catId: req.session.catId,
    createdAt: Date.now(),
    verdict: req.verdict,
    predictedClass: req.session.classification.primary.cls,
    correctedClass: req.verdict === "correct" ? null : req.correctedClass,
    features: req.session.segment.features,
    modelVersion: req.session.classification.modelVersion,
    sharedForTraining: req.shareForTraining,
  };

  await deps.feedback.save(entry);

  // Close the local learning loop: a correction reinforces this cat's priors,
  // which shift future predictions for that cat (no server required).
  if (
    deps.catPriors &&
    entry.catId &&
    entry.correctedClass &&
    entry.correctedClass !== "unknown"
  ) {
    await deps.catPriors.reinforce(entry.catId, entry.correctedClass as CorrectableClass);
  }

  deps.telemetry.track({ name: "feedback_given", verdict: req.verdict });
  return ok(entry);
}
