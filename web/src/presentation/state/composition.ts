import { WorkerAudioPipeline } from "@/infrastructure/audio/worker-pipeline";
import { selectEngine } from "@/infrastructure/inference/engine-registry";
import {
  IdbCatPhotoRepository,
  IdbCatPriorsRepository,
  IdbCatRepository,
  IdbFeedbackRepository,
  IdbSessionRepository,
  IdbSettingsRepository,
  IdbVaccinationRepository,
} from "@/infrastructure/persistence/repositories";
import { telemetry } from "@/infrastructure/telemetry/telemetry";
import type { InferenceEngine } from "@/application/ports/inference-engine";

/**
 * Composition root (client side). The ONE place adapters are instantiated and
 * bound to ports. Everything else depends on ports, so swapping an
 * implementation (e.g. a remote engine) is a one-line change here.
 *
 * Lazily constructed so the pipeline/worker is never created on pages that
 * don't analyze (the landing stays light).
 */
let pipeline: WorkerAudioPipeline | null = null;
let enginePromise: Promise<InferenceEngine> | null = null;

export const container = {
  pipeline(): WorkerAudioPipeline {
    return (pipeline ??= new WorkerAudioPipeline());
  },
  engine(): Promise<InferenceEngine> {
    return (enginePromise ??= selectEngine());
  },
  cats: new IdbCatRepository(),
  catPhotos: new IdbCatPhotoRepository(),
  sessions: new IdbSessionRepository(),
  feedback: new IdbFeedbackRepository(),
  settings: new IdbSettingsRepository(),
  catPriors: new IdbCatPriorsRepository(),
  vaccinations: new IdbVaccinationRepository(),
  telemetry,
};
