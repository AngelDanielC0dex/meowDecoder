import { err, ok, type Result } from "@/domain/shared/result";
import { newSessionId, type CatId } from "@/domain/shared/ids";
import { systemClock, type Clock } from "@/domain/shared/clock";
import type { CatPriors } from "@/domain/analysis/cat-priors";
import type { AnalysisSession, AudioSourceKind } from "@/domain/analysis/session";
import type { AudioPipeline, PipelineProgress } from "../ports/audio-pipeline";
import type { InferenceEngine } from "../ports/inference-engine";
import type { SessionRepository } from "../ports/repositories";
import type { Telemetry } from "../ports/telemetry";

export interface AnalyzeAudioDeps {
  readonly pipeline: AudioPipeline;
  readonly engine: InferenceEngine;
  readonly sessions: SessionRepository;
  readonly telemetry: Telemetry;
  /** Injectable time source; defaults to the real clock. Keeps tests deterministic. */
  readonly clock?: Clock;
}

export interface AnalyzeAudioRequest {
  readonly audio: Blob;
  readonly source: AudioSourceKind;
  readonly catId: CatId | null;
  /** Keep the audio locally so the user can replay it from history. */
  readonly keepAudio: boolean;
  /**
   * Persist the session (and audio) to history. Registered users persist;
   * anonymous visitors analyze one-off, so the result is shown but never stored.
   */
  readonly persist: boolean;
  /** The selected cat's learned priors, blended into the prediction. */
  readonly priors?: CatPriors;
  readonly onProgress?: (p: PipelineProgress) => void;
}

/**
 * The core use case: blob in → persisted, classified session out.
 * Pure orchestration — every capability arrives through a port, so this is
 * fully testable with in-memory fakes and identical across engines.
 */
export async function analyzeAudio(
  deps: AnalyzeAudioDeps,
  req: AnalyzeAudioRequest,
): Promise<Result<AnalysisSession>> {
  const clock = deps.clock ?? systemClock;
  const startedAt = clock.monotonicMs();
  deps.telemetry.track({ name: "analysis_started", source: req.source });

  const processed = await deps.pipeline.process(req.audio, req.onProgress);
  if (!processed.ok) {
    deps.telemetry.track({
      name: "analysis_failed",
      stage: "pipeline",
      code: processed.error.code,
    });
    return processed;
  }

  const best = processed.value.segments[0];
  if (!best) {
    deps.telemetry.track({ name: "analysis_failed", stage: "segmenting", code: "no-segments" });
    return err({ code: "analysis/no-vocalization", message: "No vocalization detected" });
  }

  req.onProgress?.({ stage: "classifying" });
  const classified = await deps.engine.classify({
    pcm: processed.value.bestSegmentPcm,
    sampleRate: 16000,
    features: best.features,
    ...(req.priors ? { priors: req.priors } : {}),
  });
  if (!classified.ok) {
    deps.telemetry.track({
      name: "analysis_failed",
      stage: "inference",
      code: classified.error.code,
    });
    return classified;
  }

  const session: AnalysisSession = {
    id: newSessionId(),
    catId: req.catId,
    createdAt: clock.now(),
    source: req.source,
    recordingDurationS: processed.value.recordingDurationS,
    segment: best,
    classification: classified.value,
    // Audio is only retained when the session is persisted (registered user who
    // opted in). Anonymous one-off analyses never keep audio.
    audioKey: req.persist && req.keepAudio ? `audio:${crypto.randomUUID()}` : null,
    // Stable seed so the interpretation phrase is consistent across the result
    // view and history (see AnalysisSession.phraseSeed).
    phraseSeed: Math.floor(Math.random() * 100_000),
  };

  // Anonymous visitors get the result on screen but nothing is written to the
  // history store (no persistence, no audio) — analysis is one-off for them.
  if (req.persist) {
    await deps.sessions.save(session, req.keepAudio ? req.audio : null);
  }

  deps.telemetry.track({
    name: "analysis_completed",
    engineId: classified.value.engineId,
    certainty: classified.value.certainty,
    durationMs: Math.round(clock.monotonicMs() - startedAt),
  });

  return ok(session);
}
