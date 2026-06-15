import type { InferenceEngine } from "@/application/ports/inference-engine";
import { HeuristicEngine } from "./heuristic-engine";
import { OnnxEngine } from "./onnx-engine";

/**
 * Engine selection with graceful degradation:
 * try the ONNX CNN (if a model manifest is published); fall back to the
 * heuristic engine, which always works. This keeps the product independent
 * of any single ML strategy — a hard product requirement.
 */
export async function selectEngine(): Promise<InferenceEngine> {
  const base = process.env.NEXT_PUBLIC_MODEL_BASE_URL;
  if (base) {
    const onnx = new OnnxEngine(base);
    const readiness = await onnx.ready();
    if (readiness.ok) return onnx;
    onnx.dispose();
  }
  return new HeuristicEngine();
}
