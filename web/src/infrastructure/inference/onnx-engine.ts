import type { InferenceEngine, InferenceInput } from "@/application/ports/inference-engine";
import { buildClassification, type Classification } from "@/domain/analysis/classification";
import { applyCatPriors } from "@/domain/analysis/cat-priors";
import { applyUnknownPolicy } from "@/domain/analysis/contract";
import { isVocalizationClass } from "@/domain/analysis/vocalization";
import { err, ok, type Result } from "@/domain/shared/result";
import { getCachedModel } from "./model-cache";

/**
 * Published next to each exported model. Versioning the IO contract here means
 * shipping a new model NEVER requires a frontend release, and an old frontend
 * refuses (gracefully) to load an incompatible manifest.
 */
export interface ModelManifest {
  readonly schemaVersion: 1;
  readonly modelVersion: string;
  readonly fileName: string;
  readonly classes: readonly string[];
  readonly input: {
    readonly kind: "log-mel";
    readonly sampleRate: 16000;
    readonly nMels: number;
    readonly nFrames: number;
    readonly windowS: number;
  };
}

/**
 * ONNX Runtime Web engine.
 *
 * Decisions:
 * - onnxruntime-web is imported DYNAMICALLY: ~5 MB of WASM never touches the
 *   landing bundle, and users who never analyze never download it.
 * - WASM+SIMD is the default execution provider (universal, incl. iOS Safari);
 *   WebGPU is attempted first where available — progressive enhancement.
 * - Model bytes come from the IndexedDB cache (offline-capable re-runs).
 */
export class OnnxEngine implements InferenceEngine {
  readonly id = "cnn-onnx";

  private session: import("onnxruntime-web").InferenceSession | null = null;
  private manifest: ModelManifest | null = null;
  private loading: Promise<Result<void>> | null = null;

  constructor(private readonly modelBaseUrl: string) {}

  get modelVersion(): string {
    return this.manifest?.modelVersion ?? "unloaded";
  }

  ready(): Promise<Result<void>> {
    this.loading ??= this.load();
    return this.loading;
  }

  private async load(): Promise<Result<void>> {
    try {
      const manifestRes = await fetch(`${this.modelBaseUrl}/manifest.json`);
      if (!manifestRes.ok) {
        return err({ code: "model/manifest-unavailable", message: "No model manifest" });
      }
      const manifest = (await manifestRes.json()) as ModelManifest;
      if (manifest.schemaVersion !== 1 || manifest.input.kind !== "log-mel") {
        return err({ code: "model/incompatible", message: "Unsupported manifest schema" });
      }
      this.manifest = manifest;

      const ort = await import("onnxruntime-web");
      const bytes = await getCachedModel(
        `${this.modelBaseUrl}/${manifest.fileName}`,
        manifest.modelVersion,
      );

      const providers: string[] = [];
      if (typeof navigator !== "undefined" && "gpu" in navigator) providers.push("webgpu");
      providers.push("wasm");

      this.session = await ort.InferenceSession.create(new Uint8Array(bytes), {
        executionProviders: providers,
      });
      return ok(undefined);
    } catch (e) {
      return err({ code: "model/load-failed", message: "Model load failed", cause: e });
    }
  }

  async classify(input: InferenceInput): Promise<Result<Classification>> {
    const readyRes = await this.ready();
    if (!readyRes.ok) return readyRes;
    const session = this.session;
    const manifest = this.manifest;
    if (!session || !manifest) {
      return err({ code: "model/not-loaded", message: "Engine not initialized" });
    }

    try {
      const ort = await import("onnxruntime-web");
      const { logMel } = await import("./log-mel");
      const mel = logMel(input.pcm, manifest.input.nMels, manifest.input.nFrames);

      const tensor = new ort.Tensor("float32", mel, [
        1,
        1,
        manifest.input.nMels,
        manifest.input.nFrames,
      ]);
      const inputName = session.inputNames[0] ?? "input";
      const outputName = session.outputNames[0] ?? "probs";
      const outputs = await session.run({ [inputName]: tensor });
      const probs = outputs[outputName]?.data as Float32Array | undefined;
      if (!probs) return err({ code: "model/bad-output", message: "Missing output tensor" });

      const scores = manifest.classes.map((cls, i) => ({
        cls: isVocalizationClass(cls) ? cls : ("unknown" as const),
        probability: probs[i] ?? 0,
      }));
      // Blend per-cat priors (no-op when absent/uniform). The CNN/MLP has no
      // `unknown` output; the contract's unknown policy converts low-certainty
      // outputs into an honest `unknown` primary.
      const finalScores = input.priors ? applyCatPriors(scores, input.priors) : scores;
      return ok(applyUnknownPolicy(buildClassification(finalScores, this.id, manifest.modelVersion)));
    } catch (e) {
      return err({ code: "model/inference-failed", message: "Inference failed", cause: e });
    }
  }

  dispose(): void {
    void this.session?.release();
    this.session = null;
    this.loading = null;
  }
}
