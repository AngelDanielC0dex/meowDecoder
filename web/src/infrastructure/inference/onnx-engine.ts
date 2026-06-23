import type { InferenceEngine, InferenceInput } from "@/application/ports/inference-engine";
import { buildClassification, type Classification } from "@/domain/analysis/classification";
import { applyCatPriors } from "@/domain/analysis/cat-priors";
import { applyUnknownPolicy, MODEL_INPUT } from "@/domain/analysis/contract";
import { isVocalizationClass } from "@/domain/analysis/vocalization";
import { err, ok, type Result } from "@/domain/shared/result";
import { getCachedModel } from "./model-cache";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrtSession = any;

/**
 * Published next to each exported model. Versioning the IO contract here means
 * shipping a new model NEVER requires a frontend release, and an old frontend
 * refuses (gracefully) to load an incompatible manifest.
 *
 * v2: YAMNet transfer learning. Input is waveform (not log-mel).
 * Two ONNX models: YAMNet (feature extractor) + classifier head (11 classes).
 */
export interface ModelManifest {
  readonly schemaVersion: 2;
  readonly modelVersion: string;
  readonly architecture: "yamnet-transfer-learning";
  readonly headModel: string;
  readonly yamnetModel: string;
  readonly classes: readonly string[];
  readonly input: {
    readonly kind: "waveform";
    readonly sampleRate: 16000;
    readonly channels: 1;
    readonly embeddingDim: 1024;
    readonly yamnetFrameS: 0.96;
    readonly yamnetHopS: 0.48;
  };
  readonly output: {
    readonly kind: "softmax";
    readonly numClasses: 11;
    readonly tensorOutputName: "softmax_logits";
  };
  readonly smoothing: {
    readonly windowS: 3.0;
    readonly emaAlpha: 0.3;
    readonly minConfidence: 0.45;
  };
}

/**
 * ONNX Runtime Web engine — v2 YAMNet transfer learning pipeline.
 *
 * Architecture (two-model split):
 *   1. yamnet.onnx: waveform → 1024-dim embedding (0.48s hop)
 *   2. meow_decoder_head_int8.onnx: embedding → 11-class softmax
 *
 * Temporal smoothing (EMA) accumulates predictions over a 3s window
 * before emitting a final classification. This resolves the "purr
 * ambiguity" (same acoustic signature for happy/drowsy/pain).
 *
 * Load order:
 *   - manifest.json → contract check (schemaVersion, kind)
 *   - yamnet.onnx → feature extractor (cached in IndexedDB)
 *   - meow_decoder_head_int8.onnx → classifier head (cached in IndexedDB)
 */
export class OnnxEngine implements InferenceEngine {
  readonly id = "yamnet-onnx";

  private yamnetSession: OrtSession | null = null;
  private headSession: OrtSession | null = null;
  private manifest: ModelManifest | null = null;
  private loading: Promise<Result<void>> | null = null;

  private emaProbs: Float32Array | null = null;
  private emaFrameCount = 0;

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
      if (manifest.schemaVersion !== 2 || manifest.input.kind !== "waveform") {
        return err({ code: "model/incompatible", message: "Unsupported manifest schema (expected v2 waveform)" });
      }
      this.manifest = manifest;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ort: any = await import("onnxruntime-web");
      const providers: string[] = [];
      if (typeof navigator !== "undefined" && "gpu" in navigator) providers.push("webgpu");
      providers.push("wasm");

      const yamnetBytes = await getCachedModel(
        `${this.modelBaseUrl}/${manifest.yamnetModel}`,
        manifest.modelVersion + "-yamnet",
      );
      this.yamnetSession = await ort.InferenceSession.create(new Uint8Array(yamnetBytes), {
        executionProviders: providers,
      });

      const headBytes = await getCachedModel(
        `${this.modelBaseUrl}/${manifest.headModel}`,
        manifest.modelVersion + "-head",
      );
      this.headSession = await ort.InferenceSession.create(new Uint8Array(headBytes), {
        executionProviders: providers,
      });

      this.emaProbs = new Float32Array(manifest.classes.length);
      this.emaFrameCount = 0;

