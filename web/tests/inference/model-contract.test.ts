import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MODEL_INPUT,
  MODEL_OUTPUT_CLASSES,
  CONFIDENCE,
  applyUnknownPolicy,
} from "@/domain/analysis/contract";
import { buildClassification } from "@/domain/analysis/classification";
import { VOCALIZATION_CLASSES } from "@/domain/analysis/vocalization";
import type { ModelManifest } from "@/infrastructure/inference/onnx-engine";
import { loadWeights } from "../helpers/model-runner";

/**
 * The contract test: if anyone changes the published manifest, the exported
 * weights, the class taxonomy or the thresholds in a way that breaks the
 * frozen contract, this fails — before users ever see it.
 */
describe("model contract v1", () => {
  const manifest = JSON.parse(
    readFileSync(join(__dirname, "../../public/models/manifest.json"), "utf8"),
  ) as ModelManifest;

  it("published manifest matches the frozen input contract", () => {
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.input.kind).toBe(MODEL_INPUT.kind);
    expect(manifest.input.sampleRate).toBe(MODEL_INPUT.sampleRate);
    expect(manifest.input.nMels).toBe(MODEL_INPUT.nMels);
    expect(manifest.input.nFrames).toBe(MODEL_INPUT.nFrames);
    expect(manifest.fileName).toMatch(/\.onnx$/);
    expect(manifest.modelVersion.length).toBeGreaterThan(0);
  });

  it("published classes match the frozen output contract, in order", () => {
    expect(manifest.classes).toEqual([...MODEL_OUTPUT_CLASSES]);
    // Every model class must exist in the product taxonomy.
    for (const cls of manifest.classes) {
      expect(VOCALIZATION_CLASSES).toContain(cls);
    }
    // unknown is a product decision, never a model output.
    expect(manifest.classes).not.toContain("unknown");
  });

  it("exported weights fixture agrees with the manifest", () => {
    const w = loadWeights();
    expect(w.modelVersion).toBe(manifest.modelVersion);
    expect(w.classes).toEqual(manifest.classes);
    expect(w.W1.length).toBe(MODEL_INPUT.nMels * 2); // mean‖std pooling
    expect(w.b2.length).toBe(manifest.classes.length);
  });

  it("thresholds are the contract values", () => {
    expect(CONFIDENCE.high).toBe(0.7);
    expect(CONFIDENCE.low).toBe(0.45);
    expect(CONFIDENCE.ambiguityMargin).toBe(0.15);
  });

  describe("unknown policy", () => {
    it("demotes a low-certainty primary to alternative and emits unknown", () => {
      const weak = buildClassification(
        [
          { cls: "meow", probability: 0.3 },
          { cls: "trill", probability: 0.28 },
        ],
        "e",
        "v",
      );
      const result = applyUnknownPolicy(weak);
      expect(result.primary.cls).toBe("unknown");
      expect(result.primary.probability).toBeCloseTo(0.3, 5);
      expect(result.alternatives[0]?.cls).toBe("meow");
      expect(result.ambiguous).toBe(true);
    });

    it("leaves medium/high certainty untouched", () => {
      const confident = buildClassification(
        [
          { cls: "purr", probability: 0.85 },
          { cls: "growl", probability: 0.1 },
        ],
        "e",
        "v",
      );
      expect(applyUnknownPolicy(confident)).toEqual(confident);
    });

    it("is idempotent", () => {
      const weak = applyUnknownPolicy(
        buildClassification([{ cls: "hiss", probability: 0.2 }], "e", "v"),
      );
      expect(applyUnknownPolicy(weak)).toEqual(weak);
    });
  });
});
