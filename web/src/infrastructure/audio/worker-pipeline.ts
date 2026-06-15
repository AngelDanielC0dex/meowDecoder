import type {
  AudioPipeline,
  PipelineOutput,
  PipelineProgress,
  PipelineStage,
} from "@/application/ports/audio-pipeline";
import { err, ok, type Result } from "@/domain/shared/result";
import { decodeToMono16k } from "./decode";
import { callWorker } from "../workers/rpc";
import type { AnalyzeResult } from "../workers/analysis.worker";

/**
 * AudioPipeline adapter: native decode/resample on main thread (async APIs),
 * then all DSP inside the analysis worker. The worker is created lazily on
 * first use and reused afterwards (spawn cost paid once).
 */
export class WorkerAudioPipeline implements AudioPipeline {
  private worker: Worker | null = null;

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL("../workers/analysis.worker.ts", import.meta.url), {
        type: "module",
      });
    }
    return this.worker;
  }

  async process(
    audio: Blob,
    onProgress?: (p: PipelineProgress) => void,
  ): Promise<Result<PipelineOutput>> {
    onProgress?.({ stage: "decoding" });
    const decoded = await decodeToMono16k(audio);
    if (!decoded.ok) return decoded;

    onProgress?.({ stage: "resampling" });
    try {
      const result = await callWorker<"analyze", { pcm: Float32Array }, AnalyzeResult>(
        this.getWorker(),
        "analyze",
        { pcm: decoded.value },
        {
          transfer: [decoded.value.buffer],
          onProgress: (stage) => onProgress?.({ stage: stage as PipelineStage }),
          timeoutMs: 60_000,
        },
      );
      if (result.segments.length === 0) {
        return err({ code: "analysis/no-vocalization", message: "No vocalization detected" });
      }
      return ok({
        segments: result.segments,
        bestSegmentPcm: result.bestSegmentPcm,
        recordingDurationS: result.recordingDurationS,
      });
    } catch (e) {
      return err({ code: "pipeline/worker-failed", message: "Audio analysis failed", cause: e });
    }
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
