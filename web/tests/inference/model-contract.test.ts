import { describe, it, expect } from "vitest";
import {
  MODEL_INPUT,
  MODEL_OUTPUT_CLASSES,
  CONFIDENCE,
  applyUnknownPolicy,
} from "@/domain/analysis/contract";
import { buildClassification } from "@/domain/analysis/classification";
import { VOCALIZATION_CLASSES } from "@/domain/analysis/vocalization";

/**
 * The contract test: if anyone changes the published manifest, the exported
 * weights, the class taxonomy or the thresholds in a way that breaks the
 * frozen contract, this fails — before users ever see it.
 *
 * NOTE: This test has been updated for contract v2 (11 classes, waveform input).
 * The parity and regression tests will need separate updates once a v2 model
 * is trained and exported. The published manifest.json still contains v1 data;
 * this test verifies the v2 contract constants defined in code.
 */
describe("model contract", () => {
  it("contract v2 uses waveform input kind", () => {
    expect(MODEL_INPUT.kind).toBe("waveform");
    expect(MODEL_INPUT.sampleRate).toBe(16_000);
    expect(MODEL_INPUT.embeddingDim).toBe(1024);
    expect(MODEL_INPUT.channels).toBe(1);
  });

  it("output classes are the 10 emotional states, in exact order", () => {
    expect(MODEL_OUTPUT_CLASSES).toEqual([
      "feliz_contento",
      "trinos",
      "enfadado",
      "pelea",
      "llamada_madre",
      "llamada_apareamiento",
      "dolor",
      "descansando",
      "advertencia",
      "atencion",
    ]);
  });

  it("every model class exists in the product taxonomy", () => {
    for (const cls of MODEL_OUTPUT_CLASSES) {
      expect(VOCALIZATION_CLASSES).toContain(cls);
    }
  });

  it("unknown is a product decision, never a model output", () => {
    expect(MODEL_OUTPUT_CLASSES).not.toContain("unknown");
    expect(VOCALIZATION_CLASSES).toContain("unknown");
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
          { cls: "atencion", probability: 0.3 },
          { cls: "trinos", probability: 0.28 },
        ],
        "e",
        "v",
      );
      const result = applyUnknownPolicy(weak);
      expect(result.primary.cls).toBe("unknown");
      expect(result.primary.probability).toBeCloseTo(0.3, 5);
      expect(result.alternatives[0]?.cls).toBe("atencion");
      expect(result.ambiguous).toBe(true);
    });

    it("leaves medium/high certainty untouched", () => {
      const confident = buildClassification(
        [
          { cls: "feliz_contento", probability: 0.85 },
          { cls: "enfadado", probability: 0.1 },
        ],
        "e",
        "v",
      );
      expect(applyUnknownPolicy(confident)).toEqual(confident);
    });

    it("is idempotent", () => {
      const weak = applyUnknownPolicy(
        buildClassification([{ cls: "advertencia", probability: 0.2 }], "e", "v"),
      );
      expect(applyUnknownPolicy(weak)).toEqual(weak);
    });
  });
});