      return ok(undefined);
    } catch (e) {
      return err({ code: "model/load-failed", message: "Model load failed", cause: e });
    }
  }

  async classify(input: InferenceInput): Promise<Result<Classification>> {
    const readyRes = await this.ready();
    if (!readyRes.ok) return readyRes;
    const yamnetSession = this.yamnetSession;
    const headSession = this.headSession;
    const manifest = this.manifest;
    if (!yamnetSession || !headSession || !manifest) {
      return err({ code: "model/not-loaded", message: "Engine not initialized" });
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ort: any = await import("onnxruntime-web");

      // Step 1: Feed waveform to YAMNet → get 1024-dim embeddings per frame
      const waveTensor = new ort.Tensor("float32", input.pcm, [input.pcm.length]);
      const yamnetInputName = yamnetSession.inputNames[0] ?? "waveform";
      const yamnetOutputs = await yamnetSession.run({ [yamnetInputName]: waveTensor });

      // YAMNet outputs: class_scores, embeddings, spectrogram
      const embeddingsTensor = yamnetOutputs[yamnetSession.outputNames[1] ?? "embeddings"];
      if (!embeddingsTensor) {
        return err({ code: "model/bad-output", message: "Missing YAMNet embeddings" });
      }

      // Step 2: Mean pooling over frames → single 1024-dim vector
      if (!embeddingsTensor || !embeddingsTensor.data) {
        return err({ code: "model/bad-output", message: "Missing YAMNet embeddings data" });
      }
      const embeddings = embeddingsTensor.data as Float32Array;
      const numFrames = embeddingsTensor.dims?.[1] ?? Math.floor(embeddings.length / 1024);
      const embeddingDim = 1024;
      const pooled = new Float32Array(embeddingDim);
      for (let f = 0; f < numFrames; f++) {
        for (let d = 0; d < embeddingDim; d++) {
          pooled[d]! += embeddings[f * embeddingDim + d]! / numFrames;
        }
      }

      // Step 3: Feed pooled embedding to classifier head → 11-class softmax
      const headInput = new ort.Tensor("float32", pooled, [1, embeddingDim]);
      const headInputName = headSession.inputNames[0] ?? "embedding_input";
      const headOutputName = headSession.outputNames[0] ?? "softmax_logits";
      const headOutputs = await headSession.run({ [headInputName]: headInput });
      const headProbs = headOutputs[headOutputName]?.data as Float32Array | undefined;
      if (!headProbs) {
        return err({ code: "model/bad-output", message: "Missing head output tensor" });
      }

      // Step 4: Temporal smoothing (EMA) to resolve purr ambiguity
      const smoothed = this.applyEmaSmoothing(headProbs, manifest.smoothing.emaAlpha, manifest.classes.length);

      // Step 5: Map to vocalization classes and apply unknown policy
      const scores = manifest.classes.map((cls, i) => ({
        cls: isVocalizationClass(cls) ? cls : ("unknown" as const),
        probability: smoothed[i] ?? 0,
      }));

      // Only emit a classification if we have accumulated enough frames
      const minFrames = Math.ceil(manifest.smoothing.windowS / manifest.input.yamnetHopS);
      if (this.emaFrameCount < minFrames) {
        // Not enough data yet — return unknown with low confidence
        const lowScores = manifest.classes.map((cls, i) => ({
          cls: isVocalizationClass(cls) ? cls : ("unknown" as const),
          probability: headProbs[i] ?? 0,
        }));
        const finalScores = input.priors ? applyCatPriors(lowScores, input.priors) : lowScores;
        return ok(applyUnknownPolicy(buildClassification(finalScores, this.id, manifest.modelVersion)));
      }

      const finalScores = input.priors ? applyCatPriors(scores, input.priors) : scores;
      return ok(applyUnknownPolicy(buildClassification(finalScores, this.id, manifest.modelVersion)));
    } catch (e) {
      return err({ code: "model/inference-failed", message: "Inference failed", cause: e });
    }
  }

  private applyEmaSmoothing(frameProbs: Float32Array, alpha: number, numClasses: number): Float32Array {
    if (!this.emaProbs || this.emaProbs.length !== numClasses) {
      this.emaProbs = new Float32Array(numClasses);
      this.emaFrameCount = 0;
    }

    const adjustedAlpha = Math.min(
      (this.emaFrameCount + 1) / (MODEL_INPUT.smoothingWindowS / MODEL_INPUT.yamnetHopS),
      1.0,
    ) * alpha;

    for (let i = 0; i < numClasses; i++) {
      this.emaProbs[i]! = (1 - adjustedAlpha) * this.emaProbs[i]! + adjustedAlpha * (frameProbs[i] ?? 0);
    }
    this.emaFrameCount++;

    // Normalize
    const sum = this.emaProbs.reduce((a, b) => a + b, 0) || 1;
    const normalized = new Float32Array(numClasses);
    for (let i = 0; i < numClasses; i++) {
      normalized[i] = this.emaProbs[i]! / sum;
    }
    return normalized;
  }

  resetSmoothing(): void {
    this.emaProbs = null;
    this.emaFrameCount = 0;
  }

  dispose(): void {
    void this.yamnetSession?.release();
    void this.headSession?.release();
    this.yamnetSession = null;
    this.headSession = null;
    this.loading = null;
    this.emaProbs = null;
    this.emaFrameCount = 0;
  }
}