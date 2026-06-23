import { describe, it, expect } from "vitest";
import { MODEL_INPUT } from "@/domain/analysis/contract";

/**
 * Parity test for the v2 model (YAMNet-based).
 *
 * NOTE: The v2 model uses YAMNet ONNX for feature extraction and a separate
 * classifier head ONNX for inference. The parity pipeline has changed:
 *
 * v1: audio → log-mel (TS) → MLP (TS runner) → probs
 * v2: audio → YAMNet ONNX (ort-web) → 1024-dim embedding → classifier head ONNX → probs
 *
 * This test verifies the v2 contract constants. Full parity testing against
 * the YAMNet ONNX model will be implemented once the model is trained and exported.
 */
describe("model v2 contract parity", () => {
  it("contract v2 input specifies waveform, not log-mel", () => {
    expect(MODEL_INPUT.kind).toBe("waveform");
  });

  it("contract v2 embedding dimension is 1024", () => {
    expect(MODEL_INPUT.embeddingDim).toBe(1024);
  });

  it("contract v2 YAMNet frame and hop sizes are correct", () => {
    expect(MODEL_INPUT.yamnetFrameS).toBe(0.96);
    expect(MODEL_INPUT.yamnetHopS).toBe(0.48);
  });

  it("contract v2 smoothing window is 3.0 seconds", () => {
    expect(MODEL_INPUT.smoothingWindowS).toBe(3.0);
  });
});